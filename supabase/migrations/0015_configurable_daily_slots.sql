alter table public.site_settings
  add column daily_slot_count integer not null default 2
    check (daily_slot_count between 1 and 100);

alter table public.requests
  drop constraint if exists requests_slot_number_check,
  add constraint requests_slot_number_check check (slot_number between 1 and 100);

alter table public.option_slots
  drop constraint if exists option_slots_slot_number_check,
  add constraint option_slots_slot_number_check check (slot_number between 1 and 100);

create or replace function public.create_option_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_daily_slots integer;
begin
  select daily_slot_count into v_daily_slots
  from public.site_settings where id = true;
  if not found then raise exception 'site_settings_not_configured'; end if;

  insert into public.option_slots (option_id, slot_number)
  select new.id, slot_number
  from generate_series(1, v_daily_slots) as slots(slot_number);
  return new;
end
$$;

create function public.get_daily_slot_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_daily_slots integer;
begin
  select daily_slot_count into v_daily_slots from public.site_settings where id = true;
  if not found then raise exception 'site_settings_not_configured'; end if;
  return v_daily_slots;
end
$$;

create function public.admin_set_daily_slot_count(p_daily_slots integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_option_id uuid;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if p_daily_slots is null or p_daily_slots < 1 or p_daily_slots > 100 then
    raise exception 'invalid_daily_slot_count';
  end if;

  perform 1 from public.request_options order by id for update;
  update public.site_settings set daily_slot_count = p_daily_slots where id = true;
  if not found then raise exception 'site_settings_not_configured'; end if;

  insert into public.option_slots (option_id, slot_number)
  select option_row.id, slot_number
  from public.request_options option_row
  cross join generate_series(1, p_daily_slots) as slots(slot_number)
  on conflict (option_id, slot_number) do nothing;

  for v_option_id in
    select id from public.request_options order by id
  loop
    perform public.assign_waiting_requests(v_option_id);
  end loop;
end
$$;

create or replace function public.assign_waiting_requests(p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.option_slots%rowtype;
  v_request public.requests%rowtype;
  v_replaced public.requests%rowtype;
  v_now timestamptz;
  v_daily_slots integer;
begin
  select daily_slot_count into v_daily_slots from public.site_settings where id = true;
  if not found then raise exception 'site_settings_not_configured'; end if;

  v_now := clock_timestamp();
  update public.option_slots
  set current_request_id = null, reserved_at = null, processing_started_at = null, expires_at = null
  where option_id = p_option_id and expires_at <= v_now;

  delete from public.option_slots
  where option_id = p_option_id
    and slot_number > v_daily_slots
    and current_request_id is null
    and expires_at is null;

  for v_request in
    select r.*
    from public.requests r
    join public.user_profiles p on p.user_id = r.auth_user_id
    where r.option_id = p_option_id
      and r.status = 'ordered'
      and p.is_priority
      and not exists (
        select 1 from public.option_slots assigned
        where assigned.current_request_id = r.id
      )
    order by r.created_at, r.id
    for update of r
  loop
    select * into v_slot
    from public.option_slots
    where option_id = p_option_id
      and slot_number <= v_daily_slots
      and current_request_id is null
      and expires_at is null
    order by slot_number
    limit 1
    for update;

    if not found then
      select s.* into v_slot
      from public.option_slots s
      join public.requests occupied on occupied.id = s.current_request_id
      left join public.user_profiles occupied_profile on occupied_profile.user_id = occupied.auth_user_id
      where s.option_id = p_option_id
        and s.slot_number <= v_daily_slots
        and s.current_request_id is not null
        and s.processing_started_at is null
        and s.expires_at is null
        and occupied.status = 'ordered'
        and not coalesce(occupied_profile.is_priority, false)
      order by s.reserved_at desc nulls first, s.slot_number
      limit 1
      for update of s;
      if not found then continue; end if;

      select * into v_replaced from public.requests
      where id = v_slot.current_request_id for update;
      update public.requests
      set slot_number = null, slot_reserved_at = null,
          processing_started_at = null, slot_expires_at = null
      where id = v_replaced.id;
    end if;

    v_now := clock_timestamp();
    update public.option_slots
    set current_request_id = v_request.id, reserved_at = v_now,
        processing_started_at = null, expires_at = null
    where id = v_slot.id;
    update public.requests
    set slot_number = v_slot.slot_number, slot_reserved_at = v_now,
        processing_started_at = null, slot_expires_at = null
    where id = v_request.id;
  end loop;

  for v_slot in
    select * from public.option_slots
    where option_id = p_option_id
      and slot_number <= v_daily_slots
      and current_request_id is null
      and expires_at is null
    order by slot_number
    for update
  loop
    select r.* into v_request
    from public.requests r
    left join public.user_profiles p on p.user_id = r.auth_user_id
    where r.option_id = p_option_id
      and r.status = 'ordered'
      and not exists (
        select 1 from public.option_slots assigned
        where assigned.current_request_id = r.id
      )
    order by coalesce(p.is_priority, false) desc, r.created_at, r.id
    limit 1
    for update of r;

    if not found then continue; end if;

    v_now := clock_timestamp();
    update public.option_slots
    set current_request_id = v_request.id, reserved_at = v_now
    where id = v_slot.id;
    update public.requests
    set slot_number = v_slot.slot_number, slot_reserved_at = v_now,
        processing_started_at = null, slot_expires_at = null
    where id = v_request.id;
  end loop;
end
$$;

create or replace function public.get_request_queue_metrics(p_request_id uuid)
returns table (
  queue_position integer,
  people_ahead integer,
  estimated_slot_at timestamptz,
  slot_reserved boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.requests%rowtype;
  v_waiting public.requests%rowtype;
  v_slot public.option_slots%rowtype;
  v_availability timestamptz[] := array[]::timestamptz[];
  v_available timestamptz;
  v_now timestamptz;
  v_best_index integer;
  v_index integer;
  v_position integer := 0;
  v_target_position integer;
  v_target_eta timestamptz;
  v_daily_slots integer;
begin
  select * into v_request from public.requests where id = p_request_id;
  if not found then raise exception 'not_found'; end if;

  perform 1 from public.request_options where id = v_request.option_id for update;
  perform public.assign_waiting_requests(v_request.option_id);

  select * into v_slot from public.option_slots where current_request_id = p_request_id;
  if found then
    return query select null::integer, null::integer, null::timestamptz, (v_slot.expires_at is null);
    return;
  end if;

  select daily_slot_count into v_daily_slots from public.site_settings where id = true;
  if not found then raise exception 'site_settings_not_configured'; end if;

  v_now := clock_timestamp();
  for v_index in 1..v_daily_slots
  loop
    select * into v_slot
    from public.option_slots
    where option_id = v_request.option_id and slot_number = v_index;
    if not found or v_slot.expires_at <= v_now then
      v_availability := array_append(v_availability, v_now);
    elsif v_slot.expires_at is not null then
      v_availability := array_append(v_availability, greatest(v_slot.expires_at, v_now));
    elsif v_slot.current_request_id is not null then
      v_availability := array_append(v_availability,
        greatest(coalesce(v_slot.reserved_at, v_now), v_now) + interval '24 hours');
    else
      v_availability := array_append(v_availability, v_now);
    end if;
  end loop;

  for v_waiting in
    select r.*
    from public.requests r
    left join public.user_profiles p on p.user_id = r.auth_user_id
    left join public.option_slots assigned on assigned.current_request_id = r.id
    where r.option_id = v_request.option_id and r.status = 'ordered'
      and assigned.id is null
    order by coalesce(p.is_priority, false) desc, r.created_at, r.id
  loop
    v_position := v_position + 1;
    v_best_index := 1;
    for v_index in 2..v_daily_slots
    loop
      if v_availability[v_index] < v_availability[v_best_index] then
        v_best_index := v_index;
      end if;
    end loop;

    v_available := v_availability[v_best_index];
    v_availability[v_best_index] := v_available + interval '24 hours';
    if v_waiting.id = p_request_id then
      v_target_position := v_position;
      v_target_eta := v_available;
      exit;
    end if;
  end loop;

  return query select v_target_position,
    case when v_target_position is null then null else v_target_position - 1 end,
    v_target_eta, false;
end
$$;

create or replace function public.get_option_capacity()
returns table (
  option_id uuid,
  option_key text,
  option_name text,
  accent_colour text,
  outstanding_count integer,
  waiting_count integer,
  reserved_count integer,
  in_progress_count integer,
  is_full boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_daily_slots integer;
begin
  select daily_slot_count into v_daily_slots from public.site_settings where id = true;
  if not found then raise exception 'site_settings_not_configured'; end if;

  return query
  select o.id, o.key, o.name, o.accent_colour,
    count(r.id) filter (where r.status not in ('completed', 'cancelled'))::integer,
    count(r.id) filter (where r.status = 'ordered' and not exists (
      select 1 from public.option_slots s where s.current_request_id = r.id
    ))::integer,
    count(r.id) filter (where r.status = 'ordered' and exists (
      select 1 from public.option_slots s where s.current_request_id = r.id
    ))::integer,
    count(r.id) filter (where r.status = 'in_progress')::integer,
    count(r.id) filter (where r.status not in ('completed', 'cancelled')) >= v_daily_slots * 7
  from public.request_options o
  left join public.requests r on r.option_id = o.id
  where o.active
  group by o.id, o.key, o.name, o.accent_colour, o.sort_order
  order by o.sort_order, o.name;
end
$$;

create or replace function public.create_authenticated_request(
  p_user_id uuid,
  p_name text,
  p_school_email text,
  p_contact text,
  p_school_password text,
  p_school_name text,
  p_school_login_type text,
  p_option_key text,
  p_due date,
  p_token_hash text,
  p_token_enc text,
  p_terms_version integer,
  p_terms_text text,
  p_terms_accepted boolean
) returns table (out_id uuid, out_ticket text, out_option text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opt public.request_options%rowtype;
  v_req public.requests%rowtype;
  v_terms public.terms_settings%rowtype;
  v_maintenance boolean;
  v_outstanding integer;
  v_daily_slots integer;
begin
  if p_user_id is null then raise exception 'account_required'; end if;
  if p_school_email is null or lower(trim(p_school_email)) = lower(trim(p_contact)) then
    raise exception 'school_contact_email_must_differ';
  end if;
  if p_school_login_type not in ('email', 'google', 'microsoft') then
    raise exception 'invalid_school_login_type';
  end if;

  select * into v_opt from public.request_options
  where key = p_option_key and active for update;
  if not found then raise exception 'invalid_option'; end if;

  perform public.assign_waiting_requests(v_opt.id);

  select maintenance_mode, daily_slot_count into v_maintenance, v_daily_slots
  from public.site_settings where id = true for share;
  if not found then raise exception 'site_settings_not_configured'; end if;
  if v_maintenance then raise exception 'maintenance_mode'; end if;

  select * into v_terms from public.terms_settings where id = true for share;
  if not found or v_terms.terms_text = '' then raise exception 'terms_not_configured'; end if;
  if p_terms_accepted is distinct from true then raise exception 'terms_not_accepted'; end if;
  if p_terms_version is distinct from v_terms.version or p_terms_text is distinct from v_terms.terms_text then
    raise exception 'terms_changed';
  end if;

  select count(*) into v_outstanding from public.requests r
  where r.option_id = v_opt.id and r.status not in ('completed', 'cancelled');
  if v_outstanding >= v_daily_slots * 7 then raise exception 'option_full'; end if;

  if exists (
    select 1 from public.requests r
    where lower(r.gmail_email) = lower(p_school_email) and r.option_id = v_opt.id
      and r.status not in ('completed', 'cancelled')
  ) then raise exception 'duplicate_request'; end if;

  insert into public.requests (
    auth_user_id, customer_name, gmail_email, contact_email, service_password,
    school_name, school_login_type, option_id, due_date, tracking_token_hash,
    tracking_token_enc, terms_version, terms_text
  )
  values (
    p_user_id, p_name, p_school_email, p_contact, p_school_password,
    p_school_name, p_school_login_type, v_opt.id, p_due, p_token_hash,
    p_token_enc, v_terms.version, v_terms.terms_text
  )
  returning * into v_req;

  insert into public.status_history (request_id, previous_status, new_status)
  values (v_req.id, null, 'ordered');

  perform public.assign_waiting_requests(v_opt.id);
  return query select v_req.id, v_req.ticket_reference, v_opt.name;
end
$$;

revoke execute on function public.get_daily_slot_count() from public;
grant execute on function public.get_daily_slot_count() to anon, authenticated;

revoke execute on function public.admin_set_daily_slot_count(integer) from public, anon, authenticated;
grant execute on function public.admin_set_daily_slot_count(integer) to authenticated;

revoke execute on function public.create_authenticated_request(uuid,text,text,text,text,text,text,text,date,text,text,integer,text,boolean)
  from public, anon, authenticated;
grant execute on function public.create_authenticated_request(uuid,text,text,text,text,text,text,text,date,text,text,integer,text,boolean)
  to service_role;

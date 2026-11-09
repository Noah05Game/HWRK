alter table public.requests
  add column slot_number smallint check (slot_number between 1 and 2),
  add column slot_reserved_at timestamptz,
  add column processing_started_at timestamptz,
  add column slot_expires_at timestamptz;

create index requests_option_outstanding_idx on public.requests (option_id)
  where status not in ('completed', 'cancelled');
create index requests_option_queue_idx on public.requests (option_id, created_at, id) where status = 'ordered';

create table public.option_slots (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.request_options (id) on delete cascade,
  slot_number smallint not null check (slot_number between 1 and 2),
  current_request_id uuid unique references public.requests (id) on delete set null,
  reserved_at timestamptz,
  processing_started_at timestamptz,
  expires_at timestamptz,
  unique (option_id, slot_number)
);

insert into public.option_slots (option_id, slot_number)
select o.id, s.slot_number
from public.request_options o
cross join generate_series(1, 2) as s(slot_number);

create function public.create_option_slots()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.option_slots (option_id, slot_number)
  values (new.id, 1), (new.id, 2);
  return new;
end $$;
create trigger request_options_create_slots after insert on public.request_options
  for each row execute function public.create_option_slots();

with ranked as (
  select r.id, r.option_id, r.updated_at,
    row_number() over (partition by r.option_id order by r.created_at, r.id) as slot_number
  from public.requests r
  where r.status = 'in_progress'
), assigned as (
  select r.*, s.id as option_slot_id
  from ranked r
  join public.option_slots s on s.option_id = r.option_id and s.slot_number = r.slot_number
  where r.slot_number <= 2
)
update public.option_slots s
set current_request_id = a.id, reserved_at = a.updated_at, processing_started_at = a.updated_at,
    expires_at = a.updated_at + interval '24 hours'
from assigned a
where s.id = a.option_slot_id;

with ranked as (
  select r.id, r.updated_at, s.slot_number,
    row_number() over (partition by r.option_id order by r.created_at, r.id) as assigned_number
  from public.requests r
  join public.option_slots s on s.current_request_id = r.id
  where r.status = 'in_progress'
)
update public.requests r
set slot_number = ranked.slot_number, slot_reserved_at = ranked.updated_at,
    processing_started_at = ranked.updated_at, slot_expires_at = ranked.updated_at + interval '24 hours'
from ranked
where r.id = ranked.id;

alter table public.option_slots enable row level security;
create policy admin_select_option_slots on public.option_slots for select to authenticated
  using (public.is_admin());
revoke all on public.option_slots from public, anon, authenticated;
grant select on public.option_slots to authenticated;
grant select (slot_number, slot_reserved_at, processing_started_at, slot_expires_at)
  on public.requests to authenticated;

create or replace function public.assign_waiting_requests(p_option_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_slot public.option_slots%rowtype;
  v_request public.requests%rowtype;
  v_now timestamptz;
begin
  v_now := clock_timestamp();
  update public.option_slots
  set current_request_id = null, reserved_at = null, processing_started_at = null, expires_at = null
  where option_id = p_option_id and expires_at <= v_now;

  for v_slot in
    select * from public.option_slots
    where option_id = p_option_id and current_request_id is null and expires_at is null
    order by slot_number for update
  loop
    select r.* into v_request
    from public.requests r
    where r.option_id = p_option_id
      and r.status = 'ordered'
      and not exists (
        select 1 from public.option_slots assigned
        where assigned.current_request_id = r.id
      )
    order by r.created_at, r.id
    limit 1
    for update;

    if not found then
      continue;
    end if;

    v_now := clock_timestamp();
    update public.option_slots
    set current_request_id = v_request.id, reserved_at = v_now
    where id = v_slot.id;
    update public.requests
    set slot_number = v_slot.slot_number, slot_reserved_at = v_now,
        processing_started_at = null, slot_expires_at = null
    where id = v_request.id;
  end loop;
end $$;

create or replace function public.process_expired_slots()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_option_id uuid;
begin
  for v_option_id in
    select id from public.request_options order by id for update skip locked
  loop
    perform public.assign_waiting_requests(v_option_id);
  end loop;
end $$;

create or replace function public.create_request(
  p_name text, p_gmail text, p_contact text, p_service_password text,
  p_option_key text, p_due date, p_token_hash text, p_token_enc text,
  p_terms_version integer, p_terms_text text, p_terms_accepted boolean
) returns table (out_id uuid, out_ticket text, out_option text)
language plpgsql security definer set search_path = public as $$
declare
  v_opt public.request_options%rowtype;
  v_req public.requests%rowtype;
  v_terms public.terms_settings%rowtype;
  v_maintenance boolean;
  v_outstanding integer;
begin
  select * into v_opt from public.request_options
  where key = p_option_key and active for update;
  if not found then raise exception 'invalid_option'; end if;

  perform public.assign_waiting_requests(v_opt.id);

  select maintenance_mode into v_maintenance
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
  if v_outstanding >= 14 then raise exception 'option_full'; end if;

  if exists (
    select 1 from public.requests r
    where lower(r.gmail_email) = lower(p_gmail) and r.option_id = v_opt.id
      and r.status not in ('completed', 'cancelled')
  ) then raise exception 'duplicate_request'; end if;

  insert into public.requests (customer_name, gmail_email, contact_email, service_password,
                               option_id, due_date, tracking_token_hash, tracking_token_enc,
                               terms_version, terms_text)
  values (p_name, p_gmail, p_contact, p_service_password, v_opt.id, p_due, p_token_hash, p_token_enc,
          v_terms.version, v_terms.terms_text)
  returning * into v_req;

  insert into public.status_history (request_id, previous_status, new_status)
  values (v_req.id, null, 'ordered');

  perform public.assign_waiting_requests(v_opt.id);
  return query select v_req.id, v_req.ticket_reference, v_opt.name;
end $$;

create or replace function public.get_request_queue_metrics(p_request_id uuid)
returns table (
  queue_position integer,
  people_ahead integer,
  estimated_slot_at timestamptz,
  slot_reserved boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_request public.requests%rowtype;
  v_waiting public.requests%rowtype;
  v_slot public.option_slots%rowtype;
  v_a timestamptz;
  v_b timestamptz;
  v_available timestamptz;
  v_position integer := 0;
  v_target_position integer;
  v_target_eta timestamptz;
begin
  select * into v_request from public.requests where id = p_request_id;
  if not found then raise exception 'not_found'; end if;

  perform 1 from public.request_options where id = v_request.option_id for update;
  perform public.assign_waiting_requests(v_request.option_id);

  select * into v_slot from public.option_slots
  where current_request_id = p_request_id;
  if found then
    return query select null::integer, null::integer, null::timestamptz,
      (v_slot.expires_at is null);
    return;
  end if;

  v_a := clock_timestamp();
  v_b := clock_timestamp();
  for v_slot in
    select * from public.option_slots where option_id = v_request.option_id order by slot_number
  loop
    if v_slot.expires_at is not null then
      v_available := greatest(v_slot.expires_at, clock_timestamp());
    elsif v_slot.current_request_id is not null then
      v_available := greatest(coalesce(v_slot.reserved_at, clock_timestamp()), clock_timestamp()) + interval '24 hours';
    else
      v_available := clock_timestamp();
    end if;
    if v_slot.slot_number = 1 then v_a := v_available; else v_b := v_available; end if;
  end loop;

  for v_waiting in
    select r.* from public.requests r
    left join public.option_slots assigned on assigned.current_request_id = r.id
    where r.option_id = v_request.option_id and r.status = 'ordered'
      and assigned.id is null
    order by r.created_at, r.id
  loop
    v_position := v_position + 1;
    if v_a <= v_b then
      v_available := v_a;
      v_a := v_available + interval '24 hours';
    else
      v_available := v_b;
      v_b := v_available + interval '24 hours';
    end if;
    if v_waiting.id = p_request_id then
      v_target_position := v_position;
      v_target_eta := v_available;
      exit;
    end if;
  end loop;

  return query select v_target_position, case when v_target_position is null then null else v_target_position - 1 end,
    v_target_eta, false;
end $$;

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
language plpgsql security definer set search_path = public as $$
begin
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
    count(r.id) filter (where r.status not in ('completed', 'cancelled')) >= 14
  from public.request_options o
  left join public.requests r on r.option_id = o.id
  where o.active
  group by o.id, o.key, o.name, o.accent_colour, o.sort_order
  order by o.sort_order, o.name;
end $$;

create or replace function public.change_request_status(p_id uuid, p_status public.request_status, p_admin uuid)
returns public.request_status language plpgsql security definer set search_path = public as $$
declare
  v_prev public.request_status;
  v_option_id uuid;
  v_slot public.option_slots%rowtype;
  v_now timestamptz;
begin
  select option_id into v_option_id from public.requests where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform 1 from public.request_options where id = v_option_id for update;
  select status into v_prev from public.requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_prev = p_status then return null; end if;

  perform public.assign_waiting_requests(v_option_id);

  if v_prev = 'ordered' and p_status = 'in_progress' then
    select * into v_slot from public.option_slots
    where current_request_id = p_id for update;
    if not found or v_slot.expires_at is not null then raise exception 'slot_not_reserved'; end if;
    v_now := clock_timestamp();
    update public.option_slots set processing_started_at = v_now, expires_at = v_now + interval '24 hours'
    where id = v_slot.id;
    update public.requests set processing_started_at = v_now, slot_expires_at = v_now + interval '24 hours'
    where id = p_id;
  elsif p_status = 'cancelled' and v_prev = 'ordered' then
    update public.option_slots
    set current_request_id = null, reserved_at = null, processing_started_at = null, expires_at = null
    where current_request_id = p_id and expires_at is null;
  elsif not (v_prev = 'in_progress' and p_status in ('completed', 'cancelled')) then
    raise exception 'invalid_status_transition';
  end if;

  update public.requests set status = p_status where id = p_id;
  insert into public.status_history (request_id, previous_status, new_status, changed_by)
  values (p_id, v_prev, p_status, p_admin);

  perform public.assign_waiting_requests(v_option_id);
  return v_prev;
end $$;

create or replace function public.admin_manage_option_slot(
  p_slot_id uuid, p_action text, p_expires_at timestamptz default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_option_id uuid;
  v_request_id uuid;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  select option_id into v_option_id from public.option_slots where id = p_slot_id;
  if not found then raise exception 'slot_not_found'; end if;
  perform 1 from public.request_options where id = v_option_id for update;

  select current_request_id into v_request_id from public.option_slots where id = p_slot_id for update;
  if p_action = 'release' then
    if exists (
      select 1 from public.option_slots
      where id = p_slot_id and current_request_id is not null
        and processing_started_at is null and expires_at is null
    ) then raise exception 'cancel_reserved_request'; end if;
    update public.requests set slot_expires_at = clock_timestamp()
    where id = v_request_id and processing_started_at is not null;
    update public.option_slots
    set current_request_id = null, reserved_at = null, processing_started_at = null, expires_at = null
    where id = p_slot_id;
  elsif p_action = 'adjust_expiry' and p_expires_at is not null then
    update public.option_slots set expires_at = p_expires_at where id = p_slot_id
      and processing_started_at is not null;
    if not found then raise exception 'slot_not_in_progress'; end if;
    update public.requests set slot_expires_at = p_expires_at where id = v_request_id;
  else
    raise exception 'invalid_slot_action';
  end if;

  perform public.assign_waiting_requests(v_option_id);
end $$;

create or replace function public.delete_request(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_option_id uuid;
  v_deleted boolean;
begin
  select option_id into v_option_id from public.requests where id = p_id;
  if not found then return false; end if;
  perform 1 from public.request_options where id = v_option_id for update;
  delete from public.requests where id = p_id returning true into v_deleted;
  perform public.assign_waiting_requests(v_option_id);
  return coalesce(v_deleted, false);
end $$;

revoke execute on function public.create_request(text,text,text,text,text,date,text,text,integer,text,boolean)
  from public, anon, authenticated;
grant execute on function public.create_request(text,text,text,text,text,date,text,text,integer,text,boolean)
  to service_role;
revoke execute on function public.assign_waiting_requests(uuid) from public, anon, authenticated;
revoke execute on function public.process_expired_slots() from public, anon, authenticated;
grant execute on function public.process_expired_slots() to service_role;
revoke execute on function public.get_request_queue_metrics(uuid) from public, anon, authenticated;
grant execute on function public.get_request_queue_metrics(uuid) to service_role;
revoke execute on function public.get_option_capacity() from public;
grant execute on function public.get_option_capacity() to anon, authenticated;
revoke execute on function public.change_request_status(uuid, public.request_status, uuid)
  from public, anon, authenticated;
grant execute on function public.change_request_status(uuid, public.request_status, uuid) to service_role;
revoke execute on function public.admin_manage_option_slot(uuid, text, timestamptz) from public, anon;
grant execute on function public.admin_manage_option_slot(uuid, text, timestamptz) to authenticated;
revoke execute on function public.delete_request(uuid) from public, anon, authenticated;
grant execute on function public.delete_request(uuid) to service_role;

create extension if not exists pg_cron with schema pg_catalog;
do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'hwrk-expire-request-slots';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'hwrk-expire-request-slots',
    '* * * * *',
    'select public.process_expired_slots()'
  );
end $$;

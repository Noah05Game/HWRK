alter table public.user_profiles
  add column is_priority boolean not null default false;

create table public.account_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  account_email text not null,
  school_email text,
  banned_by uuid references auth.users (id) on delete set null,
  banned_at timestamptz not null default now(),
  unbanned_by uuid references auth.users (id) on delete set null,
  unbanned_at timestamptz
);

create unique index account_bans_active_user_idx on public.account_bans (user_id)
  where user_id is not null and unbanned_at is null;
create index account_bans_account_email_idx on public.account_bans (lower(account_email));
create index account_bans_school_email_idx on public.account_bans (lower(school_email))
  where school_email is not null;
alter table public.account_bans enable row level security;
revoke all on public.account_bans from public, anon, authenticated;

create function public.reject_banned_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and exists (
    select 1 from public.account_bans b
    where b.unbanned_at is null
      and (b.user_id = new.id or
        lower(b.account_email) in (lower(coalesce(new.email, '')), lower(coalesce(old.email, '')))
        or lower(coalesce(b.school_email, '')) in (lower(coalesce(new.email, '')), lower(coalesce(old.email, '')))
      )
  ) then
    raise exception 'account_banned';
  elsif tg_op = 'INSERT' and exists (
    select 1 from public.account_bans b
    where b.unbanned_at is null
      and (b.user_id = new.id
        or
        lower(b.account_email) = lower(coalesce(new.email, ''))
        or lower(coalesce(b.school_email, '')) = lower(coalesce(new.email, ''))
      )
  ) then
    raise exception 'account_banned';
  end if;
  return new;
end
$$;

create trigger auth_users_reject_banned
before insert or update on auth.users
for each row execute function public.reject_banned_auth_user();

create function public.reject_banned_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_email text;
begin
  select email into v_account_email from auth.users where id = new.user_id;
  if exists (
    select 1
    from public.account_bans b
    where b.unbanned_at is null
      and (b.user_id = new.user_id or
      lower(b.account_email) in (lower(coalesce(v_account_email, '')), lower(new.school_email))
      or lower(coalesce(b.school_email, '')) in (lower(coalesce(v_account_email, '')), lower(new.school_email))
      )
  ) then
    raise exception 'account_banned';
  end if;
  return new;
end
$$;

create trigger user_profiles_reject_banned
before insert or update of school_email on public.user_profiles
for each row execute function public.reject_banned_profile_email();

create function public.reject_banned_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is not null and exists (
    select 1
    from public.account_bans b
    where b.unbanned_at is null
      and (b.user_id = new.auth_user_id
      or lower(b.account_email) in (
        lower(coalesce(new.contact_email, '')), lower(coalesce(new.gmail_email, ''))
      )
      or lower(coalesce(b.school_email, '')) in (
        lower(coalesce(new.contact_email, '')), lower(coalesce(new.gmail_email, ''))
      ))
  ) then
    raise exception 'account_banned';
  end if;
  return new;
end
$$;

create trigger requests_reject_banned
before insert on public.requests
for each row execute function public.reject_banned_request();

create function public.is_account_banned(
  p_user_id uuid,
  p_account_email text,
  p_school_email text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.account_bans b
    where b.unbanned_at is null and (
      b.user_id = p_user_id
      or lower(b.account_email) in (lower(coalesce(p_account_email, '')), lower(coalesce(p_school_email, '')))
      or lower(coalesce(b.school_email, '')) in (lower(coalesce(p_account_email, '')), lower(coalesce(p_school_email, '')))
    )
  )
$$;

create or replace function public.is_current_account_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_bans b
    where b.unbanned_at is null and (
      b.user_id = auth.uid()
      or
      lower(b.account_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      or lower(coalesce(b.school_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      or exists (
        select 1 from public.user_profiles p
        where p.user_id = auth.uid()
          and (
            lower(b.account_email) = lower(p.school_email)
            or lower(coalesce(b.school_email, '')) = lower(p.school_email)
          )
    )
      )
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
    and not public.is_current_account_banned()
$$;

create or replace function public.admin_list_accounts()
returns table (
  user_id uuid,
  account_email text,
  school_email text,
  full_name text,
  is_priority boolean,
  is_banned boolean,
  has_direct_ban boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
  select u.id, u.email, p.school_email, p.full_name, coalesce(p.is_priority, false),
    (b.id is not null),
    (direct_ban.id is not null),
    u.created_at
  from auth.users u
  left join public.user_profiles p on p.user_id = u.id
  left join lateral (
    select ab.id
    from public.account_bans ab
    where ab.unbanned_at is null and (ab.user_id = u.id or
      lower(ab.account_email) = lower(coalesce(u.email, ''))
      or lower(coalesce(ab.school_email, '')) = lower(coalesce(u.email, ''))
      or lower(ab.account_email) = lower(coalesce(p.school_email, ''))
      or lower(coalesce(ab.school_email, '')) = lower(coalesce(p.school_email, ''))
    )
    order by ab.banned_at desc
    limit 1
  ) b on true
  left join public.account_bans direct_ban on direct_ban.user_id = u.id and direct_ban.unbanned_at is null
  order by u.created_at desc, u.id;
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
begin
  v_now := clock_timestamp();
  update public.option_slots
  set current_request_id = null, reserved_at = null, processing_started_at = null, expires_at = null
  where option_id = p_option_id and expires_at <= v_now;

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
    where option_id = p_option_id and current_request_id is null and expires_at is null
    order by slot_number
    limit 1
    for update;

    if not found then
      select s.* into v_slot
      from public.option_slots s
      join public.requests occupied on occupied.id = s.current_request_id
      left join public.user_profiles occupied_profile on occupied_profile.user_id = occupied.auth_user_id
      where s.option_id = p_option_id
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
    where option_id = p_option_id and current_request_id is null and expires_at is null
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

  select * into v_slot from public.option_slots where current_request_id = p_request_id;
  if found then
    return query select null::integer, null::integer, null::timestamptz, (v_slot.expires_at is null);
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
    select r.*
    from public.requests r
    left join public.user_profiles p on p.user_id = r.auth_user_id
    left join public.option_slots assigned on assigned.current_request_id = r.id
    where r.option_id = v_request.option_id and r.status = 'ordered'
      and assigned.id is null
    order by coalesce(p.is_priority, false) desc, r.created_at, r.id
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

  return query select v_target_position,
    case when v_target_position is null then null else v_target_position - 1 end,
    v_target_eta, false;
end
$$;

create or replace function public.admin_set_account_priority(p_user_id uuid, p_is_priority boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_option_id uuid;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  update public.user_profiles set is_priority = p_is_priority where user_id = p_user_id;
  if not found then raise exception 'account_profile_not_found'; end if;

  for v_option_id in
    select distinct option_id from public.requests
    where auth_user_id = p_user_id and status = 'ordered'
  loop
    perform 1 from public.request_options where id = v_option_id for update;
    perform public.assign_waiting_requests(v_option_id);
  end loop;
end
$$;

create or replace function public.admin_ban_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_email text;
  v_school_email text;
  v_option_id uuid;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  select email into v_account_email from auth.users where id = p_user_id;
  if not found or v_account_email is null then raise exception 'account_not_found'; end if;
  select school_email into v_school_email from public.user_profiles where user_id = p_user_id;

  insert into public.account_bans (user_id, account_email, school_email, banned_by)
  values (p_user_id, lower(v_account_email), lower(v_school_email), auth.uid())
  on conflict (user_id) where user_id is not null and unbanned_at is null do update
    set account_email = excluded.account_email,
        school_email = excluded.school_email,
        banned_by = excluded.banned_by,
        banned_at = now(),
        unbanned_by = null,
        unbanned_at = null;

  update public.user_profiles set is_priority = false where user_id = p_user_id;
  for v_option_id in
    select distinct option_id from public.requests
    where auth_user_id = p_user_id and status = 'ordered'
  loop
    perform 1 from public.request_options where id = v_option_id for update;
    perform public.assign_waiting_requests(v_option_id);
  end loop;
end
$$;

create or replace function public.admin_unban_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  update public.account_bans
  set unbanned_at = now(), unbanned_by = auth.uid()
  where user_id = p_user_id and unbanned_at is null;
end
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select (auth_user_id) on public.requests to authenticated';
    execute 'grant execute on function public.is_current_account_banned() to authenticated';
    execute 'grant execute on function public.admin_list_accounts() to authenticated';
    execute 'grant execute on function public.admin_set_account_priority(uuid, boolean) to authenticated';
    execute 'grant execute on function public.admin_ban_account(uuid) to authenticated';
    execute 'grant execute on function public.admin_unban_account(uuid) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.is_account_banned(uuid, text, text) to service_role';
  end if;
end
$$;

revoke all on function public.admin_list_accounts() from public, anon;
revoke all on function public.admin_set_account_priority(uuid, boolean) from public, anon;
revoke all on function public.admin_ban_account(uuid) from public, anon;
revoke all on function public.admin_unban_account(uuid) from public, anon;
revoke all on function public.is_current_account_banned() from public, anon;
revoke all on function public.is_account_banned(uuid, text, text) from public, anon, authenticated;
revoke all on function public.reject_banned_auth_user() from public, anon, authenticated;
revoke all on function public.reject_banned_profile_email() from public, anon, authenticated;
revoke all on function public.reject_banned_request() from public, anon, authenticated;

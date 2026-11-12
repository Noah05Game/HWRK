create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 100),
  school_email text not null check (char_length(school_email) between 3 and 254),
  school_password text not null check (char_length(school_password) between 1 and 256),
  school_name text not null check (char_length(school_name) between 1 and 120),
  school_login_type text not null check (school_login_type in ('email', 'google', 'microsoft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_profiles_touch_updated_at
before update on public.user_profiles
for each row execute function public.touch_updated_at();

alter table public.user_profiles enable row level security;
create policy users_select_own_profile on public.user_profiles for select to authenticated
  using (auth.uid() = user_id);
create policy users_insert_own_profile on public.user_profiles for insert to authenticated
  with check (
    auth.uid() = user_id
    and lower(school_email) <> lower(coalesce(auth.jwt() ->> 'email', ''))
  );
create policy users_update_own_profile on public.user_profiles for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and lower(school_email) <> lower(coalesce(auth.jwt() ->> 'email', ''))
  );
revoke all on public.user_profiles from public, anon, authenticated;
grant select, insert, update on public.user_profiles to authenticated;

create table public.personal_google_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_subject text not null unique,
  email text not null,
  verified_at timestamptz not null default now()
);

alter table public.personal_google_accounts enable row level security;
create policy users_select_own_google_verification on public.personal_google_accounts for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.personal_google_accounts from public, anon, authenticated;
grant select on public.personal_google_accounts to authenticated;

alter table public.requests
  add column auth_user_id uuid references auth.users (id) on delete set null,
  add column school_name text not null default '',
  add column school_login_type text not null default ''
    check (school_login_type in ('', 'email', 'google', 'microsoft'));

grant select (school_name, school_login_type) on public.requests to authenticated;

create function public.create_authenticated_request(
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
language plpgsql security definer set search_path = public as $$
declare
  v_opt public.request_options%rowtype;
  v_req public.requests%rowtype;
  v_terms public.terms_settings%rowtype;
  v_maintenance boolean;
  v_outstanding integer;
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
end $$;

revoke execute on function public.create_request(text,text,text,text,text,date,text,text,integer,text,boolean)
  from service_role;
revoke execute on function public.create_authenticated_request(uuid,text,text,text,text,text,text,text,date,text,text,integer,text,boolean)
  from public, anon, authenticated;
grant execute on function public.create_authenticated_request(uuid,text,text,text,text,text,text,text,date,text,text,integer,text,boolean)
  to service_role;

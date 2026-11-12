create table public.prohibited_ips (
  ip_address inet primary key,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users (id) on delete set null,
  constraint prohibited_ips_exact_address check (
    masklen(ip_address) = case family(ip_address) when 4 then 32 else 128 end
  )
);
alter table public.prohibited_ips enable row level security;
revoke all on public.prohibited_ips from public, anon, authenticated;

create table public.site_analytics_daily (
  day date primary key,
  page_views bigint not null default 0 check (page_views >= 0),
  request_submissions bigint not null default 0 check (request_submissions >= 0)
);
alter table public.site_analytics_daily enable row level security;
revoke all on public.site_analytics_daily from public, anon, authenticated;

create function public.is_prohibited_ip(p_ip inet)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.prohibited_ips where ip_address = p_ip
  )
$$;

create function public.record_site_page_view()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.site_analytics_daily as daily (day, page_views)
  values ((now() at time zone 'UTC')::date, 1)
  on conflict (day) do update
    set page_views = daily.page_views + 1;
end
$$;

create function public.record_site_request_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.site_analytics_daily as daily (day, request_submissions)
  values ((now() at time zone 'UTC')::date, 1)
  on conflict (day) do update
    set request_submissions = daily.request_submissions + 1;
  return new;
end
$$;
create trigger requests_count_aggregate_submission
after insert on public.requests
for each row execute function public.record_site_request_submission();

create function public.admin_list_prohibited_ips()
returns table (ip_address text, added_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
    select host(p.ip_address)::text, p.added_at
    from public.prohibited_ips p
    order by p.added_at desc, host(p.ip_address);
end
$$;

create function public.admin_add_prohibited_ip(p_ip inet)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if masklen(p_ip) <> (case family(p_ip) when 4 then 32 else 128 end) then
    raise exception 'enter_single_ip_address';
  end if;
  insert into public.prohibited_ips (ip_address, added_by)
  values (p_ip, auth.uid())
  on conflict (ip_address) do nothing;
end
$$;

create function public.admin_remove_prohibited_ip(p_ip inet)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  delete from public.prohibited_ips where ip_address = p_ip;
end
$$;

create function public.admin_get_site_analytics(p_days integer default 30)
returns table (day date, page_views bigint, request_submissions bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if p_days < 1 or p_days > 365 then raise exception 'invalid_day_range'; end if;
  return query
    select d.day::date,
      coalesce(a.page_views, 0),
      coalesce(a.request_submissions, 0)
    from generate_series(
      ((now() at time zone 'UTC')::date - (p_days - 1)),
      (now() at time zone 'UTC')::date,
      interval '1 day'
    ) as d(day)
    left join public.site_analytics_daily a on a.day = d.day::date
    order by d.day desc;
end
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.admin_list_prohibited_ips() to authenticated';
    execute 'grant execute on function public.admin_add_prohibited_ip(inet) to authenticated';
    execute 'grant execute on function public.admin_remove_prohibited_ip(inet) to authenticated';
    execute 'grant execute on function public.admin_get_site_analytics(integer) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.is_prohibited_ip(inet) to service_role';
    execute 'grant execute on function public.record_site_page_view() to service_role';
  end if;
end
$$;

revoke all on function public.is_prohibited_ip(inet) from public, anon, authenticated;
revoke all on function public.record_site_page_view() from public, anon, authenticated;
revoke all on function public.record_site_request_submission() from public, anon, authenticated;
revoke all on function public.admin_list_prohibited_ips() from public, anon;
revoke all on function public.admin_add_prohibited_ip(inet) from public, anon;
revoke all on function public.admin_remove_prohibited_ip(inet) from public, anon;
revoke all on function public.admin_get_site_analytics(integer) from public, anon;

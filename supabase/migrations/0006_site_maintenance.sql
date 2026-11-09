create table public.site_settings (
  id boolean primary key default true check (id),
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, maintenance_mode)
values (true, false)
on conflict (id) do nothing;

create trigger site_settings_touch_updated_at
before update on public.site_settings
for each row execute function public.touch_updated_at();

alter table public.site_settings enable row level security;
create policy public_read_site_settings on public.site_settings for select to anon, authenticated
  using (true);
create policy admin_update_site_settings on public.site_settings for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.site_settings from public, anon, authenticated;
grant select (id, maintenance_mode, updated_at) on public.site_settings to anon, authenticated;
grant update (maintenance_mode) on public.site_settings to authenticated;

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
begin
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

  select * into v_opt from public.request_options where key = p_option_key and active;
  if not found then raise exception 'invalid_option'; end if;

  if exists (select 1 from public.requests r
             where lower(r.gmail_email) = lower(p_gmail) and r.option_id = v_opt.id and r.status <> 'completed') then
    raise exception 'duplicate_request';
  end if;

  insert into public.requests (customer_name, gmail_email, contact_email, service_password,
                               option_id, due_date, tracking_token_hash, tracking_token_enc,
                               terms_version, terms_text)
  values (p_name, p_gmail, p_contact, p_service_password, v_opt.id, p_due, p_token_hash, p_token_enc,
          v_terms.version, v_terms.terms_text)
  returning * into v_req;

  insert into public.status_history (request_id, previous_status, new_status) values (v_req.id, null, 'ordered');

  return query select v_req.id, v_req.ticket_reference, v_opt.name;
end $$;

revoke execute on function public.create_request(text, text, text, text, text, date, text, text, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.create_request(text, text, text, text, text, date, text, text, integer, text, boolean)
  to service_role;

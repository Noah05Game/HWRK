alter table public.requests
  add column terms_version integer,
  add column terms_text text,
  add constraint requests_terms_acceptance_check check (
    (terms_version is null and terms_text is null)
    or (terms_version > 0 and terms_text is not null and char_length(terms_text) between 1 and 20000)
  );

create table public.terms_settings (
  id boolean primary key default true check (id),
  terms_text text not null default ''
    check (terms_text = '' or (char_length(terms_text) <= 20000 and char_length(btrim(terms_text, E' \t\n\r')) > 0)),
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

insert into public.terms_settings (id, terms_text, version)
values (true, '', 0)
on conflict (id) do nothing;

create function public.bump_terms_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.terms_text is distinct from old.terms_text then
    new.version := old.version + 1;
    new.updated_at := now();
  else
    new.version := old.version;
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

create trigger terms_settings_version_before_update
before update on public.terms_settings
for each row execute function public.bump_terms_version();

revoke execute on function public.bump_terms_version() from public, anon, authenticated;

alter table public.terms_settings enable row level security;
create policy public_read_terms_settings on public.terms_settings for select to anon, authenticated
  using (true);
create policy admin_update_terms_settings on public.terms_settings for update to authenticated
  using (public.is_admin())
  with check (public.is_admin() and terms_text <> '' and char_length(btrim(terms_text, E' \t\n\r')) > 0);

revoke all on public.terms_settings from public, anon, authenticated;
grant select (id, terms_text, version, updated_at) on public.terms_settings to anon, authenticated;
grant update (terms_text) on public.terms_settings to authenticated;
grant select (terms_version, terms_text) on public.requests to authenticated;

drop function if exists public.create_request(text, text, text, text, text, date, text, text);

create function public.create_request(
  p_name text, p_gmail text, p_contact text, p_service_password text,
  p_option_key text, p_due date, p_token_hash text, p_token_enc text,
  p_terms_version integer, p_terms_text text, p_terms_accepted boolean
) returns table (out_id uuid, out_ticket text, out_option text)
language plpgsql security definer set search_path = public as $$
declare
  v_opt public.request_options%rowtype;
  v_req public.requests%rowtype;
  v_terms public.terms_settings%rowtype;
begin
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

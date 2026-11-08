-- HWRK initial schema ------------------------------------------------------

create sequence public.ticket_seq start 1;
create type public.request_status as enum ('ordered', 'in_progress', 'completed');

create table public.request_options (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '',
  accent_colour text not null check (accent_colour ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  ticket_reference text not null unique
    default ('HW-' || lpad(nextval('public.ticket_seq')::text, 6, '0')),
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  gmail_email text not null check (char_length(gmail_email) <= 254),
  contact_email text not null check (char_length(contact_email) <= 254),
  service_password text not null,
  option_id uuid not null references public.request_options (id),
  due_date date not null,
  status public.request_status not null default 'ordered',
  tracking_token_hash text not null unique,
  tracking_token_enc text not null,        -- AES-GCM encrypted so the server can rebuild email links
  admin_notes text not null default '' check (char_length(admin_notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_status_idx on public.requests (status);
create index requests_created_idx on public.requests (created_at desc);
create index requests_due_idx on public.requests (due_date);
create index requests_gmail_idx on public.requests (lower(gmail_email));

create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  previous_status public.request_status,
  new_status public.request_status not null,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index status_history_request_idx on public.status_history (request_id, changed_at);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  email_type text not null check (email_type in ('request_created', 'request_in_progress', 'request_completed', 'request_issue')),
  recipient text not null,
  delivery_status text not null check (delivery_status in ('sent', 'failed')),
  error_message text,
  attempts int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index email_logs_request_idx on public.email_logs (request_id, created_at desc);

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (key, window_start)
);

-- updated_at -------------------------------------------------------------
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger requests_touch before update on public.requests
  for each row execute function public.touch_updated_at();
create trigger email_logs_touch before update on public.email_logs
  for each row execute function public.touch_updated_at();

-- Helpers ----------------------------------------------------------------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

create function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_ws timestamptz; v_count int;
begin
  v_ws := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (key, window_start) values (p_key, v_ws)
    on conflict (key, window_start) do update set count = r.count + 1
    returning r.count into v_count;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return v_count <= p_limit;
end $$;

create function public.create_request(
  p_name text, p_gmail text, p_contact text, p_service_password text,
  p_option_key text, p_due date, p_token_hash text, p_token_enc text
) returns table (out_id uuid, out_ticket text, out_option text)
language plpgsql security definer set search_path = public as $$
declare v_opt public.request_options%rowtype; v_req public.requests%rowtype;
begin
  select * into v_opt from public.request_options where key = p_option_key and active;
  if not found then raise exception 'invalid_option'; end if;

  if exists (select 1 from public.requests r
             where lower(r.gmail_email) = lower(p_gmail) and r.option_id = v_opt.id and r.status <> 'completed') then
    raise exception 'duplicate_request';
  end if;

  insert into public.requests (customer_name, gmail_email, contact_email, service_password,
                               option_id, due_date, tracking_token_hash, tracking_token_enc)
  values (p_name, p_gmail, p_contact, p_service_password, v_opt.id, p_due, p_token_hash, p_token_enc)
  returning * into v_req;

  insert into public.status_history (request_id, previous_status, new_status) values (v_req.id, null, 'ordered');

  return query select v_req.id, v_req.ticket_reference, v_opt.name;
end $$;

-- Returns the previous status, or null when nothing changed.
create function public.change_request_status(p_id uuid, p_status public.request_status, p_admin uuid)
returns public.request_status language plpgsql security definer set search_path = public as $$
declare v_prev public.request_status;
begin
  select status into v_prev from public.requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_prev = p_status then return null; end if;
  update public.requests set status = p_status where id = p_id;
  insert into public.status_history (request_id, previous_status, new_status, changed_by)
    values (p_id, v_prev, p_status, p_admin);
  return v_prev;
end $$;

revoke execute on function public.create_request(text,text,text,text,text,date,text,text) from public, anon, authenticated;
revoke execute on function public.change_request_status(uuid, public.request_status, uuid) from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.create_request(text,text,text,text,text,date,text,text) to service_role;
grant execute on function public.change_request_status(uuid, public.request_status, uuid) to service_role;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Row Level Security -----------------------------------------------------
alter table public.request_options enable row level security;
alter table public.requests enable row level security;
alter table public.status_history enable row level security;
alter table public.email_logs enable row level security;
alter table public.admins enable row level security;
alter table public.rate_limits enable row level security;

create policy admin_all_options on public.request_options for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin_select_requests on public.requests for select to authenticated using (public.is_admin());
create policy admin_update_requests on public.requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy admin_select_history on public.status_history for select to authenticated using (public.is_admin());
create policy admin_select_email_logs on public.email_logs for select to authenticated using (public.is_admin());
-- admins and rate_limits have no policies: only the service role can touch them.

-- Column-level privileges: hashes and encrypted tokens are never readable from the browser,
-- and status can only change through the audited Edge Function.
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on public.request_options to authenticated;
grant select (id, ticket_reference, customer_name, gmail_email, contact_email, service_password, option_id,
              due_date, status, admin_notes, created_at, updated_at) on public.requests to authenticated;
grant update (admin_notes) on public.requests to authenticated;
grant select on public.status_history, public.email_logs to authenticated;
revoke all on sequence public.ticket_seq from anon, authenticated;

-- Seed the placeholder options (regenerate from src/config/options.json with `npm run options:sql`)
insert into public.request_options (key, name, description, accent_colour, sort_order) values
  ('option-1', 'Option 1', 'Placeholder description for the first request type.', '#0A84FF', 0),
  ('option-2', 'Option 2', 'Placeholder description for the second request type.', '#30D158', 1),
  ('option-3', 'Option 3', 'Placeholder description for the third request type.', '#FF9F0A', 2),
  ('option-4', 'Option 4', 'Placeholder description for the fourth request type.', '#BF5AF2', 3);

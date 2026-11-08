-- Replace secure-ID validation with a free-text service password.

drop function if exists public.create_request(text, text, text, text, text, text, date, text, text);
drop function if exists public.create_request(text, text, text, text, text, date, text, text);

alter table public.requests
  add column if not exists service_password text not null default '';
alter table public.requests
  drop column if exists secure_id_id,
  drop column if exists secure_id_hash,
  drop column if exists secure_id_hint;
alter table public.requests alter column service_password drop default;
drop table if exists public.secure_ids;

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

revoke execute on function public.create_request(text, text, text, text, text, date, text, text) from public, anon, authenticated;
grant execute on function public.create_request(text, text, text, text, text, date, text, text) to service_role;

grant select (service_password) on public.requests to authenticated;

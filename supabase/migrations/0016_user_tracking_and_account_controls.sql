create function public.cancel_own_request(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_option_id uuid;
  v_request public.requests%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authorized'; end if;

  select option_id into v_option_id
  from public.requests
  where id = p_id and auth_user_id = auth.uid();
  if not found then raise exception 'request_not_found'; end if;

  perform 1 from public.request_options where id = v_option_id for update;
  select * into v_request from public.requests
  where id = p_id and auth_user_id = auth.uid()
  for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_request.status <> 'ordered' then raise exception 'request_not_cancellable'; end if;

  update public.option_slots
  set current_request_id = null, reserved_at = null, processing_started_at = null, expires_at = null
  where current_request_id = p_id and expires_at is null;

  update public.requests set status = 'cancelled' where id = p_id;
  insert into public.status_history (request_id, previous_status, new_status, changed_by)
  values (p_id, 'ordered', 'cancelled', auth.uid());

  perform public.assign_waiting_requests(v_option_id);
  return true;
end
$$;

revoke execute on function public.cancel_own_request(uuid) from public, anon;
grant execute on function public.cancel_own_request(uuid) to authenticated;

alter table public.email_logs
  drop constraint if exists email_logs_email_type_check,
  add constraint email_logs_email_type_check
    check (email_type in ('request_created', 'request_in_progress', 'request_completed', 'request_issue', 'request_cancelled'));

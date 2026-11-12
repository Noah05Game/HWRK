create function public.admin_replace_reserved_slot(
  p_request_id uuid, p_slot_id uuid, p_expected_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_option_id uuid;
  v_target public.requests%rowtype;
  v_replaced public.requests%rowtype;
  v_slot public.option_slots%rowtype;
  v_now timestamptz;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  select option_id into v_option_id
  from public.requests
  where id = p_request_id;
  if not found then raise exception 'request_not_found'; end if;

  perform 1 from public.request_options where id = v_option_id for update;
  if not found then raise exception 'request_not_found'; end if;

  perform public.assign_waiting_requests(v_option_id);

  select * into v_target
  from public.requests
  where id = p_request_id
  for update;
  if not found or v_target.status <> 'ordered' then
    raise exception 'request_not_waiting';
  end if;
  if exists (select 1 from public.option_slots where current_request_id = p_request_id) then
    raise exception 'request_already_assigned';
  end if;

  select * into v_slot
  from public.option_slots
  where id = p_slot_id and option_id = v_option_id
  for update;
  if not found or v_slot.current_request_id is null then
    raise exception 'slot_not_replaceable';
  end if;
  if v_slot.current_request_id is distinct from p_expected_request_id then
    raise exception 'slot_changed';
  end if;
  if v_slot.processing_started_at is not null or v_slot.expires_at is not null then
    raise exception 'slot_not_replaceable';
  end if;

  select * into v_replaced
  from public.requests
  where id = v_slot.current_request_id
  for update;
  if not found or v_replaced.status <> 'ordered' then
    raise exception 'slot_not_replaceable';
  end if;

  v_now := clock_timestamp();
  update public.requests
  set slot_number = null,
      slot_reserved_at = null,
      processing_started_at = null,
      slot_expires_at = null
  where id = v_replaced.id;

  update public.option_slots
  set current_request_id = p_request_id,
      reserved_at = v_now
  where id = v_slot.id;

  update public.requests
  set slot_number = v_slot.slot_number,
      slot_reserved_at = v_now,
      processing_started_at = null,
      slot_expires_at = null
  where id = p_request_id;
end
$$;

revoke execute on function public.admin_replace_reserved_slot(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_replace_reserved_slot(uuid, uuid, uuid) to authenticated;

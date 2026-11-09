create or replace function public.delete_request(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_deleted boolean;
begin
  delete from public.requests where id = p_id
  returning true into v_deleted;
  return coalesce(v_deleted, false);
end $$;

revoke execute on function public.delete_request(uuid) from public, anon, authenticated;
grant execute on function public.delete_request(uuid) to service_role;

drop function if exists public.delete_completed_request(uuid);

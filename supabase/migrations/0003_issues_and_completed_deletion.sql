alter table public.requests
  add column if not exists issue_reason text,
  add column if not exists issue_reported_at timestamptz;

alter table public.requests
  drop constraint if exists requests_issue_reason_check,
  add constraint requests_issue_reason_check
    check (issue_reason is null or char_length(issue_reason) between 1 and 2000);

alter table public.email_logs
  drop constraint if exists email_logs_email_type_check,
  add constraint email_logs_email_type_check
    check (email_type in ('request_created', 'request_in_progress', 'request_completed', 'request_issue'));

grant select (issue_reason, issue_reported_at) on public.requests to authenticated;

create function public.delete_completed_request(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_deleted boolean;
begin
  delete from public.requests where id = p_id and status = 'completed'
  returning true into v_deleted;
  return coalesce(v_deleted, false);
end $$;

revoke execute on function public.delete_completed_request(uuid) from public, anon, authenticated;
grant execute on function public.delete_completed_request(uuid) to service_role;

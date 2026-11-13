import { handler, requireUser } from '../_shared/util.ts';

Deno.serve(handler(async (req, db) => {
  const user = await requireUser(req, db);
  const { data: requests, error: requestError } = await db
    .from('requests')
    .select('id, ticket_reference, status, due_date, created_at, updated_at, issue_reason, issue_reported_at, slot_number, slot_reserved_at, processing_started_at, slot_expires_at, request_options(name, accent_colour)')
    .eq('auth_user_id', user.id)
    .order('created_at', { ascending: false });
  if (requestError || !requests) throw new Error(`Could not load user requests: ${requestError?.message ?? 'No response received'}`);

  const requestIds = requests.map((request) => request.id);
  const historyByRequest = new Map<string, { previousStatus: string | null; newStatus: string; changedAt: string }[]>();
  if (requestIds.length > 0) {
    const { data: history, error: historyError } = await db
      .from('status_history')
      .select('request_id, previous_status, new_status, changed_at')
      .in('request_id', requestIds)
      .order('changed_at');
    if (historyError || !history) throw new Error(`Could not load request history: ${historyError?.message ?? 'No response received'}`);
    for (const entry of history) {
      const entries = historyByRequest.get(entry.request_id) ?? [];
      entries.push({
        previousStatus: entry.previous_status,
        newStatus: entry.new_status,
        changedAt: entry.changed_at,
      });
      historyByRequest.set(entry.request_id, entries);
    }
  }

  return requests.map((request) => {
    const option = Array.isArray(request.request_options) ? request.request_options[0] : request.request_options;
    return {
      id: request.id,
      ticketReference: request.ticket_reference,
      status: request.status,
      optionName: option?.name ?? 'Request',
      accent: option?.accent_colour ?? '#FFFFFF',
      dueDate: request.due_date,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
      issueReason: request.issue_reason,
      issueReportedAt: request.issue_reported_at,
      slotNumber: request.slot_number,
      slotReservedAt: request.slot_reserved_at,
      processingStartedAt: request.processing_started_at,
      slotExpiresAt: request.slot_expires_at,
      history: historyByRequest.get(request.id) ?? [],
    };
  });
}));

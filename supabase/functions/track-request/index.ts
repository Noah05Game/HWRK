import { HttpError, clientKey, handler, rateLimit, readJson, sha256, str } from '../_shared/util.ts';

Deno.serve(handler(async (req, db) => {
  await rateLimit(db, `track:${await clientKey(req)}`, 60, 3600, 'Too many lookups. Try again later.');
  const token = str((await readJson(req)).token, 100);
  const notFound = () => new HttpError(404, 'We could not find this request.', 'not_found');
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) throw notFound();

  const { data, error: requestError } = await db
    .from('requests')
    .select('id, ticket_reference, status, due_date, created_at, updated_at, issue_reason, issue_reported_at, slot_number, slot_reserved_at, processing_started_at, slot_expires_at, option_id, request_options(name, accent_colour)')
    .eq('tracking_token_hash', await sha256(token))
    .maybeSingle();
  if (requestError) throw new Error(`Could not load tracked request: ${requestError.message}`);
  if (!data) throw notFound();

  const { data: metrics, error: metricsError } = await db.rpc('get_request_queue_metrics', { p_request_id: data.id });
  if (metricsError) throw new Error(`Could not load queue details: ${metricsError.message}`);
  const queue = Array.isArray(metrics) ? metrics[0] : metrics;
  const opt = Array.isArray(data.request_options) ? data.request_options[0] : data.request_options;
  // Only these fields ever leave the server: no notes, secure IDs or emails.
  return {
    ticketReference: data.ticket_reference, optionName: opt?.name, accent: opt?.accent_colour,
    status: data.status, dueDate: data.due_date, createdAt: data.created_at, updatedAt: data.updated_at,
    issueReason: data.issue_reason, issueReportedAt: data.issue_reported_at,
    queuePosition: queue?.queue_position ?? null, peopleAhead: queue?.people_ahead ?? null,
    estimatedSlotAt: queue?.estimated_slot_at ?? null, slotReserved: queue?.slot_reserved ?? false,
    slotNumber: data.slot_number, slotReservedAt: data.slot_reserved_at,
    processingStartedAt: data.processing_started_at, slotExpiresAt: data.slot_expires_at,
  };
}));

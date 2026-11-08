import { HttpError, clientKey, handler, rateLimit, readJson, sha256, str } from '../_shared/util.ts';

Deno.serve(handler(async (req, db) => {
  await rateLimit(db, `track:${await clientKey(req)}`, 60, 3600, 'Too many lookups. Try again later.');
  const token = str((await readJson(req)).token, 100);
  const notFound = () => new HttpError(404, 'We could not find this request.', 'not_found');
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) throw notFound();

  const { data } = await db
    .from('requests')
    .select('ticket_reference, status, due_date, created_at, updated_at, request_options(name, accent_colour)')
    .eq('tracking_token_hash', await sha256(token))
    .maybeSingle();
  if (!data) throw notFound();

  const opt = Array.isArray(data.request_options) ? data.request_options[0] : data.request_options;
  // Only these fields ever leave the server: no notes, secure IDs or emails.
  return {
    ticketReference: data.ticket_reference, optionName: opt?.name, accent: opt?.accent_colour,
    status: data.status, dueDate: data.due_date, createdAt: data.created_at, updatedAt: data.updated_at,
  };
}));

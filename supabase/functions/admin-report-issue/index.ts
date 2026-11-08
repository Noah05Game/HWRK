import { HttpError, handler, readJson, requireAdmin, str } from '../_shared/util.ts';
import { REQUEST_COLUMNS, sendRequestEmail } from '../_shared/email.ts';

Deno.serve(handler(async (req, db) => {
  await requireAdmin(req, db);
  const b = await readJson(req);
  const id = str(b.requestId, 64);
  const reason = str(b.reason, 2000);
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'Invalid request.');
  if (!reason || reason.length > 2000) throw new HttpError(400, 'Enter an issue reason of 1 to 2,000 characters.', 'validation', 'reason');

  const { data: updated, error: updateError } = await db.from('requests')
    .update({ issue_reason: reason, issue_reported_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (updateError) throw new Error(`Could not save request issue: ${updateError.message}`);
  if (!updated) throw new HttpError(404, 'Request not found.');

  const { data: full, error: loadError } = await db.from('requests').select(REQUEST_COLUMNS).eq('id', id).single();
  if (loadError || !full) throw new Error(`Could not load request for issue email: ${loadError?.message ?? 'request not found'}`);
  const sent = await sendRequestEmail(db, full, 'request_issue');
  return { email: sent ? 'sent' : 'failed' };
}));

import { HttpError, handler, readJson, requireAdmin, str } from '../_shared/util.ts';
import { REQUEST_COLUMNS, sendRequestEmail } from '../_shared/email.ts';

const EMAIL_FOR: Record<string, 'request_in_progress' | 'request_completed' | undefined> = {
  in_progress: 'request_in_progress', completed: 'request_completed',
};

Deno.serve(handler(async (req, db) => {
  const user = await requireAdmin(req, db);
  const b = await readJson(req);
  const id = str(b.requestId, 64);
  const status = str(b.status, 20);
  if (!/^[0-9a-f-]{36}$/.test(id) || !['in_progress', 'completed', 'cancelled'].includes(status)) {
    throw new HttpError(400, 'Invalid status change.');
  }

  const { data: prev, error } = await db.rpc('change_request_status', { p_id: id, p_status: status, p_admin: user.id });
  if (error) {
    if (error.message.includes('not_found')) throw new HttpError(404, 'Request not found.');
    if (error.message.includes('slot_not_reserved')) throw new HttpError(409, 'Reserve an account slot before starting this request.', 'slot_unavailable');
    if (error.message.includes('invalid_status_transition')) throw new HttpError(409, 'This status change is not allowed.', 'status_transition');
    throw new Error(`change_request_status failed: ${error.message}`);
  }
  if (prev === null) return { changed: false, status, email: 'none' }; // same status: no history, no email

  const type = EMAIL_FOR[status];
  if (!type) return { changed: true, status, email: 'none' };

  const { data: full } = await db.from('requests').select(REQUEST_COLUMNS).eq('id', id).single();
  const sent = full ? await sendRequestEmail(db, full, type) : false;
  return { changed: true, status, email: sent ? 'sent' : 'failed' };
}));

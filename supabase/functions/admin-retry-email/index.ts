import { HttpError, handler, readJson, requireAdmin, str } from '../_shared/util.ts';
import { REQUEST_COLUMNS, sendRequestEmail } from '../_shared/email.ts';
import type { EmailType } from '../_shared/templates.ts';

Deno.serve(handler(async (req, db) => {
  await requireAdmin(req, db);
  const logId = str((await readJson(req)).logId, 64);
  if (!/^[0-9a-f-]{36}$/.test(logId)) throw new HttpError(400, 'Invalid email log.');

  const { data: log } = await db.from('email_logs').select('id, request_id, email_type, delivery_status').eq('id', logId).maybeSingle();
  if (!log) throw new HttpError(404, 'Email log not found.');
  if (log.delivery_status === 'sent') throw new HttpError(409, 'This email was already delivered.');

  const { data: full } = await db.from('requests').select(REQUEST_COLUMNS).eq('id', log.request_id).single();
  if (!full) throw new HttpError(404, 'Request not found.');
  const sent = await sendRequestEmail(db, full, log.email_type as EmailType, log.id);
  return { email: sent ? 'sent' : 'failed' };
}));

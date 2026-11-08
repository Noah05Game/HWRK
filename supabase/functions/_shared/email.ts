import type { Db } from './util.ts';
import { decryptToken, trackingUrl } from './util.ts';
import { buildEmail, type EmailType } from './templates.ts';

const FROM = 'HWRK <hwrk@wpoint.xyz>';

interface RequestRow {
  id: string;
  ticket_reference: string;
  customer_name: string;
  contact_email: string;
  due_date: string;
  tracking_token_enc: string;
  request_options: { name: string } | { name: string }[] | null;
}

export const REQUEST_COLUMNS =
  'id, ticket_reference, customer_name, contact_email, due_date, tracking_token_enc, request_options(name)';

async function deliver(subject: string, html: string, to: string): Promise<string | null> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return 'RESEND_API_KEY is not configured';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    if (!res.ok) return `Resend ${res.status}: ${(await res.text()).slice(0, 300)}`;
    return null;
  } catch (e) {
    return `Network error: ${(e as Error).message}`;
  }
}

/** Sends a notification and records the outcome. Pass logId to update an existing (failed) log on retry. */
export async function sendRequestEmail(db: Db, req: RequestRow, type: EmailType, logId?: string, knownToken?: string): Promise<boolean> {
  const opt = Array.isArray(req.request_options) ? req.request_options[0] : req.request_options;
  const token = knownToken ?? (await decryptToken(req.tracking_token_enc));
  const { subject, html } = buildEmail(type, {
    name: req.customer_name, ref: req.ticket_reference, option: opt?.name ?? '', dueDate: req.due_date, url: trackingUrl(token),
  });
  const error = await deliver(subject, html, req.contact_email);
  const status = error ? 'failed' : 'sent';

  if (logId) {
    const { data: prev } = await db.from('email_logs').select('attempts').eq('id', logId).single();
    await db.from('email_logs').update({ delivery_status: status, error_message: error, attempts: (prev?.attempts ?? 1) + 1 }).eq('id', logId);
  } else {
    await db.from('email_logs').insert({
      request_id: req.id, email_type: type, recipient: req.contact_email, delivery_status: status, error_message: error,
    });
  }
  if (error) console.error(`Email ${type} for ${req.ticket_reference} failed`);
  return !error;
}

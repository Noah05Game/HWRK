export type EmailType = 'request_created' | 'request_in_progress' | 'request_completed' | 'request_issue';

export interface EmailData {
  name: string;
  ref: string;
  option: string;
  dueDate: string;
  url: string;
  issueReason?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function layout(title: string, intro: string, rows: [string, string][], url: string): string {
  const rowHtml = rows
    .map(
      ([k, v]) => `<tr>
<td style="padding:12px 0;border-top:1px solid #2c2c2e;color:#98989d;font-size:14px;width:40%;">${esc(k)}</td>
<td style="padding:12px 0;border-top:1px solid #2c2c2e;color:#f5f5f7;font-size:14px;font-weight:500;" align="right">${esc(v)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#000000;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<tr><td style="padding:0 4px 20px;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:0.5px;">HWRK</td></tr>
<tr><td style="background:#1c1c1e;border:1px solid #2c2c2e;border-radius:16px;padding:32px 28px;">
<h1 style="margin:0 0 12px;color:#f5f5f7;font-size:22px;line-height:1.3;font-weight:600;">${esc(title)}</h1>
<p style="margin:0 0 24px;color:#c7c7cc;font-size:15px;line-height:1.55;">${intro}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">${rowHtml}</table>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;border-radius:10px;">
<a href="${esc(url)}" style="display:inline-block;padding:12px 22px;color:#000000;font-size:15px;font-weight:600;text-decoration:none;">View request</a></td></tr></table>
</td></tr>
<tr><td style="padding:20px 4px 0;color:#636366;font-size:12px;line-height:1.5;">This link is private to you. Do not share it. If you did not make this request, you can ignore this email.</td></tr>
</table></td></tr></table></body></html>`;
}

export function buildEmail(type: EmailType, d: EmailData): { subject: string; html: string } {
  const name = esc(d.name);
  switch (type) {
    case 'request_created':
      return {
        subject: `Your HWRK request has been received — ${d.ref}`,
        html: layout('Request received', `Hi ${name}, we have received your request and will keep you updated.`, [
          ['Ticket', d.ref], ['Request', d.option], ['Requested due date', fmtDate(d.dueDate)], ['Status', 'Ordered'],
        ], d.url),
      };
    case 'request_in_progress':
      return {
        subject: `Your HWRK request is now in progress — ${d.ref}`,
        html: layout('Your request is in progress', `Hi ${name}, work on your request has started.`, [
          ['Ticket', d.ref], ['Request', d.option], ['Status', 'In Progress'],
        ], d.url),
      };
    case 'request_completed':
      return {
        subject: `Your HWRK request has been completed — ${d.ref}`,
        html: layout('Your request is complete', `Hi ${name}, your request has been completed.`, [
          ['Ticket', d.ref], ['Request', d.option], ['Status', 'Completed'],
        ], d.url),
      };
    case 'request_issue': {
      const reason = esc(d.issueReason ?? '');
      return {
        subject: `There is an issue with your HWRK request — ${d.ref}`,
        html: layout('Your request could not be completed', `Hi ${name}, your request could not be completed because: ${reason}. Please fill out another request if you would still like this service.`, [
          ['Ticket', d.ref], ['Request', d.option], ['Status', 'Issue reported'], ['Reason', reason],
        ], d.url),
      };
    }
  }
}

import {
  EMAIL_RE, HttpError, clientKey, encryptToken, handler,
  randomToken, rateLimit, readJson, sha256, str, validateDueDate,
} from '../_shared/util.ts';
import { REQUEST_COLUMNS, sendRequestEmail } from '../_shared/email.ts';


Deno.serve(handler(async (req, db) => {
  const client = await clientKey(req);
  await rateLimit(db, `submit:${client}`, 10, 3600, 'Too many requests. Try again later.');

  const b = await readJson(req);
  const name = str(b.fullName, 100);
  const gmail = str(b.gmail, 254).toLowerCase();
  const contact = str(b.contactEmail, 254).toLowerCase();
  const servicePassword = typeof b.servicePassword === 'string' ? b.servicePassword : '';
  const optionKey = str(b.optionKey, 40);
  const termsVersion = b.termsVersion;
  const termsText = typeof b.termsText === 'string' ? b.termsText : '';

  const fail = (field: string, msg: string): never => { throw new HttpError(400, msg, 'validation', field); };
  if (name.length < 2 || name.length > 100) fail('fullName', 'Enter your full name.');
  if (!EMAIL_RE.test(gmail) || gmail.length > 254) fail('gmail', 'Enter a valid email address.');
  if (!EMAIL_RE.test(contact) || contact.length > 254) fail('contactEmail', 'Enter a valid contact email address.');
  if (!servicePassword.length || servicePassword.length > 256) fail('servicePassword', 'Enter the password you were given (up to 256 characters).');
  if (!/^[a-z0-9-]{1,40}$/.test(optionKey)) fail('optionKey', 'Choose a request type.');
  if (b.acceptedTerms !== true) fail('acceptedTerms', 'You must agree to the terms and conditions before submitting.');
  if (typeof termsVersion !== 'number' || !Number.isInteger(termsVersion) || termsVersion < 1 || !termsText.trim() || termsText.length > 20000) {
    fail('acceptedTerms', 'Review and agree to the current terms and conditions.');
  }
  const due = validateDueDate(b.dueDate);

  const token = randomToken();

  const { data, error } = await db.rpc('create_request', {
    p_name: name, p_gmail: gmail, p_contact: contact,
    p_service_password: servicePassword,
    p_option_key: optionKey, p_due: due,
    p_token_hash: await sha256(token), p_token_enc: await encryptToken(token),
    p_terms_version: termsVersion, p_terms_text: termsText, p_terms_accepted: b.acceptedTerms,
  });

  if (error) {
    const m = error.message ?? '';
    if (m.includes('duplicate_request')) throw new HttpError(409, 'You already have an open request of this type.', 'duplicate');
    if (m.includes('invalid_option')) throw new HttpError(400, 'This request type is not available.', 'validation', 'optionKey');
    if (m.includes('maintenance_mode')) throw new HttpError(503, 'We’re down for maintenance. Be back soon.', 'maintenance_mode');
    if (m.includes('site_settings_not_configured')) throw new HttpError(503, 'Request availability could not be verified. Please try again later.', 'maintenance_unavailable');
    if (m.includes('terms_not_configured')) throw new HttpError(409, 'Terms and conditions are not configured yet.', 'terms_not_configured');
    if (m.includes('terms_not_accepted')) throw new HttpError(400, 'You must agree to the terms and conditions before submitting.', 'terms_not_accepted');
    if (m.includes('terms_changed')) throw new HttpError(409, 'The terms have changed. Review and agree to the current terms before submitting.', 'terms_changed');
    throw new Error(`create_request failed: ${m}`);
  }
  const row = Array.isArray(data) ? data[0] : data;

  const { data: full, error: loadErr } = await db.from('requests').select(REQUEST_COLUMNS).eq('id', row.out_id).single();
  if (loadErr || !full) throw new Error('could not load created request');
  const emailSent = await sendRequestEmail(db, full, 'request_created', undefined, token);

  return {
    ticketReference: row.out_ticket, optionName: row.out_option, dueDate: due, status: 'ordered',
    trackingToken: token, emailSent,
  };
}));

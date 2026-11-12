import {
  EMAIL_RE, HttpError, clientKey, encryptToken, handler, requireUser,
  randomToken, rateLimit, readJson, sha256, str, validateDueDate,
} from '../_shared/util.ts';
import { REQUEST_COLUMNS, sendRequestEmail } from '../_shared/email.ts';


Deno.serve(handler(async (req, db) => {
  const user = await requireUser(req, db);
  if (!user.email || !user.email_confirmed_at) {
    throw new HttpError(401, 'Confirm your account email before submitting a request.', 'email_required');
  }

  const { data: profile, error: profileError } = await db.from('user_profiles')
    .select('full_name, school_email, school_password, school_name, school_login_type')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileError) throw new Error(`Could not load account profile: ${profileError.message}`);
  if (!profile) throw new HttpError(409, 'Complete account setup before submitting a request.', 'onboarding_required');

  const provider = user.identities?.some((identity) => identity.provider === 'google')
    ? 'google'
    : user.app_metadata.provider;
  if (provider === 'google') {
    const { data: verification, error: verificationError } = await db.from('personal_google_accounts')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (verificationError) throw new Error(`Could not verify Google account eligibility: ${verificationError.message}`);
    if (!verification) throw new HttpError(403, 'Verify that you are using a personal Google account before submitting.', 'google_verification_required');
  }

  const client = await clientKey(req);
  await rateLimit(db, `submit:${client}`, 10, 3600, 'Too many requests. Try again later.');

  const b = await readJson(req);
  const optionKey = str(b.optionKey, 40);
  const termsVersion = b.termsVersion;
  const termsText = typeof b.termsText === 'string' ? b.termsText : '';

  const fail = (field: string, msg: string): never => { throw new HttpError(400, msg, 'validation', field); };
  const name = profile.full_name;
  const schoolEmail = profile.school_email.trim().toLowerCase();
  const contact = user.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 100) fail('fullName', 'Complete your account profile with a valid full name.');
  if (!EMAIL_RE.test(schoolEmail) || schoolEmail.length > 254) fail('schoolEmail', 'Complete your account profile with a valid school email.');
  if (!EMAIL_RE.test(contact) || contact.length > 254) throw new HttpError(400, 'Your account email is not valid for contact.', 'contact_email_invalid');
  if (schoolEmail === contact) fail('schoolEmail', 'Your school email must differ from your account email.');
  if (!profile.school_password || profile.school_password.length > 256) fail('schoolPassword', 'Complete your account profile with a valid school password.');
  if (!profile.school_name || profile.school_name.length > 120) fail('schoolName', 'Complete your account profile with a valid school name.');
  if (!['email', 'google', 'microsoft'].includes(profile.school_login_type)) {
    fail('schoolLoginType', 'Choose a valid school login type in your account profile.');
  }
  if (!/^[a-z0-9-]{1,40}$/.test(optionKey)) fail('optionKey', 'Choose a request type.');
  if (b.acceptedTerms !== true) fail('acceptedTerms', 'You must agree to the terms and conditions before submitting.');
  if (typeof termsVersion !== 'number' || !Number.isInteger(termsVersion) || termsVersion < 1 || !termsText.trim() || termsText.length > 20000) {
    fail('acceptedTerms', 'Review and agree to the current terms and conditions.');
  }
  const due = validateDueDate(b.dueDate);

  const token = randomToken();

  const { data, error } = await db.rpc('create_authenticated_request', {
    p_user_id: user.id,
    p_name: name,
    p_school_email: schoolEmail,
    p_contact: contact,
    p_school_password: profile.school_password,
    p_school_name: profile.school_name,
    p_school_login_type: profile.school_login_type,
    p_option_key: optionKey, p_due: due,
    p_token_hash: await sha256(token), p_token_enc: await encryptToken(token),
    p_terms_version: termsVersion, p_terms_text: termsText, p_terms_accepted: b.acceptedTerms,
  });

  if (error) {
    const m = error.message ?? '';
    if (m.includes('duplicate_request')) throw new HttpError(409, 'You already have an open request of this type.', 'duplicate');
    if (m.includes('invalid_option')) throw new HttpError(400, 'This request type is not available.', 'validation', 'optionKey');
    if (m.includes('option_full')) throw new HttpError(409, 'This request type is temporarily full. It will become available when an existing request is completed or cancelled.', 'option_full');
    if (m.includes('maintenance_mode')) throw new HttpError(503, 'We’re down for maintenance. Be back soon.', 'maintenance_mode');
    if (m.includes('site_settings_not_configured')) throw new HttpError(503, 'Request availability could not be verified. Please try again later.', 'maintenance_unavailable');
    if (m.includes('terms_not_configured')) throw new HttpError(409, 'Terms and conditions are not configured yet.', 'terms_not_configured');
    if (m.includes('terms_not_accepted')) throw new HttpError(400, 'You must agree to the terms and conditions before submitting.', 'terms_not_accepted');
    if (m.includes('terms_changed')) throw new HttpError(409, 'The terms have changed. Review and agree to the current terms before submitting.', 'terms_changed');
    throw new Error(`create_request failed: ${m}`);
  }
  const row = Array.isArray(data) ? data[0] : data;

  const { data: metrics, error: metricsErr } = await db.rpc('get_request_queue_metrics', { p_request_id: row.out_id });
  if (metricsErr) throw new Error(`Could not load queue position: ${metricsErr.message}`);
  const queue = Array.isArray(metrics) ? metrics[0] : metrics;

  const { data: full, error: loadErr } = await db.from('requests').select(REQUEST_COLUMNS).eq('id', row.out_id).single();
  if (loadErr || !full) throw new Error('could not load created request');
  const emailSent = await sendRequestEmail(db, full, 'request_created', undefined, token);

  return {
    ticketReference: row.out_ticket, optionName: row.out_option, dueDate: due, status: 'ordered',
    trackingToken: token, emailSent, queuePosition: queue?.queue_position ?? null,
    estimatedSlotAt: queue?.estimated_slot_at ?? null, slotReserved: queue?.slot_reserved ?? false,
  };
}));

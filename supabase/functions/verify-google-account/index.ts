import { HttpError, handler, readJson, requireUser } from '../_shared/util.ts';

interface GoogleTokenClaims {
  aud?: string;
  email?: string;
  email_verified?: boolean | string;
  exp?: string;
  hd?: string;
  iss?: string;
  sub?: string;
}

Deno.serve(handler(async (req, db) => {
  const user = await requireUser(req, db);
  const body = await readJson(req);
  const idToken = typeof body.idToken === 'string' ? body.idToken : '';
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  if (!idToken || idToken.length > 8192) {
    throw new HttpError(400, 'A valid Google sign-in token is required.', 'google_token_required');
  }
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not configured.');

  const googleIdentity = user.identities?.find((identity) => identity.provider === 'google');
  const googleSubject = googleIdentity?.identity_data?.sub ?? googleIdentity?.identity_id;
  if (typeof googleSubject !== 'string') {
    throw new HttpError(403, 'Sign in with Google before verifying this account.', 'google_identity_required');
  }

  let response: Response;
  try {
    response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  } catch {
    throw new HttpError(502, 'Google account verification is temporarily unavailable.', 'google_verification_unavailable');
  }
  if (!response.ok) {
    throw new HttpError(401, 'Google could not verify this sign-in. Please try again.', 'google_token_invalid');
  }

  const claims = await response.json() as GoogleTokenClaims;
  const expiresAt = Number(claims.exp);
  if (claims.aud !== clientId || !claims.sub || claims.sub !== googleSubject
    || !user.email || claims.email?.toLowerCase() !== user.email.toLowerCase()
    || claims.email_verified !== true && claims.email_verified !== 'true'
    || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss ?? '')
    || !Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new HttpError(401, 'This Google sign-in could not be verified.', 'google_token_invalid');
  }
  if (claims.hd) {
    throw new HttpError(403, 'Google Workspace accounts are not accepted. Use a personal Google account.', 'google_workspace_not_allowed');
  }

  const { error } = await db.from('personal_google_accounts').upsert({
    user_id: user.id,
    google_subject: claims.sub,
    email: claims.email,
  }, { onConflict: 'user_id' });
  if (error) throw new Error(`Could not save Google account verification: ${error.message}`);
  return { verified: true };
}));

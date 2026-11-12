import { HttpError, handler, readJson } from '../_shared/util.ts';

Deno.serve(handler(async (req, db) => {
  const body = await readJson(req);
  const action = body.action;
  if (action !== 'check' && action !== 'visit') {
    throw new HttpError(400, 'Invalid access check.', 'invalid_action');
  }

  const address = req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim();
  if (!address) {
    throw new HttpError(503, 'Site access could not be verified.', 'ip_unavailable');
  }

  const { data: blocked, error } = await db.rpc('is_prohibited_ip', { p_ip: address });
  if (error) throw new Error('IP access verification failed.');
  if (blocked) return { allowed: false };

  if (action === 'visit') {
    const { error: analyticsError } = await db.rpc('record_site_page_view');
    if (analyticsError) throw new Error('Anonymous page-view count could not be recorded.');
  }
  return { allowed: true };
}));

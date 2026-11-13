import { HttpError, handler, readJson, requireAdmin, requireUser, str } from '../_shared/util.ts';

Deno.serve(handler(async (req, db) => {
  const actor = await requireUser(req, db);
  const body = await readJson(req);
  const userId = body.userId === undefined ? actor.id : str(body.userId, 64);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new HttpError(400, 'Invalid account.');
  if (userId !== actor.id) await requireAdmin(req, db);

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) {
    if (/user not found/i.test(error.message)) throw new HttpError(404, 'Account not found.');
    throw new Error(`Could not delete account: ${error.message}`);
  }
  return { deleted: true };
}));

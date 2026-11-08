import { HttpError, handler, readJson, requireAdmin, str } from '../_shared/util.ts';

Deno.serve(handler(async (req, db) => {
  await requireAdmin(req, db);
  const id = str((await readJson(req)).requestId, 64);
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'Invalid request.');

  const { data: request, error: loadError } = await db.from('requests').select('status').eq('id', id).maybeSingle();
  if (loadError) throw new Error(`Could not load request: ${loadError.message}`);
  if (!request) throw new HttpError(404, 'Request not found.');
  if (request.status !== 'completed') throw new HttpError(409, 'Only completed orders can be deleted.');

  const { data: deleted, error } = await db.rpc('delete_completed_request', { p_id: id });
  if (error) throw new Error(`Could not delete completed request: ${error.message}`);
  if (!deleted) throw new HttpError(409, 'The order is no longer completed and was not deleted.');
  return { deleted: true };
}));

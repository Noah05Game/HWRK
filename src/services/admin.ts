import { supabase } from '../lib/supabase';
import type { AdminRequest, EmailLog, HistoryRow } from '../types';

const COLS =
  'id, ticket_reference, customer_name, gmail_email, contact_email, due_date, status, admin_notes, issue_reason, issue_reported_at, terms_version, terms_text, created_at, updated_at, request_options(name)';

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) throw new Error(error.message);
  return data === true;
}
export const listRequests = async () =>
  check(await supabase.from('requests').select(COLS).order('created_at', { ascending: false }).limit(1000)) as unknown as AdminRequest[];
export const getServicePassword = async (id: string) =>
  check<{ service_password: string }>(await supabase.from('requests').select('service_password').eq('id', id).single()).service_password;
export const listHistory = async (id: string) =>
  check(await supabase.from('status_history').select('id, previous_status, new_status, changed_at').eq('request_id', id).order('changed_at')) as HistoryRow[];
export const listEmailLogs = async (id: string) =>
  check(await supabase.from('email_logs').select('id, email_type, recipient, delivery_status, error_message, attempts, created_at').eq('request_id', id).order('created_at', { ascending: false })) as EmailLog[];
export const saveNotes = async (id: string, notes: string) => {
  const { error } = await supabase.from('requests').update({ admin_notes: notes }).eq('id', id);
  if (error) throw new Error(error.message);
};

import { supabase } from '../lib/supabase';
import type { AdminAccount, AdminRequest, EmailLog, HistoryRow, ProhibitedIp, SiteAnalyticsDay } from '../types';

const COLS =
  'id, option_id, auth_user_id, ticket_reference, customer_name, gmail_email, contact_email, school_name, school_login_type, due_date, status, admin_notes, issue_reason, issue_reported_at, terms_version, terms_text, created_at, updated_at, slot_number, slot_reserved_at, processing_started_at, slot_expires_at, request_options(key, name)';

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
export async function listAdminAccounts(): Promise<AdminAccount[]> {
  return check(await supabase.rpc('admin_list_accounts')) as AdminAccount[];
}
export async function setAccountPriority(userId: string, priority: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_account_priority', {
    p_user_id: userId,
    p_is_priority: priority,
  });
  if (error) throw new Error(error.message);
}
export async function banAccount(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_ban_account', { p_user_id: userId });
  if (error) throw new Error(error.message);
}
export async function unbanAccount(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_unban_account', { p_user_id: userId });
  if (error) throw new Error(error.message);
}
export async function deleteAccount(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: { userId } });
  if (error) throw new Error(error.message || 'Could not delete this account.');
  if (!data || data.deleted !== true) throw new Error('Account deletion returned an invalid response.');
}
export async function listProhibitedIps(): Promise<ProhibitedIp[]> {
  return check(await supabase.rpc('admin_list_prohibited_ips')) as ProhibitedIp[];
}
export async function addProhibitedIp(ipAddress: string): Promise<void> {
  const { error } = await supabase.rpc('admin_add_prohibited_ip', { p_ip: ipAddress });
  if (error) throw new Error(error.message);
}
export async function removeProhibitedIp(ipAddress: string): Promise<void> {
  const { error } = await supabase.rpc('admin_remove_prohibited_ip', { p_ip: ipAddress });
  if (error) throw new Error(error.message);
}
export async function getSiteAnalytics(days = 30): Promise<SiteAnalyticsDay[]> {
  return check(await supabase.rpc('admin_get_site_analytics', { p_days: days })) as SiteAnalyticsDay[];
}
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

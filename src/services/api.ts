import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured, supabase } from '../lib/supabase';
import type { SubmitPayload, SubmitResult, TrackResult, Status } from '../types';

export class ApiError extends Error {
  constructor(message: string, public code?: string, public status?: number, public field?: string) {
    super(message);
  }
}

async function call<T>(fn: string, body: unknown, accessToken?: string): Promise<T> {
  if (!isConfigured) throw new ApiError('The app is not configured. Set the Supabase environment variables.', 'config');
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken ?? SUPABASE_ANON_KEY}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Network error. Check your connection and try again.', 'network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'Something went wrong. Please try again.', data.code, res.status, data.field);
  return data as T;
}

export async function submitRequest(p: SubmitPayload): Promise<SubmitResult> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new ApiError('Sign in before submitting a request.', 'session');
  return call<SubmitResult>('submit-request', p, data.session.access_token);
}
export const trackRequest = (token: string) => call<TrackResult>('track-request', { token });

export const updateStatus = (token: string, requestId: string, status: Status) =>
  call<{ changed: boolean; status: Status; email: 'sent' | 'failed' | 'none' }>('admin-update-status', { requestId, status }, token);
export const reportRequestIssue = (token: string, requestId: string, reason: string) =>
  call<{ email: 'sent' | 'failed' }>('admin-report-issue', { requestId, reason }, token);
export const deleteCompletedRequest = (token: string, requestId: string) =>
  call<{ deleted: boolean }>('admin-delete-completed-request', { requestId }, token);
export const retryEmail = (token: string, logId: string) =>
  call<{ email: 'sent' | 'failed' }>('admin-retry-email', { logId }, token);

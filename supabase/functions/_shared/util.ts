import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type Db = SupabaseClient;
export const serviceClient = (): Db =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public field?: string) {
    super(message);
  }
}

// --- CORS & request wrapper -------------------------------------------------
function allowedOrigin(origin: string): boolean {
  try {
    return origin === new URL(Deno.env.get('APP_BASE_URL')!).origin || /^http:\/\/localhost(:\d+)?$/.test(origin);
  } catch {
    return false;
  }
}

export function handler(fn: (req: Request, db: Db) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin') ?? '';
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': allowedOrigin(origin) ? origin : 'null',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
      const result = await fn(req, serviceClient());
      return new Response(JSON.stringify(result), { status: 200, headers });
    } catch (e) {
      if (e instanceof HttpError) {
        return new Response(JSON.stringify({ error: e.message, code: e.code, field: e.field }), { status: e.status, headers });
      }
      console.error('Unhandled error:', (e as Error).message); // message only, never request bodies
      return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), { status: 500, headers });
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new HttpError(400, 'Invalid request body.');
}

// --- Crypto ----------------------------------------------------------------
const enc = new TextEncoder();
const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const secret = () => {
  const s = Deno.env.get('SERVER_SECRET');
  if (!s || s.length < 16) throw new Error('SERVER_SECRET is missing or too short');
  return s;
};

export const sha256 = async (s: string) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

/** Keyed hash for low-entropy values (secure IDs, IP addresses). */
export async function hmac(value: string, context: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(`${context}:${value}`)));
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function randomToken(bytes = 32): string {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function aesKey() {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`${secret()}:token-encryption`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptToken(token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), enc.encode(token)));
  return b64(new Uint8Array([...iv, ...ct]));
}
export async function decryptToken(value: string): Promise<string> {
  const all = unb64(value);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await aesKey(), all.slice(12));
  return new TextDecoder().decode(pt);
}

// --- Rate limiting & admin auth ---------------------------------------------
export async function clientKey(req: Request): Promise<string> {
  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? 'unknown').split(',')[0].trim();
  return hmac(ip, 'client');
}

export async function rateLimit(db: Db, key: string, limit: number, windowSeconds: number, message: string) {
  const { data, error } = await db.rpc('check_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) throw new Error(`rate limit check failed: ${error.message}`);
  if (!data) throw new HttpError(429, message, 'rate_limited');
}

export async function requireAdmin(req: Request, db: Db) {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) throw new HttpError(401, 'Your session has expired. Sign in again.', 'session');
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Sign in again.', 'session');
  const { data: row } = await db.from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (!row) throw new HttpError(403, 'This account is not authorised.', 'forbidden');
  return data.user;
}

// --- Validation --------------------------------------------------------------
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');

export function validateDueDate(v: unknown): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    throw new HttpError(400, 'Enter a valid completion date.', 'validation', 'dueDate');
  }
  const day = 86_400_000;
  const today = Math.floor(Date.now() / day) * day;
  const due = Date.parse(v + 'T00:00:00Z');
  if (due < today - day) throw new HttpError(400, 'The completion date cannot be in the past.', 'validation', 'dueDate');
  if (due > today + 366 * day) throw new HttpError(400, 'Choose a date within the next year.', 'validation', 'dueDate');
  return v;
}

export const trackingUrl = (token: string) =>
  `${(Deno.env.get('APP_BASE_URL') ?? '').replace(/\/+$/, '')}/t/${token}`;

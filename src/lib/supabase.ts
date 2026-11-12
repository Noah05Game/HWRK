import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Placeholder values keep the app rendering (with a clear error) when env vars are missing.
export const supabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_ANON_KEY || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const publicSupabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_ANON_KEY || 'missing', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

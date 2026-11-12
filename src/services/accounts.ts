import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { SchoolLoginType, UserProfile } from '../types';

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, full_name, school_email, school_password, school_name, school_login_type, is_priority, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveUserProfile(
  user: User,
  profile: {
    fullName: string;
    schoolEmail: string;
    schoolPassword: string;
    schoolName: string;
    schoolLoginType: SchoolLoginType;
  },
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({
      user_id: user.id,
      full_name: profile.fullName,
      school_email: profile.schoolEmail,
      school_password: profile.schoolPassword,
      school_name: profile.schoolName,
      school_login_type: profile.schoolLoginType,
    }, { onConflict: 'user_id' })
    .select('user_id, full_name, school_email, school_password, school_name, school_login_type, is_priority, created_at, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function isCurrentAccountBanned(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_current_account_banned');
  if (error) throw new Error(error.message);
  return data === true;
}

export async function hasPersonalGoogleVerification(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('personal_google_accounts')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function verifyPersonalGoogleAccount(idToken: string, accessToken: string): Promise<void> {
  const { error } = await supabase.functions.invoke('verify-google-account', {
    body: { idToken },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) {
    const context = (error as Error & { context?: unknown }).context;
    let responseMessage: string | undefined;
    if (context instanceof Response) {
      try {
        const body: unknown = await context.json();
        if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
          responseMessage = body.error;
        }
      } catch {
        responseMessage = undefined;
      }
    } else if (context && typeof context === 'object' && 'error' in context && typeof context.error === 'string') {
      responseMessage = context.error;
    }
    throw new Error(responseMessage || error.message || 'Could not verify this Google account.');
  }
}

export async function submitAccountSignOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

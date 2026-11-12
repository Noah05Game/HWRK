import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { SchoolLoginType, UserProfile } from '../types';

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, full_name, school_email, school_password, school_name, school_login_type, created_at, updated_at')
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
    .select('user_id, full_name, school_email, school_password, school_name, school_login_type, created_at, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
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
    const response = (error as Error & { context?: Response }).context;
    const body = response ? await response.clone().json().catch(() => null) : null;
    throw new Error(body?.error || error.message || 'Could not verify this Google account.');
  }
}

export async function submitAccountSignOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

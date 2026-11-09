import { supabase } from '../lib/supabase';
import type { TermsSettings } from '../types';

export async function getTerms(): Promise<TermsSettings> {
  const { data, error } = await supabase
    .from('terms_settings')
    .select('terms_text, version, updated_at')
    .eq('id', true)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveTerms(termsText: string): Promise<TermsSettings> {
  const { data, error } = await supabase
    .from('terms_settings')
    .update({ terms_text: termsText })
    .eq('id', true)
    .select('terms_text, version, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

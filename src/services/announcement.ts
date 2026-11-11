import { supabase } from '../lib/supabase';
import type { AnnouncementSettings } from '../types';

const ANNOUNCEMENT_COLUMNS =
  'announcement_enabled, announcement_title, announcement_body, announcement_background_color, announcement_text_color, updated_at';

export async function getAnnouncementSettings(): Promise<AnnouncementSettings> {
  const { data, error } = await supabase
    .from('site_settings')
    .select(ANNOUNCEMENT_COLUMNS)
    .eq('id', true)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveAnnouncementSettings(
  settings: Omit<AnnouncementSettings, 'updated_at'>,
): Promise<AnnouncementSettings> {
  const { data, error } = await supabase
    .from('site_settings')
    .update(settings)
    .eq('id', true)
    .select(ANNOUNCEMENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

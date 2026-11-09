import { supabase } from '../lib/supabase';
import type { MaintenanceSettings } from '../types';

export async function getMaintenanceSettings(): Promise<MaintenanceSettings> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('maintenance_mode, updated_at')
    .eq('id', true)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setMaintenanceMode(enabled: boolean): Promise<MaintenanceSettings> {
  const { data, error } = await supabase
    .from('site_settings')
    .update({ maintenance_mode: enabled })
    .eq('id', true)
    .select('maintenance_mode, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

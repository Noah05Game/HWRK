import { supabase } from '../lib/supabase';
import type { OptionCapacity, OptionSlot } from '../types';

export async function getOptionCapacity(): Promise<OptionCapacity[]> {
  const { data, error } = await supabase.rpc('get_option_capacity');
  if (error) throw new Error(error.message);
  return data as OptionCapacity[];
}

export async function getOptionSlots(): Promise<OptionSlot[]> {
  const { data, error } = await supabase
    .from('option_slots')
    .select('id, option_id, slot_number, current_request_id, reserved_at, processing_started_at, expires_at')
    .order('option_id')
    .order('slot_number');
  if (error) throw new Error(error.message);
  return data as OptionSlot[];
}

export async function manageOptionSlot(slotId: string, action: 'release' | 'adjust_expiry', expiresAt?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_manage_option_slot', {
    p_slot_id: slotId,
    p_action: action,
    p_expires_at: expiresAt ?? null,
  });
  if (error) throw new Error(error.message);
}

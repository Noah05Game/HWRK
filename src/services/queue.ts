import { supabase } from '../lib/supabase';
import type { OptionCapacity, OptionSlot } from '../types';

export async function getOptionCapacity(): Promise<OptionCapacity[]> {
  const { data, error } = await supabase.rpc('get_option_capacity');
  if (error) throw new Error(error.message);
  return data as OptionCapacity[];
}

export async function getDailySlotCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_daily_slot_count');
  if (error) throw new Error(error.message);
  return data as number;
}

export async function setDailySlotCount(dailySlots: number): Promise<void> {
  const { error } = await supabase.rpc('admin_set_daily_slot_count', { p_daily_slots: dailySlots });
  if (error) throw new Error(error.message);
}

export async function getOptionSlots(): Promise<OptionSlot[]> {
  const { data, error } = await supabase
    .from('option_slots')
    .select('id, option_id, slot_number, current_request_id, reserved_at, processing_started_at, expires_at')
    .order('option_id')
    .order('slot_number');
  if (error) throw new Error(error.message);
  const slots = data as OptionSlot[];
  const requestIds = slots.map((slot) => slot.current_request_id).filter((id): id is string => Boolean(id));
  if (requestIds.length === 0) return slots;

  const { data: requests, error: requestsError } = await supabase
    .from('requests')
    .select('id, customer_name, ticket_reference, status')
    .in('id', requestIds);
  if (requestsError) throw new Error(requestsError.message);
  const requestsById = new Map(requests.map((request) => [request.id, request]));
  return slots.map((slot) => ({
    ...slot,
    request: slot.current_request_id ? requestsById.get(slot.current_request_id) ?? null : null,
  }));
}

export async function manageOptionSlot(slotId: string, action: 'release' | 'adjust_expiry', expiresAt?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_manage_option_slot', {
    p_slot_id: slotId,
    p_action: action,
    p_expires_at: expiresAt ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function replaceReservedSlot(requestId: string, slotId: string, expectedRequestId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_replace_reserved_slot', {
    p_request_id: requestId,
    p_slot_id: slotId,
    p_expected_request_id: expectedRequestId,
  });
  if (error) {
    if (error.message.includes('request_already_assigned')) {
      throw new Error('This request has already been assigned a slot. Refresh and try again.');
    }
    if (error.message.includes('slot_changed')) {
      throw new Error('That slot has been reassigned. Refresh the slots and try again.');
    }
    if (error.message.includes('slot_not_replaceable')) {
      throw new Error('That slot is no longer available to replace. Refresh the slots and try again.');
    }
    throw new Error(error.message);
  }
}

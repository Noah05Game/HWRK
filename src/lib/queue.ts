import type { AdminRequest, OptionSlot } from '../types';

export function estimateQueue(
  slots: OptionSlot[],
  waiting: AdminRequest[],
  now = Date.now(),
): Map<string, { position: number; estimatedSlotAt: Date }> {
  const availability = slots
    .map((slot) => {
      if (slot.expires_at) return Math.max(Date.parse(slot.expires_at), now);
      if (slot.current_request_id && slot.reserved_at) return Math.max(Date.parse(slot.reserved_at), now) + 24 * 60 * 60 * 1000;
      return now;
    })
    .sort((a, b) => a - b);
  const nextAvailable = availability.length >= 2 ? availability.slice(0, 2) : [...availability, ...Array(Math.max(0, 2 - availability.length)).fill(now)];
  const result = new Map<string, { position: number; estimatedSlotAt: Date }>();

  waiting.forEach((request, index) => {
    const slotIndex = nextAvailable[0] <= nextAvailable[1] ? 0 : 1;
    const estimatedSlotAt = nextAvailable[slotIndex];
    result.set(request.id, { position: index + 1, estimatedSlotAt: new Date(estimatedSlotAt) });
    nextAvailable[slotIndex] = estimatedSlotAt + 24 * 60 * 60 * 1000;
  });
  return result;
}

export function localDateTimeValue(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

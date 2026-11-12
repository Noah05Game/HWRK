import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { fmtDateTime } from '../lib/format';
import { estimateQueue, localDateTimeValue } from '../lib/queue';
import { getOptionCapacity, getOptionSlots, manageOptionSlot } from '../services/queue';
import type { AdminRequest, OptionCapacity, OptionSlot } from '../types';

interface Props { requests: AdminRequest[]; onChanged: () => void }

export function QueueManagement({ requests, onChanged }: Props) {
  const [capacity, setCapacity] = useState<OptionCapacity[] | null>(null);
  const [slots, setSlots] = useState<OptionSlot[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busySlot, setBusySlot] = useState('');
  const [expiryInputs, setExpiryInputs] = useState<Record<string, string>>({});
  const [releaseSlot, setReleaseSlot] = useState<OptionSlot | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [nextCapacity, nextSlots] = await Promise.all([getOptionCapacity(), getOptionSlots()]);
      setCapacity(nextCapacity);
      setSlots(nextSlots);
      setExpiryInputs((current) => {
        const next = { ...current };
        for (const slot of nextSlots) {
          if (slot.expires_at && !next[slot.id]) next[slot.id] = localDateTimeValue(slot.expires_at);
        }
        return next;
      });
    } catch (e) {
      setError((e as Error).message || 'Could not load queue and slot information.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, requests]);

  useEffect(() => {
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const currentRequests = useMemo(() => new Map(requests.map((request) => [request.id, request])), [requests]);
  const assignedIds = useMemo(() => new Set(slots.map((slot) => slot.current_request_id).filter((id): id is string => Boolean(id))), [slots]);
  const remaining = (expiresAt: string) => {
    const minutes = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 60_000));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? `${hours}h ${rest}m remaining` : `${rest}m remaining`;
  };

  async function release(slot: OptionSlot) {
    setBusySlot(slot.id);
    try {
      await manageOptionSlot(slot.id, 'release');
      setReleaseSlot(null);
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message || 'Could not release the slot.');
    } finally {
      setBusySlot('');
    }
  }

  async function adjustExpiry(slot: OptionSlot) {
    const value = expiryInputs[slot.id];
    if (!value) {
      setError('Choose a slot expiry time.');
      return;
    }
    setBusySlot(slot.id);
    setError('');
    try {
      await manageOptionSlot(slot.id, 'adjust_expiry', new Date(value).toISOString());
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message || 'Could not adjust the slot expiry time.');
    } finally {
      setBusySlot('');
    }
  }

  return (
    <section className="queue-management glass">
      <div className="queue-heading">
        <div>
          <h2 className="h2">Queue and account slots</h2>
          <p className="muted small">Two independently managed slots per option. Cooldowns begin when processing starts.</p>
        </div>
        <button className="btn ghost sm" onClick={load} disabled={loading} aria-label="Refresh queues">
          {loading ? <Loader2 size={14} className="spin" /> : <RotateCw size={14} />} Refresh
        </button>
      </div>
      {error && <p className="banner error" role="alert">{error}</p>}
      {loading && !capacity ? <div className="center"><Loader2 className="spin" /></div> : capacity?.map((option) => {
        const optionSlots = slots.filter((slot) => slot.option_id === option.option_id);
        const waiting = requests
          .filter((request) => request.option_id === option.option_id && request.status === 'ordered' && !assignedIds.has(request.id))
          .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
        const estimates = estimateQueue(optionSlots, waiting);
        const availableNow = optionSlots.some((slot) =>
          !slot.current_request_id && (!slot.expires_at || Date.parse(slot.expires_at) <= Date.now()));
        const nextAvailability = optionSlots
          .map((slot) => slot.expires_at ?? (slot.current_request_id && slot.reserved_at
            ? new Date(Math.max(Date.parse(slot.reserved_at), Date.now()) + 24 * 60 * 60 * 1000).toISOString()
            : null))
          .filter((value): value is string => Boolean(value))
          .sort()[0];

        return (
          <article className="queue-option" key={option.option_id}>
            <header className="queue-option-head">
              <h3>{option.option_name}</h3>
              <span className="muted small">Outstanding {option.outstanding_count}/14 · Waiting {option.waiting_count} · Reserved {option.reserved_count} · In progress {option.in_progress_count}</span>
            </header>
            <p className="queue-next muted small">
              Slots occupied: {optionSlots.filter((slot) => slot.current_request_id || (slot.expires_at && Date.parse(slot.expires_at) > Date.now())).length}/2
              {' · '}Next availability: {availableNow ? 'Available now' : nextAvailability ? fmtDateTime(nextAvailability) : 'Awaiting processing start'}
            </p>
            <div className="queue-slots">
              {optionSlots.map((slot) => {
                const request = (slot.current_request_id ? currentRequests.get(slot.current_request_id) : null) ?? slot.request ?? null;
                const isReserved = Boolean(slot.current_request_id && !slot.expires_at);
                const occupied = Boolean(slot.current_request_id || (slot.expires_at && Date.parse(slot.expires_at) > Date.now()));
                return (
                  <div className="queue-slot" key={slot.id}>
                    <div className="queue-slot-title">
                      <strong>Slot {slot.slot_number}</strong>
                      <span className={`pill ${occupied ? 'failed' : 'sent'}`}>{isReserved ? 'Reserved' : occupied ? 'Cooling down' : 'Available'}</span>
                    </div>
                    {request && <p className="small">{request.customer_name} · {request.ticket_reference} · {request.status === 'in_progress' ? 'In Progress' : 'Waiting to start'}</p>}
                    {!request && slot.expires_at && <p className="small">Cooldown retained after request removal</p>}
                    {slot.reserved_at && <p className="muted small">{slot.processing_started_at ? `Started ${fmtDateTime(slot.processing_started_at)}` : `Reserved ${fmtDateTime(slot.reserved_at)}`}</p>}
                    {isReserved && <p className="muted small">Cancel this request to release its reservation.</p>}
                    {slot.expires_at && (
                      <div className="slot-expiry">
                        <label className="muted small" htmlFor={`expiry-${slot.id}`}>Expires {fmtDateTime(slot.expires_at)} · {remaining(slot.expires_at)}</label>
                        <div className="slot-controls">
                          <input id={`expiry-${slot.id}`} type="datetime-local" value={expiryInputs[slot.id] ?? localDateTimeValue(slot.expires_at)}
                            onChange={(e) => setExpiryInputs((current) => ({ ...current, [slot.id]: e.target.value }))} />
                          <button className="btn ghost sm" onClick={() => adjustExpiry(slot)} disabled={busySlot === slot.id}>Adjust</button>
                        </div>
                      </div>
                    )}
                    {occupied && !isReserved && <button className="btn danger sm" onClick={() => setReleaseSlot(slot)} disabled={busySlot === slot.id}>Release slot</button>}
                  </div>
                );
              })}
            </div>
            {waiting.length > 0 && (
              <div className="queue-waiting">
                <h4>Waiting queue</h4>
                <ol>
                  {waiting.map((request) => {
                    const estimate = estimates.get(request.id);
                    return <li key={request.id}>
                      <span>#{estimate?.position ?? '—'} · {request.ticket_reference}</span>
                      <span className="muted small">{estimate ? `Estimated slot ${fmtDateTime(estimate.estimatedSlotAt.toISOString())}` : 'Estimate unavailable'}</span>
                    </li>;
                  })}
                </ol>
              </div>
            )}
          </article>
        );
      })}
      {releaseSlot && (
        <ConfirmDialog
          title="Release account slot?"
          message={`Slot ${releaseSlot.slot_number} will become available immediately and may be reserved for the next request in this option's queue.`}
          confirmLabel="Release slot"
          busy={busySlot === releaseSlot.id}
          onConfirm={() => release(releaseSlot)}
          onCancel={() => setReleaseSlot(null)}
        />
      )}
    </section>
  );
}

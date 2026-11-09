import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Wordmark } from '../components/Wordmark';
import { StatusBadge } from '../components/StatusBadge';
import { ApiError, trackRequest } from '../services/api';
import { fmtDate, fmtDateTime } from '../lib/format';
import { STATUSES, STATUS_LABEL, type TrackResult } from '../types';

export default function Track() {
  const { token = '' } = useParams();
  const [data, setData] = useState<TrackResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try { setData(await trackRequest(token)); } catch (e) { setError(e as ApiError); } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => load(false), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const progressStatuses = STATUSES.filter((status) => status !== 'cancelled');
  const step = data && data.status !== 'cancelled' ? progressStatuses.indexOf(data.status) : 0;
  const waitHours = data?.estimatedSlotAt
    ? Math.max(0, Math.ceil((Date.parse(data.estimatedSlotAt) - Date.now()) / 3_600_000))
    : null;
  return (
    <div className="page">
      <header className="topbar"><Wordmark /></header>
      <main className="container narrow">
        {loading && <div className="center"><Loader2 className="spin" /></div>}
        {!loading && error && (
          <div className="empty glass">
            <h2>{error.code === 'not_found' ? 'Request not found' : 'Could not load request'}</h2>
            <p className="muted">{error.code === 'not_found' ? 'Check that you opened the full link from your email.' : error.message}</p>
            {error.code !== 'not_found' && <button className="btn primary" onClick={() => load()}>Try again</button>}
          </div>
        )}
        {!loading && data && (
          <section className="glass panel" style={{ '--accent': data.accent } as React.CSSProperties}>
            <div className="panel-head">
              <div><p className="muted small">Ticket</p><h1 className="ref">{data.ticketReference}</h1></div>
              <StatusBadge status={data.status} label={data.status === 'ordered' ? data.slotReserved ? 'Slot reserved' : 'Waiting' : undefined} />
            </div>
            {data.status !== 'cancelled' && <ol className="steps">
              {progressStatuses.map((s, i) => (
                <li key={s} className={i < step ? 'done' : i === step ? 'current' : ''}>
                  <span className="step-dot">{i <= step && data.status === 'completed' || i < step ? <Check size={12} /> : null}</span>
                  {STATUS_LABEL[s]}
                </li>
              ))}
            </ol>}
            <dl className="details">
              <div><dt>Request</dt><dd><span className="dot inline" />{data.optionName}</dd></div>
              <div><dt>Submitted</dt><dd>{fmtDate(data.createdAt)}</dd></div>
              <div><dt>Due date</dt><dd>{fmtDate(data.dueDate)}</dd></div>
              <div><dt>Last updated</dt><dd>{fmtDateTime(data.updatedAt)}</dd></div>
            </dl>
            {data.status === 'ordered' && !data.slotReserved && (
              <section className="queue-status" aria-label="Queue status">
                <h2>Your request is waiting</h2>
                <dl className="details">
                  <div><dt>Queue position</dt><dd>{data.queuePosition === null ? 'Updating…' : `#${data.queuePosition}`}</dd></div>
                  <div><dt>People ahead</dt><dd>{data.peopleAhead ?? '—'}</dd></div>
                  <div><dt>Estimated wait</dt><dd>{waitHours === null ? 'Calculating…' : `${waitHours} ${waitHours === 1 ? 'hour' : 'hours'}`}</dd></div>
                  <div><dt>Estimated slot availability</dt><dd>{data.estimatedSlotAt ? fmtDateTime(data.estimatedSlotAt) : 'Calculating…'}</dd></div>
                </dl>
                <p className="muted small">Estimates are not guaranteed and may change as the queue changes.</p>
              </section>
            )}
            {data.status === 'ordered' && data.slotReserved && (
              <section className="queue-status" aria-label="Slot reservation">
                <h2>Slot reserved</h2>
                <p>Waiting for an administrator to start processing. The 24-hour cooldown has not started yet.</p>
                {data.slotNumber && <p className="muted small">Account slot {data.slotNumber} reserved {data.slotReservedAt ? fmtDateTime(data.slotReservedAt) : ''}</p>}
              </section>
            )}
            {data.status === 'in_progress' && (
              <section className="queue-status" aria-label="Processing details">
                <h2>In Progress</h2>
                {data.slotNumber && <p>Account slot {data.slotNumber}</p>}
                {data.processingStartedAt && <p>Processing started {fmtDateTime(data.processingStartedAt)}</p>}
                {data.slotExpiresAt && <p>Expected slot release {fmtDateTime(data.slotExpiresAt)}</p>}
              </section>
            )}
            {data.status === 'cancelled' && <p className="banner warn">This request has been cancelled.</p>}
            {data.issueReason && (
              <div className="banner error" role="status">
                <strong>There’s an issue with this request</strong>
                <p>{data.issueReason}</p>
                {data.issueReportedAt && <p className="small muted">Reported {fmtDateTime(data.issueReportedAt)}</p>}
                <p>Please fill out another request.</p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

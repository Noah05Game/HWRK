import { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCw, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StatusBadge } from '../components/StatusBadge';
import { UserAreaNav } from '../components/UserAreaNav';
import { Wordmark } from '../components/Wordmark';
import { cancelOwnRequest, listUserRequests } from '../services/accounts';
import { fmtDate, fmtDateTime } from '../lib/format';
import { STATUS_LABEL, type UserRequest } from '../types';

export default function UserRequests() {
  const [requests, setRequests] = useState<UserRequest[] | null>(null);
  const [error, setError] = useState('');
  const [cancelTarget, setCancelTarget] = useState<UserRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setRequests(await listUserRequests());
    } catch (e) {
      setError((e as Error).message || 'Could not load your requests.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function cancelRequest() {
    if (!cancelTarget) return;
    setBusy(true);
    setError('');
    try {
      await cancelOwnRequest(cancelTarget.id);
      setCancelTarget(null);
      await load();
    } catch (e) {
      setError((e as Error).message || 'Could not cancel this request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <Wordmark />
        <UserAreaNav />
      </header>
      <main className="container">
        <div className="accounts-heading user-requests-heading">
          <div>
            <h1 className="h2">My requests</h1>
            <p className="muted small">Track every request, its status, and recent updates.</p>
          </div>
          <button className="btn ghost sm" onClick={load} aria-label="Refresh requests">
            <RotateCw size={14} /> Refresh
          </button>
        </div>
        {error && <p className="banner error" role="alert">{error} <button className="btn ghost sm" onClick={load}>Retry</button></p>}
        {!requests && !error && <div className="center"><Loader2 className="spin" /></div>}
        {requests?.length === 0 && <div className="empty glass"><h2>No requests yet</h2><p className="muted">Your requests will appear here after you submit one.</p></div>}
        {requests && requests.length > 0 && (
          <div className="user-request-list">
            {requests.map((request) => (
              <article className="glass user-request-card" key={request.id} style={{ '--accent': request.accent } as React.CSSProperties}>
                <header className="user-request-head">
                  <div><p className="muted small">Ticket</p><h2 className="ref">{request.ticketReference}</h2></div>
                  <StatusBadge status={request.status} />
                </header>
                <dl className="details two">
                  <div><dt>Request</dt><dd><span className="dot inline" />{request.optionName}</dd></div>
                  <div><dt>Submitted</dt><dd>{fmtDate(request.createdAt)}</dd></div>
                  <div><dt>Due date</dt><dd>{fmtDate(request.dueDate)}</dd></div>
                  <div><dt>Last updated</dt><dd>{fmtDateTime(request.updatedAt)}</dd></div>
                  {request.slotNumber !== null && <div><dt>Account slot</dt><dd>{request.slotNumber}</dd></div>}
                  {request.slotReservedAt && <div><dt>Slot reserved</dt><dd>{fmtDateTime(request.slotReservedAt)}</dd></div>}
                  {request.processingStartedAt && <div><dt>Processing started</dt><dd>{fmtDateTime(request.processingStartedAt)}</dd></div>}
                  {request.slotExpiresAt && <div><dt>Expected slot release</dt><dd>{fmtDateTime(request.slotExpiresAt)}</dd></div>}
                </dl>
                {request.issueReason && (
                  <div className="banner error user-request-issue">
                    <strong>Issue reported</strong>
                    <p>{request.issueReason}</p>
                    {request.issueReportedAt && <p className="small muted">Reported {fmtDateTime(request.issueReportedAt)}</p>}
                  </div>
                )}
                <h3>Status history</h3>
                {request.history.length === 0
                  ? <p className="muted small">No status updates recorded.</p>
                  : <ul className="timeline">
                    {request.history.map((entry, index) => (
                      <li key={`${entry.changedAt}-${index}`}>
                        <span>{entry.previousStatus
                          ? `${STATUS_LABEL[entry.previousStatus]} to ${STATUS_LABEL[entry.newStatus]}`
                          : `Request received: ${STATUS_LABEL[entry.newStatus]}`}</span>
                        <span className="muted small">{fmtDateTime(entry.changedAt)}</span>
                      </li>
                    ))}
                  </ul>}
                {request.status === 'ordered' && (
                  <div className="actions start user-request-actions">
                    <button className="btn danger sm" onClick={() => setCancelTarget(request)} disabled={busy}>
                      <Trash2 size={14} /> Cancel request
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
      {cancelTarget && (
        <ConfirmDialog
          title="Cancel this request?"
          message={`${cancelTarget.ticketReference} will be cancelled and removed from the waiting queue. This cannot be undone.`}
          confirmLabel="Cancel request"
          busy={busy}
          onConfirm={cancelRequest}
          onCancel={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}

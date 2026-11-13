import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, RotateCw, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { StatusBadge } from './StatusBadge';
import { useToast } from '../hooks/useToast';
import { deleteCompletedRequest, reportRequestIssue, retryEmail, updateStatus } from '../services/api';
import { getServicePassword, listEmailLogs, listHistory, saveNotes } from '../services/admin';
import { getOptionSlots, replaceReservedSlot } from '../services/queue';
import { fmtDate, fmtDateTime, isOverdue } from '../lib/format';
import { STATUS_LABEL, type AdminRequest, type EmailLog, type HistoryRow, type OptionSlot, type Status } from '../types';

interface Props { request: AdminRequest; token: string; onClose: () => void; onChanged: () => void; onDeleted: () => void; onSessionError: (e: unknown) => void }

const EMAIL_LABEL: Record<string, string> = { request_created: 'Request received', request_in_progress: 'In progress', request_completed: 'Completed', request_issue: 'Issue reported', request_cancelled: 'Cancelled' };

export function RequestDetail({ request: r, token, onClose, onChanged, onDeleted, onSessionError }: Props) {
  const toast = useToast();
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [servicePassword, setServicePassword] = useState<string | null>(null);
  const [servicePasswordError, setServicePasswordError] = useState('');
  const [notes, setNotes] = useState(r.admin_notes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [showServicePassword, setShowServicePassword] = useState(false);
  const [issueReason, setIssueReason] = useState('');
  const [issueError, setIssueError] = useState('');
  const [reportingIssue, setReportingIssue] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState<Status | null>(null);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState('');
  const [replacementSlots, setReplacementSlots] = useState<OptionSlot[] | null>(null);
  const [loadingReplacementSlots, setLoadingReplacementSlots] = useState(false);
  const [pendingReplacementSlot, setPendingReplacementSlot] = useState<OptionSlot | null>(null);
  const [replacingSlot, setReplacingSlot] = useState(false);

  const loadExtras = useCallback(async () => {
    try { const [h, l] = await Promise.all([listHistory(r.id), listEmailLogs(r.id)]); setHistory(h); setLogs(l); }
    catch (e) { toast('error', `Could not load history: ${(e as Error).message}`); }
  }, [r.id, toast]);
  useEffect(() => { loadExtras(); }, [loadExtras]);
  useEffect(() => {
    let active = true;
    getServicePassword(r.id).then((password) => {
      if (active) setServicePassword(password);
    }).catch((e) => {
      if (active) {
        setServicePasswordError((e as Error).message);
        toast('error', `Could not load password: ${(e as Error).message}`);
      }
    });
    return () => { active = false; };
  }, [r.id, toast]);

  async function confirmStatus() {
    if (!pending) return;
    setBusy(true);
    try {
      const shouldNotify = notifyCustomer;
      const res = await updateStatus(token, r.id, pending, shouldNotify);
      if (!res.changed) toast('success', 'Status was already set.');
      else if (res.email === 'failed') toast('error', 'Status updated, but the email failed. Retry it from the email log.');
      else toast('success', res.email === 'sent' ? 'Status updated and customer notified.' : shouldNotify
        ? 'Status updated.' : 'Status updated. The customer can see it in request tracking.');
      setPending(null); onChanged(); loadExtras();
    } catch (e) { onSessionError(e); toast('error', (e as Error).message); }
    setBusy(false);
  }

  async function saveNote() {
    setSavingNotes(true);
    try { await saveNotes(r.id, notes); toast('success', 'Notes saved.'); onChanged(); }
    catch (e) { onSessionError(e); toast('error', `Could not save notes: ${(e as Error).message}`); }
    setSavingNotes(false);
  }

  async function submitIssue() {
    const reason = issueReason.trim();
    if (!reason || reason.length > 2000) {
      setIssueError('Enter an issue reason of 1 to 2,000 characters.');
      return;
    }
    setReportingIssue(true);
    setIssueError('');
    try {
      const result = await reportRequestIssue(token, r.id, reason);
      setIssueReason('');
      toast(result.email === 'sent' ? 'success' : 'error', result.email === 'sent'
        ? 'Issue saved, status page updated, and customer emailed.'
        : 'Issue saved and status page updated, but the email failed. Retry it from the email log.');
      onChanged();
      loadExtras();
    } catch (e) {
      onSessionError(e);
      setIssueError((e as Error).message);
    }
    setReportingIssue(false);
  }

  async function removeCompletedRequest() {
    setDeleting(true);
    try {
      await deleteCompletedRequest(token, r.id);
      toast('success', `${r.ticket_reference} deleted.`);
      onDeleted();
    } catch (e) {
      onSessionError(e);
      toast('error', (e as Error).message);
    }
    setDeleting(false);
  }

  async function retry(id: string) {
    setRetrying(id);
    try {
      const res = await retryEmail(token, id);
      toast(res.email === 'sent' ? 'success' : 'error', res.email === 'sent' ? 'Email sent.' : 'Email failed again.');
      loadExtras();
    } catch (e) { onSessionError(e); toast('error', (e as Error).message); }
    setRetrying('');
  }

  async function openReplacementSlots() {
    setLoadingReplacementSlots(true);
    try {
      const slots = await getOptionSlots();
      setReplacementSlots(slots.filter((slot) => slot.option_id === r.option_id));
    } catch (e) {
      onSessionError(e);
      toast('error', `Could not load account slots: ${(e as Error).message}`);
    } finally {
      setLoadingReplacementSlots(false);
    }
  }

  async function confirmReplaceSlot() {
    if (!pendingReplacementSlot) return;
    setReplacingSlot(true);
    try {
      const currentRequestId = pendingReplacementSlot.request?.id;
      if (!currentRequestId) throw new Error('The slot customer could not be verified. Refresh the slots and try again.');
      await replaceReservedSlot(r.id, pendingReplacementSlot.id, currentRequestId);
      toast('success', `Slot ${pendingReplacementSlot.slot_number} assigned to ${r.customer_name}. ${pendingReplacementSlot.request?.customer_name ?? 'The previous customer'} returned to the queue.`);
      setPendingReplacementSlot(null);
      setReplacementSlots(null);
      onChanged();
    } catch (e) {
      onSessionError(e);
      toast('error', `Could not replace the slot: ${(e as Error).message}`);
    } finally {
      setReplacingSlot(false);
    }
  }

  const overdue = isOverdue(r.due_date, r.status);
  const allowedStatuses: Status[] = r.status === 'ordered'
    ? ['in_progress', 'cancelled']
    : r.status === 'in_progress' ? ['completed', 'cancelled'] : [];
  return (
    <Modal title={r.ticket_reference} onClose={onClose} wide>
      <div className="detail-top"><StatusBadge status={r.status} />{overdue && <span className="badge overdue"><i />Overdue</span>}</div>
      <dl className="details two">
        <div><dt>Customer</dt><dd>{r.customer_name}</dd></div>
        <div><dt>Request</dt><dd>{r.request_options?.name ?? '—'}</dd></div>
        <div><dt>School email</dt><dd>{r.gmail_email}</dd></div>
        <div><dt>Contact email</dt><dd>{r.contact_email}</dd></div>
        <div><dt>School</dt><dd>{r.school_name || '—'}</dd></div>
        <div><dt>School login type</dt><dd>{r.school_login_type ? `${r.school_login_type[0].toUpperCase()}${r.school_login_type.slice(1)}` : '—'}</dd></div>
        <div><dt>Due</dt><dd>{fmtDate(r.due_date)}</dd></div>
        <div><dt>Submitted</dt><dd>{fmtDate(r.created_at)}</dd></div>
        {r.slot_number !== null && <div><dt>Account slot</dt><dd>{r.slot_number}</dd></div>}
        {r.slot_reserved_at && <div><dt>Slot reserved</dt><dd>{fmtDateTime(r.slot_reserved_at)}</dd></div>}
        {r.processing_started_at && <div><dt>Processing started</dt><dd>{fmtDateTime(r.processing_started_at)}</dd></div>}
        {r.slot_expires_at && <div><dt>Slot expiry</dt><dd>{fmtDateTime(r.slot_expires_at)}</dd></div>}
        <div><dt>Password</dt><dd className="ref">
          <span style={{ whiteSpace: 'pre-wrap' }}>{servicePasswordError ? 'Unavailable' : servicePassword === null ? 'Loading…' : showServicePassword ? servicePassword || 'Not recorded' : '••••••••'}</span>
          <button type="button" className="icon-btn" aria-label={showServicePassword ? 'Hide password' : 'Show password'} disabled={servicePassword === null} onClick={() => setShowServicePassword((shown) => !shown)}>
            {showServicePassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </dd></div>
        <div><dt>Updated</dt><dd>{fmtDateTime(r.updated_at)}</dd></div>
      </dl>
      {r.terms_version !== null && r.terms_text !== null && (
        <details className="terms-record">
          <summary>Terms accepted (version {r.terms_version})</summary>
          <div className="terms-copy">{r.terms_text}</div>
        </details>
      )}

      <h3>Status</h3>
      {r.status === 'ordered' && r.slot_number === null && (
        <>
          <p className="muted small">This request is waiting without a reserved account slot.</p>
          <div className="actions start">
            <button className="btn ghost sm" onClick={openReplacementSlots} disabled={loadingReplacementSlots}>
              {loadingReplacementSlots ? <><Loader2 size={14} className="spin" /> Loading slots</> : 'Replace slot'}
            </button>
          </div>
        </>
      )}
      <div className="segmented" role="group" aria-label="Change status">
        {allowedStatuses.map((s) => (
          <button key={s} onClick={() => { setNotifyCustomer(true); setPending(s); }}>{STATUS_LABEL[s]}</button>
        ))}
        {allowedStatuses.length === 0 && <p className="muted small">This request is closed.</p>}
      </div>

      <h3>Report an issue</h3>
      {r.issue_reason && (
        <p className="banner error"><strong>Current reported issue:</strong> {r.issue_reason}</p>
      )}
      <textarea value={issueReason} onChange={(e) => setIssueReason(e.target.value)} rows={3} maxLength={2000}
        placeholder="Explain why this request could not be completed" aria-label="Issue reason" />
      {issueError && <p className="error-text" role="alert">{issueError}</p>}
      <div className="actions start">
        <button className="btn primary sm" onClick={submitIssue} disabled={reportingIssue}>
          {reportingIssue ? 'Reporting…' : 'Report issue and email customer'}
        </button>
      </div>

      <h3>Delete order</h3>
      <div className="actions start">
        <button className="btn danger sm" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete order</button>
      </div>

      <h3>Private notes</h3>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={5000} placeholder="Only visible to admins" />
      <div className="actions start">
        <button className="btn primary sm" onClick={saveNote} disabled={savingNotes || notes === r.admin_notes}>{savingNotes ? 'Saving…' : 'Save notes'}</button>
      </div>

      <h3>History</h3>
      <ul className="timeline">
        {history.map((h) => (
          <li key={h.id}><span>{h.previous_status ? `${STATUS_LABEL[h.previous_status]} to ${STATUS_LABEL[h.new_status]}` : `Created as ${STATUS_LABEL[h.new_status]}`}</span><span className="muted small">{fmtDateTime(h.changed_at)}</span></li>
        ))}
      </ul>

      <h3>Emails</h3>
      {logs.length === 0 ? <p className="muted small">No emails recorded.</p> : (
        <ul className="timeline">
          {logs.map((l) => (
            <li key={l.id}>
              <span>
                {EMAIL_LABEL[l.email_type] ?? l.email_type} <span className={`pill ${l.delivery_status}`}>{l.delivery_status === 'sent' ? 'Sent' : 'Failed'}</span>
                {l.error_message && <span className="small muted block">{l.error_message}</span>}
              </span>
              <span className="row-end">
                <span className="muted small">{fmtDateTime(l.created_at)}</span>
                {l.delivery_status === 'failed' && (
                  <button className="btn ghost sm" onClick={() => retry(l.id)} disabled={retrying === l.id}>
                    {retrying === l.id ? <Loader2 size={14} className="spin" /> : <RotateCw size={14} />} Retry
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <ConfirmDialog title={`Change status to ${STATUS_LABEL[pending]}?`}
          message={`${r.ticket_reference} will move from ${STATUS_LABEL[r.status]} to ${STATUS_LABEL[pending]}.`}
          confirmLabel="Change status" busy={busy} onConfirm={confirmStatus} onCancel={() => setPending(null)}>
          <label className="terms-check status-notification">
            <input type="checkbox" checked={notifyCustomer} onChange={(event) => setNotifyCustomer(event.target.checked)} disabled={busy} />
            <span>Email the customer about this update. If unchecked, the new status will only appear in their tracking menu.</span>
          </label>
        </ConfirmDialog>
      )}
      {confirmDelete && (
        <ConfirmDialog title="Delete order?" message={`${r.ticket_reference} and its history and email logs will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete order" busy={deleting} onConfirm={removeCompletedRequest} onCancel={() => setConfirmDelete(false)} />
      )}
      {replacementSlots && (
        <Modal title="Replace reserved slot" onClose={() => setReplacementSlots(null)} wide>
          <p className="muted">
            Choose a reserved slot to give to {r.customer_name}. The current customer will return to the waiting queue.
            Slots that are already processing cannot be replaced.
          </p>
          {replacementSlots.length === 0 && <p className="muted">No account slots are configured for this request.</p>}
          <div className="replacement-slots">
            {replacementSlots.map((slot) => {
              const canReplace = Boolean(slot.current_request_id && slot.request?.status === 'ordered'
                && !slot.processing_started_at && !slot.expires_at);
              return (
                <div className="replacement-slot" key={slot.id}>
                  <div>
                    <strong>Slot {slot.slot_number}</strong>
                    {slot.request
                      ? <p className="small">{slot.request.customer_name} · {slot.request.ticket_reference} · {slot.request.status === 'in_progress' ? 'In Progress' : 'Waiting to start'}</p>
                      : <p className="muted small">{slot.current_request_id ? 'Customer details unavailable' : slot.expires_at ? 'Cooling down' : 'Available'}</p>}
                    {slot.processing_started_at && <p className="muted small">Started {fmtDateTime(slot.processing_started_at)}</p>}
                  </div>
                  {canReplace ? (
                    <button className="btn warning sm" onClick={() => setPendingReplacementSlot(slot)}>
                      Replace this slot
                    </button>
                  ) : <span className="muted small">{slot.expires_at ? 'Cooling down' : slot.current_request_id ? 'Cannot replace' : 'Available'}</span>}
                </div>
              );
            })}
          </div>
          {pendingReplacementSlot && (
            <ConfirmDialog
              title={`Replace slot ${pendingReplacementSlot.slot_number}?`}
              message={`${r.customer_name} will take this slot. ${pendingReplacementSlot.request?.customer_name ?? 'The current customer'} will return to the waiting queue.`}
              confirmLabel="Replace slot"
              busy={replacingSlot}
              onConfirm={confirmReplaceSlot}
              onCancel={() => setPendingReplacementSlot(null)}
            />
          )}
        </Modal>
      )}
    </Modal>
  );
}

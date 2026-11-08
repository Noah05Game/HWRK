import { Check, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from './Modal';
import { fmtDate } from '../lib/format';
import type { SubmitResult } from '../types';

export function Confirmation({ result, onClose }: { result: SubmitResult; onClose: () => void }) {
  return (
    <Modal title="Request submitted" onClose={onClose}>
      <div className="success-mark"><Check size={26} /></div>
      <dl className="details">
        <div><dt>Ticket</dt><dd className="ref">{result.ticketReference}</dd></div>
        <div><dt>Request</dt><dd>{result.optionName}</dd></div>
        <div><dt>Requested due date</dt><dd>{fmtDate(result.dueDate)}</dd></div>
      </dl>
      {result.emailSent ? (
        <p className="muted">A confirmation email with your private tracking link has been sent.</p>
      ) : (
        <p className="banner warn"><TriangleAlert size={16} /> Your request is saved, but the confirmation email could not be sent. Keep your tracking link below.</p>
      )}
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Done</button>
        <Link className="btn primary" to={`/t/${result.trackingToken}`}>Track request</Link>
      </div>
    </Modal>
  );
}

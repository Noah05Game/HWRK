import { Modal } from './Modal';

interface Props { title: string; message: string; confirmLabel: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }

export function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onCancel }: Props) {
  return (
    <Modal title={title} onClose={onCancel} locked={busy}>
      <p className="muted">{message}</p>
      <div className="actions">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn primary" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}

import { STATUS_LABEL, type Status } from '../types';

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  return <span className={`badge ${status}`}><i />{label ?? STATUS_LABEL[status]}</span>;
}

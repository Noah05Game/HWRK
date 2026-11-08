import { STATUS_LABEL, type Status } from '../types';

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge ${status}`}><i />{STATUS_LABEL[status]}</span>;
}

import type { ReactNode } from 'react';
import { Wordmark } from '../components/Wordmark';

export function AdminLayout({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-left"><Wordmark to="/admin" /><span className="muted small">Admin</span></div>
        <div className="topbar-actions">{actions}</div>
      </header>
      <main className="container wide">{children}</main>
    </div>
  );
}

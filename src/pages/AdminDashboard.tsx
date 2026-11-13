import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Ban, BarChart3, ClipboardList, Layers3, Loader2, LogOut, Megaphone, Search, Settings, Shield, Users } from 'lucide-react';
import { AdminLayout } from '../layouts/AdminLayout';
import { StatusBadge } from '../components/StatusBadge';
import { RequestDetail } from '../components/RequestDetail';
import { AdminAccounts } from '../components/AdminAccounts';
import { AdminLogs } from '../components/AdminLogs';
import { ProhibitedIps } from '../components/ProhibitedIps';
import { MaintenanceSettings } from '../components/MaintenanceSettings';
import { AnnouncementSettings } from '../components/AnnouncementSettings';
import { QueueManagement } from '../components/QueueManagement';
import { TermsSettings } from '../components/TermsSettings';
import { useToast } from '../hooks/useToast';
import { supabase } from '../lib/supabase';
import { isAdmin, listRequests } from '../services/admin';
import { ApiError } from '../services/api';
import { fmtDate, isOverdue } from '../lib/format';
import { STATUSES, STATUS_LABEL, type AdminRequest, type Status } from '../types';

type Sort = 'created_desc' | 'created_asc' | 'due_asc' | 'due_desc';
type Section = 'requests' | 'queue' | 'accounts' | 'prohibited-ips' | 'logs' | 'maintenance' | 'announcement' | 'terms';

const SECTIONS: { id: Section; label: string; icon: typeof ClipboardList }[] = [
  { id: 'requests', label: 'Requests', icon: ClipboardList },
  { id: 'queue', label: 'Queue', icon: Layers3 },
  { id: 'accounts', label: 'Accounts', icon: Users },
  { id: 'prohibited-ips', label: 'Prohibited IPs', icon: Ban },
  { id: 'logs', label: 'Logs', icon: BarChart3 },
  { id: 'maintenance', label: 'Lockdown', icon: Shield },
  { id: 'announcement', label: 'Announcement', icon: Megaphone },
  { id: 'terms', label: 'Terms', icon: Settings },
];

export default function AdminDashboard({ session }: { session: Session }) {
  const toast = useToast();
  const [authorised, setAuthorised] = useState<boolean | null>(null);
  const [rows, setRows] = useState<AdminRequest[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [sort, setSort] = useState<Sort>('created_desc');
  const [openId, setOpenId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('requests');

  const signOut = useCallback(() => supabase.auth.signOut(), []);
  const handleSessionError = useCallback((e: unknown) => {
    if ((e as ApiError).code === 'session' || /jwt|expired/i.test((e as Error)?.message ?? '')) {
      toast('error', 'Your session has expired. Sign in again.');
      signOut();
    }
  }, [signOut, toast]);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const ok = await isAdmin();
      setAuthorised(ok);
      if (ok) setRows(await listRequests());
    } catch (e) {
      handleSessionError(e);
      setLoadError((e as Error).message || 'Could not load requests.');
    }
  }, [handleSessionError]);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const c = { total: rows?.length ?? 0, ordered: 0, in_progress: 0, completed: 0, cancelled: 0 };
    rows?.forEach((r) => { c[r.status]++; });
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (rows ?? []).filter((r) =>
      (filter === 'all' || r.status === filter) && (!q || r.ticket_reference.toLowerCase().includes(q) || r.customer_name.toLowerCase().includes(q)));
    const key = sort.startsWith('due') ? 'due_date' : 'created_at';
    const dir = sort.endsWith('asc') ? 1 : -1;
    return [...list].sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0));
  }, [rows, query, filter, sort]);

  const open = rows?.find((r) => r.id === openId) ?? null;
  const actions = (
    <>
      <button className="btn ghost sm" onClick={signOut}><LogOut size={15} /> Sign out</button>
    </>
  );

  if (authorised === false) {
    return (
      <AdminLayout actions={actions}>
        <div className="empty glass"><h2>Not authorised</h2><p className="muted">This account does not have admin access.</p></div>
      </AdminLayout>
    );
  }

  if (authorised === null) {
    return (
      <AdminLayout actions={actions}>
        {loadError
          ? <p className="banner error" role="alert">{loadError} <button className="btn ghost sm" onClick={load}>Retry</button></p>
          : <div className="center"><Loader2 className="spin" /></div>}
      </AdminLayout>
    );
  }

  const statCards: [string, number, string][] = [['Total requests', stats.total, 'total'], ['Waiting', stats.ordered, 'ordered'], ['In Progress', stats.in_progress, 'in_progress'], ['Completed', stats.completed, 'completed'], ['Cancelled', stats.cancelled, 'cancelled']];

  return (
    <AdminLayout actions={actions}>
      <nav className="admin-nav" aria-label="Admin sections">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={`admin-nav-item ${section === id ? 'active' : ''}`}
            aria-current={section === id ? 'page' : undefined} onClick={() => { setSection(id); setOpenId(null); }}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>

      {section === 'requests' && <>
        <section className="stats">
          {statCards.map(([label, n, k]) => (
            <div key={k} className={`stat glass ${k}`}><span className="muted small">{label}</span><strong>{n}</strong></div>
          ))}
        </section>
        <div className="toolbar">
          <div className="search"><Search size={16} /><input placeholder="Search ticket or customer" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" /></div>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Status | 'all')} aria-label="Filter by status">
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="created_desc">Newest submitted</option><option value="created_asc">Oldest submitted</option>
            <option value="due_asc">Due soonest</option><option value="due_desc">Due latest</option>
          </select>
        </div>
        {loadError && <p className="banner error" role="alert">{loadError} <button className="btn ghost sm" onClick={load}>Retry</button></p>}
        {!rows && !loadError && <div className="center"><Loader2 className="spin" /></div>}
        {rows && visible.length === 0 && (
          <div className="empty glass"><h2>{rows.length === 0 ? 'No requests yet' : 'No matching requests'}</h2>
            <p className="muted">{rows.length === 0 ? 'New requests will appear here.' : 'Try a different search or filter.'}</p></div>
        )}
        {visible.length > 0 && (
          <div className="glass table-wrap">
            <table className="requests">
              <thead><tr><th>Ticket</th><th>Customer</th><th>Request</th><th>School email</th><th>Contact</th><th>Due</th><th>Submitted</th><th>Status</th></tr></thead>
              <tbody>
                {visible.map((r) => {
                  const overdue = isOverdue(r.due_date, r.status);
                  return (
                    <tr key={r.id} className={overdue ? 'overdue' : ''} onClick={() => setOpenId(r.id)} tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.id); }}>
                      <td data-label="Ticket" className="ref">{r.ticket_reference}</td>
                      <td data-label="Customer">{r.customer_name}</td>
                      <td data-label="Request">{r.request_options?.name}</td>
                      <td data-label="School email">{r.gmail_email}</td>
                      <td data-label="Contact">{r.contact_email}</td>
                      <td data-label="Due" className={overdue ? 'due-over' : ''}>{fmtDate(r.due_date)}</td>
                      <td data-label="Submitted">{fmtDate(r.created_at)}</td>
                      <td data-label="Status"><StatusBadge status={r.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {open && <RequestDetail key={open.id} request={open} token={session.access_token} onClose={() => setOpenId(null)} onChanged={load} onDeleted={() => { setOpenId(null); load(); }} onSessionError={handleSessionError} />}
      </>}
      {section === 'queue' && rows && <QueueManagement requests={rows} onChanged={load} />}
      {section === 'queue' && !rows && loadError && <p className="banner error" role="alert">{loadError} <button className="btn ghost sm" onClick={load}>Retry</button></p>}
      {section === 'queue' && !rows && !loadError && <div className="center"><Loader2 className="spin" /></div>}
      {section === 'accounts' && <AdminAccounts currentUserId={session.user.id} />}
      {section === 'prohibited-ips' && <ProhibitedIps />}
      {section === 'logs' && <AdminLogs />}
      {section === 'maintenance' && <MaintenanceSettings />}
      {section === 'announcement' && <AnnouncementSettings />}
      {section === 'terms' && <TermsSettings />}
    </AdminLayout>
  );
}

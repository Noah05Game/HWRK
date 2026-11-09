import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Loader2, LogOut, Search } from 'lucide-react';
import { AdminLayout } from '../layouts/AdminLayout';
import { StatusBadge } from '../components/StatusBadge';
import { RequestDetail } from '../components/RequestDetail';
import { TermsSettings } from '../components/TermsSettings';
import { useToast } from '../hooks/useToast';
import { supabase } from '../lib/supabase';
import { isAdmin, listRequests } from '../services/admin';
import { ApiError } from '../services/api';
import { fmtDate, isOverdue } from '../lib/format';
import { STATUSES, STATUS_LABEL, type AdminRequest, type Status } from '../types';

type Sort = 'created_desc' | 'created_asc' | 'due_asc' | 'due_desc';

export default function AdminDashboard({ session }: { session: Session }) {
  const toast = useToast();
  const [authorised, setAuthorised] = useState<boolean | null>(null);
  const [rows, setRows] = useState<AdminRequest[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [sort, setSort] = useState<Sort>('created_desc');
  const [openId, setOpenId] = useState<string | null>(null);

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
    const c = { total: rows?.length ?? 0, ordered: 0, in_progress: 0, completed: 0 };
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

  const statCards: [string, number, string][] = [['Total requests', stats.total, 'total'], ['Ordered', stats.ordered, 'ordered'], ['In Progress', stats.in_progress, 'in_progress'], ['Completed', stats.completed, 'completed']];

  return (
    <AdminLayout actions={actions}>
      {authorised && <TermsSettings />}
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
            <thead><tr><th>Ticket</th><th>Customer</th><th>Request</th><th>Gmail</th><th>Contact</th><th>Due</th><th>Submitted</th><th>Status</th></tr></thead>
            <tbody>
              {visible.map((r) => {
                const overdue = isOverdue(r.due_date, r.status);
                return (
                  <tr key={r.id} className={overdue ? 'overdue' : ''} onClick={() => setOpenId(r.id)} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.id); }}>
                    <td data-label="Ticket" className="ref">{r.ticket_reference}</td>
                    <td data-label="Customer">{r.customer_name}</td>
                    <td data-label="Request">{r.request_options?.name}</td>
                    <td data-label="Gmail">{r.gmail_email}</td>
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
    </AdminLayout>
  );
}

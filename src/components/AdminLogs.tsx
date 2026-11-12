import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { getSiteAnalytics } from '../services/admin';
import type { SiteAnalyticsDay } from '../types';

export function AdminLogs() {
  const [days, setDays] = useState<SiteAnalyticsDay[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setDays(await getSiteAnalytics(30));
    } catch (e) {
      setError((e as Error).message || 'Could not load aggregate site analytics.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => (days ?? []).reduce(
    (result, row) => ({
      views: result.views + Number(row.page_views),
      submissions: result.submissions + Number(row.request_submissions),
    }),
    { views: 0, submissions: 0 },
  ), [days]);
  const conversion = totals.views ? totals.submissions / totals.views * 100 : 0;

  return (
    <section className="admin-panel glass">
      <header className="admin-panel-heading">
        <div>
          <h2 className="h2">Privacy-friendly activity</h2>
          <p className="muted small">Daily aggregate counts only. No account details, email addresses, IPs, cookies, or individual visit records are stored with these metrics. Page views are not unique people.</p>
        </div>
        <button className="btn ghost sm" onClick={load} aria-label="Refresh activity logs"><RotateCw size={14} /> Refresh</button>
      </header>
      {error && <p className="banner error" role="alert">{error}</p>}
      {!days && !error && <div className="center"><Loader2 className="spin" /></div>}
      {days && <>
        <div className="analytics-summary">
          <article className="analytics-stat"><span className="muted small">Page views · last 30 days</span><strong>{totals.views.toLocaleString()}</strong></article>
          <article className="analytics-stat"><span className="muted small">Successful requests</span><strong>{totals.submissions.toLocaleString()}</strong></article>
          <article className="analytics-stat"><span className="muted small">Submissions per page view</span><strong>{conversion.toFixed(1)}%</strong></article>
        </div>
        {days.length === 0 ? <p className="empty muted">No activity recorded yet.</p> : (
          <div className="table-wrap">
            <table className="account-table">
              <thead><tr><th>Date (UTC)</th><th>Page views</th><th>Successful requests</th></tr></thead>
              <tbody>{days.map((day) => (
                <tr key={day.day}>
                  <td data-label="Date (UTC)">{day.day}</td>
                  <td data-label="Page views">{Number(day.page_views).toLocaleString()}</td>
                  <td data-label="Successful requests">{Number(day.request_submissions).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </>}
    </section>
  );
}

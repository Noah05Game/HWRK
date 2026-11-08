import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Wordmark } from '../components/Wordmark';
import { StatusBadge } from '../components/StatusBadge';
import { ApiError, trackRequest } from '../services/api';
import { fmtDate, fmtDateTime } from '../lib/format';
import { STATUSES, STATUS_LABEL, type TrackResult } from '../types';

export default function Track() {
  const { token = '' } = useParams();
  const [data, setData] = useState<TrackResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await trackRequest(token)); } catch (e) { setError(e as ApiError); } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const step = data ? STATUSES.indexOf(data.status) : 0;
  return (
    <div className="page">
      <header className="topbar"><Wordmark /></header>
      <main className="container narrow">
        {loading && <div className="center"><Loader2 className="spin" /></div>}
        {!loading && error && (
          <div className="empty glass">
            <h2>{error.code === 'not_found' ? 'Request not found' : 'Could not load request'}</h2>
            <p className="muted">{error.code === 'not_found' ? 'Check that you opened the full link from your email.' : error.message}</p>
            {error.code !== 'not_found' && <button className="btn primary" onClick={load}>Try again</button>}
          </div>
        )}
        {!loading && data && (
          <section className="glass panel" style={{ '--accent': data.accent } as React.CSSProperties}>
            <div className="panel-head">
              <div><p className="muted small">Ticket</p><h1 className="ref">{data.ticketReference}</h1></div>
              <StatusBadge status={data.status} />
            </div>
            <ol className="steps">
              {STATUSES.map((s, i) => (
                <li key={s} className={i < step ? 'done' : i === step ? 'current' : ''}>
                  <span className="step-dot">{i <= step && data.status === 'completed' || i < step ? <Check size={12} /> : null}</span>
                  {STATUS_LABEL[s]}
                </li>
              ))}
            </ol>
            <dl className="details">
              <div><dt>Request</dt><dd><span className="dot inline" />{data.optionName}</dd></div>
              <div><dt>Submitted</dt><dd>{fmtDate(data.createdAt)}</dd></div>
              <div><dt>Due date</dt><dd>{fmtDate(data.dueDate)}</dd></div>
              <div><dt>Last updated</dt><dd>{fmtDateTime(data.updatedAt)}</dd></div>
            </dl>
            {data.issueReason && (
              <div className="banner error" role="status">
                <strong>There’s an issue with this request</strong>
                <p>{data.issueReason}</p>
                {data.issueReportedAt && <p className="small muted">Reported {fmtDateTime(data.issueReportedAt)}</p>}
                <p>Please fill out another request.</p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

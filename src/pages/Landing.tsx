import { useCallback, useEffect, useState } from 'react';
import { REQUEST_OPTIONS } from '../config/options';
import { Wordmark } from '../components/Wordmark';
import { RequestForm } from '../components/RequestForm';
import { Confirmation } from '../components/Confirmation';
import { isConfigured } from '../lib/supabase';
import { getMaintenanceSettings } from '../services/maintenance';
import type { RequestOption, SubmitResult } from '../types';

export default function Landing() {
  const [selected, setSelected] = useState<RequestOption | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [maintenance, setMaintenance] = useState<boolean | null>(null);
  const [maintenanceError, setMaintenanceError] = useState('');

  const loadMaintenance = useCallback(async () => {
    setMaintenanceError('');
    try {
      const settings = await getMaintenanceSettings();
      setMaintenance(settings.maintenance_mode);
    } catch (e) {
      setMaintenanceError((e as Error).message || 'Could not verify service availability.');
    }
  }, []);

  useEffect(() => { loadMaintenance(); }, [loadMaintenance]);

  return (
    <div className="page">
      <header className="topbar"><Wordmark /></header>
      <main className="container">
        <h1 className={`hero ${maintenance ? 'maintenance-title' : ''}`}>{maintenance ? 'Down for maintenance' : 'Make a request'}</h1>
        {maintenance && (
          <section className="maintenance-banner" role="status">
            <h2>We’re performing maintenance</h2>
            <p>Be back soon.</p>
          </section>
        )}
        {maintenanceError && (
          <p className="banner error" role="alert">
            Request availability could not be verified. New requests are temporarily unavailable.
            <button className="btn ghost sm" onClick={loadMaintenance}>Retry</button>
          </p>
        )}
        {!isConfigured && <p className="banner error">Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>}
        <div className="options">
          {REQUEST_OPTIONS.map((o) => (
            <article key={o.key} className="card glass" style={{ '--accent': o.accent } as React.CSSProperties}>
              <span className="dot" />
              <h2>{o.name}</h2>
              <p className="muted">{o.description}</p>
              <button className="btn accent" disabled={maintenance === null || Boolean(maintenanceError) || maintenance}
                onClick={() => setSelected(o)}>Request</button>
            </article>
          ))}
        </div>
      </main>
      {selected && !result && (
        <RequestForm option={selected} onClose={() => setSelected(null)} onSuccess={(r) => { setResult(r); }} />
      )}
      {result && <Confirmation result={result} onClose={() => { setResult(null); setSelected(null); }} />}
    </div>
  );
}

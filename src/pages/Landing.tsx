import { useState } from 'react';
import { REQUEST_OPTIONS } from '../config/options';
import { Wordmark } from '../components/Wordmark';
import { RequestForm } from '../components/RequestForm';
import { Confirmation } from '../components/Confirmation';
import { isConfigured } from '../lib/supabase';
import type { RequestOption, SubmitResult } from '../types';

export default function Landing() {
  const [selected, setSelected] = useState<RequestOption | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  return (
    <div className="page">
      <header className="topbar"><Wordmark /></header>
      <main className="container">
        <h1 className="hero">Make a request</h1>
        {!isConfigured && <p className="banner error">Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>}
        <div className="options">
          {REQUEST_OPTIONS.map((o) => (
            <article key={o.key} className="card glass" style={{ '--accent': o.accent } as React.CSSProperties}>
              <span className="dot" />
              <h2>{o.name}</h2>
              <p className="muted">{o.description}</p>
              <button className="btn accent" onClick={() => setSelected(o)}>Request</button>
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

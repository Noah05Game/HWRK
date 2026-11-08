import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Wordmark } from '../components/Wordmark';
import { supabase, isConfigured } from '../lib/supabase';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    if (!isConfigured) { setError('Supabase is not configured.'); setBusy(false); return; }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message);
    } catch {
      setError('Network error. Check your connection and try again.');
    }
    setBusy(false);
  }

  return (
    <div className="page">
      <header className="topbar"><Wordmark /></header>
      <main className="container narrow">
        <form className="glass panel" onSubmit={submit}>
          <h1 className="h2">Sign in</h1>
          <div className="field"><label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="field"><label htmlFor="pw">Password</label>
            <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          {error && <p className="banner error" role="alert">{error}</p>}
          <button className="btn primary block" disabled={busy}>{busy ? <><Loader2 size={16} className="spin" /> Signing in</> : 'Sign in'}</button>
        </form>
      </main>
    </div>
  );
}

import { useCallback, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { Wordmark } from '../components/Wordmark';
import { isConfigured, supabase } from '../lib/supabase';
import { verifyPersonalGoogleAccount } from '../services/accounts';

type EmailMode = 'sign_up' | 'sign_in';
type ProviderBusy = 'email' | 'apple' | 'google' | '';

const redirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;

export default function AccountAccess() {
  const [mode, setMode] = useState<EmailMode>('sign_up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<ProviderBusy>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleGoogleError = useCallback((detail: string) => {
    setError(detail);
    setBusy('');
  }, []);

  const handleGoogleCredential = useCallback(async (idToken: string) => {
    setBusy('google');
    setError('');
    setMessage('');
    try {
      if (!isConfigured) throw new Error('Supabase is not configured.');
      const { data, error: signInError } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
      if (signInError) throw signInError;
      if (!data.session) throw new Error('Google sign-in did not create a session.');
      try {
        await verifyPersonalGoogleAccount(idToken, data.session.access_token);
      } catch (verificationError) {
        await supabase.auth.signOut();
        throw verificationError;
      }
    } catch (e) {
      setError((e as Error).message || 'Could not sign in with Google.');
      setBusy('');
    }
  }, []);

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy('email');
    setError('');
    setMessage('');
    if (!isConfigured) {
      setError('Supabase is not configured.');
      setBusy('');
      return;
    }
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      setBusy('');
      return;
    }

    try {
      if (mode === 'sign_up') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectUrl },
        });
        if (signUpError) throw signUpError;
        if (!data.session) setMessage('Check your email to confirm your account, then sign in here.');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (e) {
      setError((e as Error).message || 'Could not continue with email.');
    } finally {
      setBusy('');
    }
  }

  async function continueWithApple() {
    if (busy) return;
    setBusy('apple');
    setError('');
    setMessage('');
    if (!isConfigured) {
      setError('Supabase is not configured.');
      setBusy('');
      return;
    }
    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo: redirectUrl },
      });
      if (signInError) throw signInError;
    } catch (e) {
      setError((e as Error).message || 'Could not start Apple sign-in.');
      setBusy('');
    }
  }

  return (
    <div className="page">
      <header className="topbar"><Wordmark /></header>
      <main className="container narrow">
        <section className="glass panel account-panel">
          <h1 className="h2">Create your account</h1>
          <p className="muted small">Create an account to continue. Your account email will be used for contact.</p>
          <div className="account-providers">
            <GoogleSignIn disabled={Boolean(busy)} onCredential={handleGoogleCredential} onError={handleGoogleError} />
            <button type="button" className="btn ghost block" onClick={continueWithApple} disabled={Boolean(busy)}>
              {busy === 'apple' ? <><Loader2 size={16} className="spin" /> Connecting</> : 'Continue with Apple'}
            </button>
          </div>
          <div className="account-divider"><span>or continue with email</span></div>
          <form onSubmit={submitEmail}>
            <div className="field">
              <label htmlFor="account-email">Account email</label>
              <input id="account-email" type="email" autoComplete="email" maxLength={254}
                value={email} onChange={(e) => setEmail(e.target.value)} required disabled={Boolean(busy)} />
            </div>
            <div className="field">
              <label htmlFor="account-password">Account password</label>
              <input id="account-password" type="password"
                autoComplete={mode === 'sign_up' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} minLength={8}
                required disabled={Boolean(busy)} />
            </div>
            {error && <p className="error-text" role="alert">{error}</p>}
            {message && <p className="success-text" role="status">{message}</p>}
            <button className="btn primary block" disabled={Boolean(busy)}>
              {busy === 'email' ? <><Loader2 size={16} className="spin" /> {mode === 'sign_up' ? 'Creating account' : 'Signing in'}</>
                : mode === 'sign_up' ? 'Continue with Email' : 'Sign in with Email'}
            </button>
          </form>
          <p className="account-switch muted small">
            {mode === 'sign_up' ? 'Already have an account?' : 'New to HWRK?'}{' '}
            <button type="button" className="link-button" disabled={Boolean(busy)}
              onClick={() => { setMode(mode === 'sign_up' ? 'sign_in' : 'sign_up'); setError(''); setMessage(''); }}>
              {mode === 'sign_up' ? 'Sign in' : 'Create account'}
            </button>
          </p>
        </section>
      </main>
    </div>
  );
}

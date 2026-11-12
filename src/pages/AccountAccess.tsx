import { useCallback, useState } from 'react';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { Wordmark } from '../components/Wordmark';
import { isConfigured, supabase } from '../lib/supabase';
import { verifyPersonalGoogleAccount } from '../services/accounts';

export default function AccountAccess() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleError = useCallback((detail: string) => {
    setError(detail);
    setBusy(false);
  }, []);

  const handleGoogleCredential = useCallback(async (idToken: string) => {
    setBusy(true);
    setError('');
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
      setBusy(false);
    }
  }, []);

  return (
    <div className="page">
      <header className="topbar"><Wordmark /></header>
      <main className="container narrow">
        <section className="glass panel account-panel">
          <h1 className="h2">Continue with Google</h1>
          <p className="muted small">Use your personal Google account to continue. Your account email will be used for contact.</p>
          <div className="account-providers">
            <GoogleSignIn disabled={Boolean(busy)} onCredential={handleGoogleCredential} onError={handleGoogleError} />
          </div>
          {error && <p className="error-text" role="alert">{error}</p>}
        </section>
      </main>
    </div>
  );
}

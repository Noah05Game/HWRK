import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Wordmark } from '../components/Wordmark';
import { useSession } from '../hooks/useSession';
import { supabase } from '../lib/supabase';

type VerificationState = 'finishing' | 'signing_out' | 'verified' | 'error';

function getLinkError() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const code = params.get('error_code');
  if (code === 'otp_expired') return 'This confirmation link has expired or has already been used. Sign in if you have already confirmed your email, or request a new confirmation email.';
  const description = params.get('error_description');
  return description || '';
}

export default function EmailVerified() {
  const { session, loading } = useSession();
  const [state, setState] = useState<VerificationState>(() => getLinkError() ? 'error' : 'finishing');
  const [error, setError] = useState(() => getLinkError());
  const finalizing = useRef(false);

  useEffect(() => {
    if (loading || state !== 'finishing' || finalizing.current) return;

    async function finishVerification() {
      if (!session?.user.email_confirmed_at) {
        setError('We could not confirm this email. The link may have expired or already been used. Please try signing in or request a new confirmation email.');
        setState('error');
        return;
      }

      finalizing.current = true;
      setState('signing_out');
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) {
        setError(`Your email is verified, but we could not finish preparing the sign-in page: ${signOutError.message}`);
        setState('error');
        return;
      }
      setState('verified');
    }

    finishVerification().catch((caught: unknown) => {
      setError((caught as Error).message || 'Email verification could not be completed.');
      setState('error');
    });
  }, [loading, session, state]);

  const verified = state === 'verified';
  return (
    <div className="page">
      <header className="topbar"><Wordmark /></header>
      <main className="container narrow">
        <section className="glass panel verification-panel" aria-live="polite">
          {(state === 'finishing' || state === 'signing_out') && (
            <>
              <span className="verification-icon pending"><Loader2 size={26} className="spin" /></span>
              <h1 className="h2">{state === 'finishing' ? 'Confirming your email' : 'Getting sign-in ready'}</h1>
              <p className="muted">Just a moment while we finish setting up your sign-in.</p>
            </>
          )}
          {verified && (
            <>
              <span className="verification-icon success"><CheckCircle2 size={28} /></span>
              <p className="verification-eyebrow">HWRK ACCOUNT</p>
              <h1 className="h2">Email verified</h1>
              <p className="muted">Your email address is confirmed. You can now sign in to continue to your account.</p>
              <Link className="btn primary block" to="/">Continue to sign in</Link>
            </>
          )}
          {state === 'error' && (
            <>
              <span className="verification-icon error"><MailWarning size={26} /></span>
              <p className="verification-eyebrow">HWRK ACCOUNT</p>
              <h1 className="h2">We couldn’t verify this link</h1>
              <p className="muted">{error}</p>
              <Link className="btn primary block" to="/">Continue to sign in</Link>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

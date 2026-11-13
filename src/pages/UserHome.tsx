import { useEffect, useState, type FormEvent } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { Loader2, LogOut } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { submitAccountSignOut, getUserProfile, hasPersonalGoogleVerification, isCurrentAccountBanned, saveUserProfile } from '../services/accounts';
import type { SchoolLoginType, UserProfile } from '../types';
import AccountAccess from './AccountAccess';
import AccountSettings from './AccountSettings';
import Landing from './Landing';
import UserRequests from './UserRequests';

function isGoogleAccount(user: User) {
  return user.identities?.some((identity) => identity.provider === 'google')
    || user.app_metadata.provider === 'google';
}

function Onboarding({ user, onComplete }: { user: User; onComplete: (profile: UserProfile) => void }) {
  const [fullName, setFullName] = useState(user.user_metadata.full_name ?? '');
  const [schoolEmail, setSchoolEmail] = useState('');
  const [schoolPassword, setSchoolPassword] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [schoolLoginType, setSchoolLoginType] = useState<SchoolLoginType>('email');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError('');
    const name = fullName.trim();
    const email = schoolEmail.trim().toLowerCase();
    const school = schoolName.trim();
    if (name.length < 2 || name.length > 100) {
      setError('Enter your full name (2 to 100 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
      setError('Enter a valid school email address.');
      return;
    }
    if (email === user.email?.trim().toLowerCase()) {
      setError('Your school email must be different from your account email.');
      return;
    }
    if (!schoolPassword || schoolPassword.length > 256) {
      setError('Enter your school account password (up to 256 characters).');
      return;
    }
    if (!school || school.length > 120) {
      setError('Enter your school name (up to 120 characters).');
      return;
    }

    setSaving(true);
    try {
      const profile = await saveUserProfile(user, {
        fullName: name,
        schoolEmail: email,
        schoolPassword,
        schoolName: school,
        schoolLoginType,
      });
      onComplete(profile);
    } catch (e) {
      const message = (e as Error).message || 'Could not save your onboarding details.';
      setError(message.includes('account_banned')
        ? 'This school email is associated with a banned account.'
        : message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar"><strong className="wordmark">HWRK</strong></header>
      <main className="container narrow">
        <form className="glass panel onboarding-panel" onSubmit={submit}>
          <h1 className="h2">Set up your account</h1>
          <p className="muted small">Add the details for the school account used to complete your requests.</p>
          <p className="muted small">Contact email: {user.email ?? 'Unavailable'}</p>
          <div className="field">
            <label htmlFor="onboarding-name">Full name</label>
            <input id="onboarding-name" value={fullName} onChange={(e) => setFullName(e.target.value)}
              autoComplete="name" maxLength={100} required disabled={saving} />
          </div>
          <div className="field">
            <label htmlFor="onboarding-school-email">School email</label>
            <input id="onboarding-school-email" type="email" value={schoolEmail}
              onChange={(e) => setSchoolEmail(e.target.value)} autoComplete="email" maxLength={254}
              required disabled={saving} />
          </div>
          <div className="field">
            <label htmlFor="onboarding-school-password">School account password</label>
            <input id="onboarding-school-password" type="password" value={schoolPassword}
              onChange={(e) => setSchoolPassword(e.target.value)} autoComplete="off" maxLength={256}
              required disabled={saving} />
          </div>
          <div className="field">
            <label htmlFor="onboarding-school-name">School name (Sparx)</label>
            <input id="onboarding-school-name" value={schoolName} onChange={(e) => setSchoolName(e.target.value)}
              maxLength={120} required disabled={saving} />
          </div>
          <div className="field">
            <label htmlFor="onboarding-login-type">School login type</label>
            <select id="onboarding-login-type" value={schoolLoginType} disabled={saving}
              onChange={(e) => setSchoolLoginType(e.target.value as SchoolLoginType)}>
              <option value="email">Email</option>
              <option value="google">Google</option>
              <option value="microsoft">Microsoft</option>
            </select>
          </div>
          {error && <p className="error-text" role="alert">{error}</p>}
          <button className="btn primary block" disabled={saving}>
            {saving ? <><Loader2 size={16} className="spin" /> Saving</> : 'Complete setup'}
          </button>
        </form>
      </main>
    </div>
  );
}

function GoogleAccountRequired({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="lockdown-status" role="alert">
      <h1>Google account verification required</h1>
      <p>This Google account could not be verified as a personal account. Google Workspace accounts are not accepted.</p>
      <button className="btn primary" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
    </main>
  );
}

function ProfileGate({ session }: { session: Session }) {
  const { pathname } = useLocation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifiedGoogle, setVerifiedGoogle] = useState<boolean | null>(null);
  const [banned, setBanned] = useState(false);

  useEffect(() => {
    let active = true;
    const user = session.user;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const accountBanned = await isCurrentAccountBanned();
        if (active) setBanned(accountBanned);
        if (accountBanned) return;
        if (isGoogleAccount(user)) {
          let verified = false;
          for (let attempt = 0; attempt < 6 && active; attempt++) {
            verified = await hasPersonalGoogleVerification(user.id);
            if (verified) break;
            await new Promise((resolve) => window.setTimeout(resolve, 500));
          }
          if (active) setVerifiedGoogle(verified);
          if (!verified) return;
        }
        const current = await getUserProfile(user.id);
        if (active) setProfile(current);
      } catch (e) {
        if (active) setError((e as Error).message || 'Could not load your account details.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [session]);

  async function signOut() {
    try { await submitAccountSignOut(); }
    catch (e) { setError((e as Error).message || 'Could not sign out.'); }
  }

  if (loading) return <div className="center full"><Loader2 className="spin" /></div>;
  if (banned) {
    return (
      <main className="lockdown-status" role="alert">
        <h1>Account access suspended</h1>
        <p>This account or its school email has been banned from HWRK. Contact support if you believe this is a mistake.</p>
        <button className="btn primary" onClick={signOut}><LogOut size={15} /> Sign out</button>
      </main>
    );
  }
  if (verifiedGoogle === false) return <GoogleAccountRequired onSignOut={signOut} />;
  if (!session.user.email || !session.user.email_confirmed_at) {
    return (
      <main className="lockdown-status" role="alert">
        <h1>Confirm your account email</h1>
        <p>Verify an account email address before continuing to onboarding.</p>
        <button className="btn primary" onClick={signOut}><LogOut size={15} /> Sign out</button>
      </main>
    );
  }
  if (error) {
    return (
      <main className="lockdown-status" role="alert">
        <h1>Could not load your account</h1>
        <p>{error}</p>
        <button className="btn primary" onClick={() => window.location.reload()}>Try again</button>
      </main>
    );
  }
  if (!profile) return <Onboarding user={session.user} onComplete={setProfile} />;
  if (pathname === '/account') return <AccountSettings session={session} profile={profile} onProfileUpdated={setProfile} />;
  if (pathname === '/requests') return <UserRequests />;
  return <Landing profile={profile} accountEmail={session.user.email ?? ''} />;
}

export default function UserHome() {
  const { session, loading } = useSession();
  if (loading) return <div className="center full"><Loader2 className="spin" /></div>;
  return session ? <ProfileGate session={session} /> : <AccountAccess />;
}

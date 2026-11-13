import { useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Loader2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { UserAreaNav } from '../components/UserAreaNav';
import { Wordmark } from '../components/Wordmark';
import { deleteOwnAccount, saveUserProfile } from '../services/accounts';
import { supabase } from '../lib/supabase';
import type { SchoolLoginType, UserProfile } from '../types';

interface Props {
  session: Session;
  profile: UserProfile;
  onProfileUpdated: (profile: UserProfile) => void;
}

export default function AccountSettings({ session, profile, onProfileUpdated }: Props) {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile.full_name);
  const [accountEmail, setAccountEmail] = useState(session.user.email ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [schoolEmail, setSchoolEmail] = useState(profile.school_email);
  const [schoolPassword, setSchoolPassword] = useState(profile.school_password);
  const [schoolName, setSchoolName] = useState(profile.school_name);
  const [schoolLoginType, setSchoolLoginType] = useState<SchoolLoginType>(profile.school_login_type);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError('');
    setNotice('');

    const name = fullName.trim();
    const loginEmail = accountEmail.trim().toLowerCase();
    const school = schoolName.trim();
    const schoolAddress = schoolEmail.trim().toLowerCase();
    if (name.length < 2 || name.length > 100) {
      setError('Enter your full name (2 to 100 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(loginEmail) || loginEmail.length > 254) {
      setError('Enter a valid account email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(schoolAddress) || schoolAddress.length > 254) {
      setError('Enter a valid school email address.');
      return;
    }
    if (schoolAddress === loginEmail) {
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
      const updatedProfile = await saveUserProfile(session.user, {
        fullName: name,
        schoolEmail: schoolAddress,
        schoolPassword,
        schoolName: school,
        schoolLoginType,
      });

      const emailChanged = loginEmail !== session.user.email?.toLowerCase();
      if (emailChanged || newPassword) {
        const updates: { email?: string; password?: string } = {};
        if (emailChanged) updates.email = loginEmail;
        if (newPassword) updates.password = newPassword;
        const { error: authError } = await supabase.auth.updateUser(updates);
        if (authError) {
          onProfileUpdated(updatedProfile);
          throw new Error(`Your profile was saved, but your sign-in details could not be updated: ${authError.message}`);
        }
      }

      onProfileUpdated(updatedProfile);
      setNewPassword('');
      setNotice(emailChanged
        ? 'Your profile was saved. Check your new email address to confirm the account email change.'
        : 'Your account settings have been saved.');
    } catch (e) {
      setError((e as Error).message || 'Could not save your account settings.');
    } finally {
      setSaving(false);
    }
  }

  async function removeAccount() {
    setDeleting(true);
    setError('');
    try {
      await deleteOwnAccount();
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw new Error(`Your account was deleted, but this browser session could not be cleared: ${signOutError.message}`);
      navigate('/', { replace: true });
    } catch (e) {
      setError((e as Error).message || 'Could not delete your account.');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <Wordmark />
        <UserAreaNav />
      </header>
      <main className="container narrow">
        <form className="glass panel account-panel" onSubmit={submit}>
          <h1 className="h2">Account settings</h1>
          <p className="muted small">Update your sign-in and school account details.</p>
          <div className="field">
            <label htmlFor="settings-name">Full name</label>
            <input id="settings-name" value={fullName} onChange={(event) => setFullName(event.target.value)}
              autoComplete="name" maxLength={100} required disabled={saving} />
          </div>
          <div className="field">
            <label htmlFor="settings-account-email">Account email</label>
            <input id="settings-account-email" type="email" value={accountEmail}
              onChange={(event) => setAccountEmail(event.target.value)} autoComplete="email" maxLength={254}
              required disabled={saving} />
          </div>
          <div className="field">
            <label htmlFor="settings-password">New sign-in password</label>
            <input id="settings-password" type="password" value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password"
              placeholder="Leave blank to keep your current password" disabled={saving} />
          </div>
          <div className="field">
            <label htmlFor="settings-school-email">School email</label>
            <input id="settings-school-email" type="email" value={schoolEmail}
              onChange={(event) => setSchoolEmail(event.target.value)} autoComplete="off" maxLength={254}
              required disabled={saving} />
          </div>
          <div className="field">
            <label htmlFor="settings-school-password">School account password</label>
            <input id="settings-school-password" type="password" value={schoolPassword}
              onChange={(event) => setSchoolPassword(event.target.value)} autoComplete="off" maxLength={256}
              required disabled={saving} />
          </div>
          <div className="field">
            <label htmlFor="settings-school-name">School name (Sparx)</label>
            <input id="settings-school-name" value={schoolName} onChange={(event) => setSchoolName(event.target.value)}
              maxLength={120} required disabled={saving} />
          </div>
          <div className="field">
            <label htmlFor="settings-login-type">School login type</label>
            <select id="settings-login-type" value={schoolLoginType} disabled={saving}
              onChange={(event) => setSchoolLoginType(event.target.value as SchoolLoginType)}>
              <option value="email">Email</option>
              <option value="google">Google</option>
              <option value="microsoft">Microsoft</option>
            </select>
          </div>
          {error && <p className="banner error" role="alert">{error}</p>}
          {notice && <p className="success-text" role="status">{notice}</p>}
          <button className="btn primary block" type="submit" disabled={saving}>
            {saving ? <><Loader2 size={16} className="spin" /> Saving</> : 'Save settings'}
          </button>
        </form>

        <section className="glass account-danger">
          <h2>Delete account</h2>
          <p className="muted small">Your sign-in and profile will be deleted. Existing requests stay in the admin workflow and history.</p>
          <button className="btn danger" onClick={() => setConfirmDelete(true)} disabled={deleting}>
            <Trash2 size={15} /> Delete my account
          </button>
        </section>
      </main>
      {confirmDelete && (
        <ConfirmDialog
          title="Permanently delete your account?"
          message="Your sign-in and saved profile will be removed. Existing requests and their fulfillment details will remain available to the admin. This cannot be undone."
          confirmLabel="Delete my account"
          busy={deleting}
          onConfirm={removeAccount}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

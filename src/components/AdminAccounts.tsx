import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCw, Search, ShieldBan, ShieldCheck, Star, Trash2 } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { banAccount, deleteAccount, listAdminAccounts, setAccountPriority, unbanAccount } from '../services/admin';
import type { AdminAccount } from '../types';

export function AdminAccounts({ currentUserId }: { currentUserId: string }) {
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busyUser, setBusyUser] = useState('');
  const [banTarget, setBanTarget] = useState<AdminAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setAccounts(await listAdminAccounts());
    } catch (e) {
      setError((e as Error).message || 'Could not load accounts.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (accounts ?? []).filter((account) =>
      !search || [account.full_name, account.account_email, account.school_email]
        .some((value) => value?.toLowerCase().includes(search)));
  }, [accounts, query]);

  async function togglePriority(account: AdminAccount) {
    setBusyUser(account.user_id);
    setError('');
    try {
      await setAccountPriority(account.user_id, !account.is_priority);
      await load();
    } catch (e) {
      setError((e as Error).message || 'Could not update priority access.');
    } finally {
      setBusyUser('');
    }
  }

  async function updateBan(account: AdminAccount, shouldBan: boolean) {
    setBusyUser(account.user_id);
    setError('');
    try {
      if (shouldBan) await banAccount(account.user_id);
      else await unbanAccount(account.user_id);
      setBanTarget(null);
      await load();
    } catch (e) {
      setError((e as Error).message || `Could not ${shouldBan ? 'ban' : 'unban'} this account.`);
    } finally {
      setBusyUser('');
    }
  }

  async function removeAccount(account: AdminAccount) {
    setBusyUser(account.user_id);
    setError('');
    try {
      await deleteAccount(account.user_id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setError((e as Error).message || 'Could not delete this account.');
    } finally {
      setBusyUser('');
    }
  }

  return (
    <section className="accounts-panel glass">
      <header className="accounts-heading">
        <div>
          <h2 className="h2">Accounts</h2>
          <p className="muted small">Manage priority access and account bans. Bans block both the account and school email.</p>
        </div>
        <button className="btn ghost sm" onClick={load} aria-label="Refresh accounts">
          <RotateCw size={14} /> Refresh
        </button>
      </header>
      <div className="accounts-toolbar">
        <div className="search"><Search size={16} /><input placeholder="Search name or email" value={query}
          onChange={(event) => setQuery(event.target.value)} aria-label="Search accounts" /></div>
        <span className="muted small">{accounts?.length ?? 0} accounts</span>
      </div>
      {error && <p className="banner error" role="alert">{error}</p>}
      {!accounts && !error && <div className="center"><Loader2 className="spin" /></div>}
      {accounts && visible.length === 0 && (
        <div className="empty"><p className="muted">{accounts.length ? 'No accounts match your search.' : 'No accounts have been created yet.'}</p></div>
      )}
      {visible.length > 0 && (
        <div className="table-wrap">
          <table className="account-table">
            <thead><tr><th>Account</th><th>Account email</th><th>School email</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {visible.map((account) => (
                <tr key={account.user_id}>
                  <td data-label="Account">{account.full_name || <span className="muted">Setup incomplete</span>}</td>
                  <td data-label="Account email">{account.account_email || '—'}</td>
                  <td data-label="School email">{account.school_email || '—'}</td>
                  <td data-label="Joined">{new Date(account.created_at).toLocaleDateString()}</td>
                  <td data-label="Status">
                    {account.is_banned
                      ? <span className="account-status banned">Banned</span>
                      : account.is_priority
                        ? <span className="account-status priority">Priority</span>
                        : <span className="account-status">Standard</span>}
                    {account.is_banned && !account.has_direct_ban && <span className="muted small account-note">Blocked by another account’s ban</span>}
                  </td>
                  <td data-label="Actions">
                    <div className="account-actions">
                      <button className={`btn sm ${account.is_priority ? 'ghost' : 'priority-submit'}`}
                        onClick={() => togglePriority(account)} disabled={busyUser === account.user_id || !account.school_email || account.is_banned}
                        title={!account.school_email ? 'Priority is available after onboarding' : undefined}>
                        {busyUser === account.user_id ? <Loader2 size={14} className="spin" /> : <Star size={14} />}
                        {account.is_priority ? 'Remove priority' : 'Priority'}
                      </button>
                      {account.has_direct_ban ? (
                        <button className="btn ghost sm" onClick={() => updateBan(account, false)} disabled={busyUser === account.user_id}>
                          <ShieldCheck size={14} /> Unban
                        </button>
                      ) : (
                        <button className="btn danger sm" onClick={() => setBanTarget(account)}
                          disabled={busyUser === account.user_id || account.is_banned}>
                          <ShieldBan size={14} /> Ban
                        </button>
                      )}
                      <button className="btn danger sm" onClick={() => setDeleteTarget(account)}
                        disabled={busyUser === account.user_id || account.user_id === currentUserId}
                        title={account.user_id === currentUserId ? 'Use Account Settings to delete your own account' : undefined}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {banTarget && (
        <ConfirmDialog
          title="Ban this account?"
          message={`This blocks future sign-in and account creation using ${banTarget.account_email || 'this account'} and ${banTarget.school_email || 'its school email if present'}. You can unban it later.`}
          confirmLabel="Ban account"
          onConfirm={() => updateBan(banTarget, true)}
          onCancel={() => setBanTarget(null)}
          busy={busyUser === banTarget.user_id}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete this account?"
          message={`The sign-in and profile for ${deleteTarget.account_email || 'this user'} will be permanently deleted. Their existing requests will remain in the admin workflow and history.`}
          confirmLabel="Delete account"
          onConfirm={() => removeAccount(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
          busy={busyUser === deleteTarget.user_id}
        />
      )}
    </section>
  );
}

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, Plus, RotateCw, Trash2 } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { addProhibitedIp, listProhibitedIps, removeProhibitedIp } from '../services/admin';
import type { ProhibitedIp } from '../types';

export function ProhibitedIps() {
  const [ips, setIps] = useState<ProhibitedIp[] | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ProhibitedIp | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setIps(await listProhibitedIps());
    } catch (e) {
      setError((e as Error).message || 'Could not load prohibited IP addresses.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const ip = value.trim();
    if (!ip) return;
    setBusy(true);
    setError('');
    try {
      await addProhibitedIp(ip);
      setValue('');
      await load();
    } catch (e) {
      setError((e as Error).message || 'Could not add that IP address.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(ip: ProhibitedIp) {
    setBusy(true);
    setError('');
    try {
      await removeProhibitedIp(ip.ip_address);
      setRemoveTarget(null);
      await load();
    } catch (e) {
      setError((e as Error).message || 'Could not remove that IP address.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel glass">
      <header className="admin-panel-heading">
        <div>
          <h2 className="h2">Prohibited IP addresses</h2>
          <p className="muted small">Blocked addresses cannot view the site, including the admin panel. Do not add your own current IP unless you have another way to remove it.</p>
        </div>
        <button className="btn ghost sm" onClick={load} aria-label="Refresh prohibited IPs"><RotateCw size={14} /> Refresh</button>
      </header>
      <form className="prohibited-ip-form" onSubmit={add}>
        <div className="field">
          <label htmlFor="prohibited-ip">IP address</label>
          <input id="prohibited-ip" value={value} onChange={(event) => setValue(event.target.value)}
            placeholder="e.g. 203.0.113.42 or 2001:db8::1" autoComplete="off" maxLength={45} disabled={busy} required />
        </div>
        <button className="btn danger" disabled={busy || !value.trim()}>
          {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Block IP
        </button>
      </form>
      {error && <p className="banner error" role="alert">{error} <button className="btn ghost sm" onClick={load}>Retry</button></p>}
      {!ips && !error && <div className="center"><Loader2 className="spin" /></div>}
      {ips && ips.length === 0 && <p className="empty muted">No IP addresses are blocked.</p>}
      {ips && ips.length > 0 && (
        <ul className="prohibited-ip-list">
          {ips.map((ip) => (
            <li key={ip.ip_address}>
              <code>{ip.ip_address}</code>
              <span className="muted small">Added {new Date(ip.added_at).toLocaleDateString()}</span>
              <button className="btn ghost sm" onClick={() => setRemoveTarget(ip)} disabled={busy}>
                <Trash2 size={14} /> Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
      {removeTarget && (
        <ConfirmDialog title="Unblock this IP address?"
          message={`${removeTarget.ip_address} will be able to access the site again.`}
          confirmLabel="Unblock IP" busy={busy}
          onConfirm={() => remove(removeTarget)} onCancel={() => setRemoveTarget(null)} />
      )}
    </section>
  );
}

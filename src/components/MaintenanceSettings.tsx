import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getMaintenanceSettings, setMaintenanceMode } from '../services/maintenance';
import type { MaintenanceSettings as MaintenanceSettingsData } from '../types';

export function MaintenanceSettings() {
  const [settings, setSettings] = useState<MaintenanceSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSettings(await getMaintenanceSettings());
    } catch (e) {
      setError((e as Error).message || 'Could not load maintenance status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggle() {
    if (!settings) return;
    setSaving(true);
    setError('');
    try {
      setSettings(await setMaintenanceMode(!settings.maintenance_mode));
    } catch (e) {
      setError((e as Error).message || 'Could not change maintenance mode.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass maintenance-settings">
      <div>
        <h2 className="h2">Site maintenance</h2>
        <p className="muted small">
          When enabled, visitors see a maintenance notice and cannot submit new requests. Existing orders and admin tools remain available.
        </p>
        {settings && <p className={`maintenance-state ${settings.maintenance_mode ? 'active' : ''}`} role="status">
          {settings.maintenance_mode ? 'Maintenance mode is on.' : 'The site is accepting requests.'}
        </p>}
      </div>
      {loading ? <Loader2 className="spin" /> : (
        <button className={`btn ${settings?.maintenance_mode ? 'primary' : 'warning'}`}
          onClick={toggle} disabled={!settings || saving} aria-pressed={settings?.maintenance_mode ?? false}>
          {saving ? <><Loader2 size={15} className="spin" /> Updating</> : settings?.maintenance_mode ? 'Turn maintenance off' : 'Turn maintenance on'}
        </button>
      )}
      {error && <p className="error-text" role="alert">{error} <button className="btn ghost sm" onClick={load} disabled={loading}>Retry</button></p>}
    </section>
  );
}

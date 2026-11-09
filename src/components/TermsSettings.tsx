import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getTerms, saveTerms } from '../services/terms';
import type { TermsSettings as TermsSettingsData } from '../types';

const MAX_TERMS_LENGTH = 20000;

export function TermsSettings() {
  const [settings, setSettings] = useState<TermsSettingsData | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const current = await getTerms();
      setSettings(current);
      setDraft(current.terms_text);
    } catch (e) {
      setError((e as Error).message || 'Could not load terms.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    const text = draft.trim();
    if (!text || text.length > MAX_TERMS_LENGTH) {
      setError('Enter terms between 1 and 20,000 characters.');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await saveTerms(draft);
      setSettings(updated);
      setDraft(updated.terms_text);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message || 'Could not save terms.');
    } finally {
      setSaving(false);
    }
  }

  const ready = Boolean(settings?.terms_text.trim());

  return (
    <section className="glass terms-settings">
      <h2 className="h2">Terms and conditions</h2>
      <p className="muted small">
        New customers must agree to the current terms before submitting. Saving changed terms publishes a new version;
        existing orders keep the terms version they accepted.
      </p>
      {settings && (
        <p className="muted small">
          {ready ? `Published version ${settings.version}.` : 'Terms are not configured, so new requests cannot be submitted.'}
        </p>
      )}
      {loading ? <div className="center"><Loader2 className="spin" /></div> : (
        <>
          <label className="field-label" htmlFor="terms-editor">Terms shown in the request form</label>
          <textarea id="terms-editor" value={draft} onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
            rows={8} maxLength={MAX_TERMS_LENGTH} disabled={saving} />
          <div className="terms-editor-footer">
            <span className="muted small">{draft.length.toLocaleString()} / {MAX_TERMS_LENGTH.toLocaleString()} characters</span>
            <button className="btn primary sm" onClick={save} disabled={!settings || saving || draft === settings.terms_text}>
              {saving ? <><Loader2 size={14} className="spin" /> Saving</> : 'Save and publish'}
            </button>
          </div>
          {error && <p className="error-text" role="alert">{error} {!settings && <button className="btn ghost sm" onClick={load}>Retry</button>}</p>}
          {saved && <p className="success-text" role="status">Terms published as version {settings?.version}.</p>}
        </>
      )}
    </section>
  );
}

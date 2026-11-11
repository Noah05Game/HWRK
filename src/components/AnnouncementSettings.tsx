import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getAnnouncementSettings, saveAnnouncementSettings } from '../services/announcement';
import type { AnnouncementSettings as AnnouncementSettingsData } from '../types';

type Draft = Omit<AnnouncementSettingsData, 'updated_at'>;
const DEFAULT_DRAFT: Draft = {
  announcement_enabled: false,
  announcement_title: '',
  announcement_body: '',
  announcement_background_color: '#1d4ed8',
  announcement_text_color: '#ffffff',
};

export function AnnouncementSettings() {
  const [settings, setSettings] = useState<AnnouncementSettingsData | null>(null);
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const current = await getAnnouncementSettings();
      setSettings(current);
      setDraft({
        announcement_enabled: current.announcement_enabled,
        announcement_title: current.announcement_title,
        announcement_body: current.announcement_body,
        announcement_background_color: current.announcement_background_color,
        announcement_text_color: current.announcement_text_color,
      });
    } catch (e) {
      setError((e as Error).message || 'Could not load announcement settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save() {
    const title = draft.announcement_title.trim();
    const body = draft.announcement_body.trim();
    if (draft.announcement_enabled && !title) {
      setError('Enter a title before enabling the announcement.');
      return;
    }
    if (draft.announcement_enabled && !body) {
      setError('Enter a message before enabling the announcement.');
      return;
    }
    if (title.length > 120 || body.length > 2000) {
      setError('Keep the title under 120 characters and the message under 2,000 characters.');
      return;
    }

    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await saveAnnouncementSettings({
        ...draft,
        announcement_title: title,
        announcement_body: body,
      });
      setSettings(updated);
      setDraft({
        announcement_enabled: updated.announcement_enabled,
        announcement_title: updated.announcement_title,
        announcement_body: updated.announcement_body,
        announcement_background_color: updated.announcement_background_color,
        announcement_text_color: updated.announcement_text_color,
      });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message || 'Could not save announcement settings.');
    } finally {
      setSaving(false);
    }
  }

  const unchanged = settings &&
    draft.announcement_enabled === settings.announcement_enabled &&
    draft.announcement_title === settings.announcement_title &&
    draft.announcement_body === settings.announcement_body &&
    draft.announcement_background_color === settings.announcement_background_color &&
    draft.announcement_text_color === settings.announcement_text_color;

  return (
    <section className="glass announcement-settings">
      <h2 className="h2">Main page announcement</h2>
      <p className="muted small">Configure an optional banner shown above the request options on the main page.</p>
      {loading ? <div className="center"><Loader2 className="spin" /></div> : (
        <>
          <label className="announcement-toggle">
            <input type="checkbox" checked={draft.announcement_enabled} disabled={saving}
              onChange={(e) => update('announcement_enabled', e.target.checked)} />
            <span>Show announcement banner</span>
          </label>
          <label className="field-label" htmlFor="announcement-title">Title</label>
          <input id="announcement-title" value={draft.announcement_title} maxLength={120} disabled={saving}
            onChange={(e) => update('announcement_title', e.target.value)} />
          <label className="field-label" htmlFor="announcement-body">Message</label>
          <textarea id="announcement-body" value={draft.announcement_body} rows={4} maxLength={2000} disabled={saving}
            onChange={(e) => update('announcement_body', e.target.value)} />
          <div className="announcement-colors">
            <div className="field">
              <label htmlFor="announcement-background">Box colour</label>
              <input id="announcement-background" type="color" value={draft.announcement_background_color} disabled={saving}
                onChange={(e) => update('announcement_background_color', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="announcement-text-color">Text colour</label>
              <input id="announcement-text-color" type="color" value={draft.announcement_text_color} disabled={saving}
                onChange={(e) => update('announcement_text_color', e.target.value)} />
            </div>
          </div>
          <div className="announcement-preview-label muted small">Preview</div>
          <section className="announcement-banner announcement-preview"
            style={{ backgroundColor: draft.announcement_background_color, color: draft.announcement_text_color }}
            aria-label="Announcement preview">
            <h3>{draft.announcement_title || 'Announcement title'}</h3>
            <p>{draft.announcement_body || 'Your announcement message will appear here.'}</p>
          </section>
          <div className="terms-editor-footer">
            <span className="muted small" role="status">{saved ? 'Announcement saved.' : ''}</span>
            <button className="btn primary sm" onClick={save} disabled={!settings || saving || Boolean(unchanged)}>
              {saving ? <><Loader2 size={14} className="spin" /> Saving</> : 'Save announcement'}
            </button>
          </div>
          {error && <p className="error-text" role="alert">{error} {!settings && <button className="btn ghost sm" onClick={load}>Retry</button>}</p>}
        </>
      )}
    </section>
  );
}

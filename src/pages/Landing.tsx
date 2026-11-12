import { useCallback, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { REQUEST_OPTIONS } from '../config/options';
import { Wordmark } from '../components/Wordmark';
import { RequestForm } from '../components/RequestForm';
import { Confirmation } from '../components/Confirmation';
import { isConfigured, supabase } from '../lib/supabase';
import { getMaintenanceSettings } from '../services/maintenance';
import { getAnnouncementSettings } from '../services/announcement';
import { getOptionCapacity } from '../services/queue';
import type { AnnouncementSettings, OptionCapacity, RequestOption, SubmitResult, UserProfile } from '../types';

export default function Landing({ profile, accountEmail }: { profile: UserProfile; accountEmail: string }) {
  const [selected, setSelected] = useState<RequestOption | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [maintenance, setMaintenance] = useState<boolean | null>(null);
  const [maintenanceError, setMaintenanceError] = useState('');
  const [announcement, setAnnouncement] = useState<AnnouncementSettings | null>(null);
  const [announcementError, setAnnouncementError] = useState('');
  const [capacity, setCapacity] = useState<OptionCapacity[] | null>(null);
  const [capacityError, setCapacityError] = useState('');
  const [accountError, setAccountError] = useState('');

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) setAccountError(error.message);
  }

  const loadMaintenance = useCallback(async () => {
    setMaintenanceError('');
    try {
      const settings = await getMaintenanceSettings();
      setMaintenance(settings.maintenance_mode);
    } catch (e) {
      setMaintenanceError((e as Error).message || 'Could not verify service availability.');
    }
  }, []);

  useEffect(() => { loadMaintenance(); }, [loadMaintenance]);

  const loadAnnouncement = useCallback(async () => {
    try {
      setAnnouncement(await getAnnouncementSettings());
      setAnnouncementError('');
    } catch {
      setAnnouncementError('The site announcement could not be loaded.');
    }
  }, []);
  useEffect(() => {
    loadAnnouncement();
    const timer = window.setInterval(loadAnnouncement, 30_000);
    return () => window.clearInterval(timer);
  }, [loadAnnouncement]);

  const loadCapacity = useCallback(async () => {
    setCapacityError('');
    try {
      setCapacity(await getOptionCapacity());
    } catch (e) {
      setCapacityError((e as Error).message || 'Could not verify option capacity.');
    }
  }, []);
  useEffect(() => {
    loadCapacity();
    const timer = window.setInterval(loadCapacity, 30_000);
    return () => window.clearInterval(timer);
  }, [loadCapacity]);

  return (
    <div className="page">
      <header className="topbar">
        <Wordmark />
        <button className="btn ghost sm" onClick={signOut}><LogOut size={15} /> Sign out</button>
      </header>
      <main className="container">
        <h1 className={`hero ${maintenance ? 'maintenance-title' : ''}`}>{maintenance ? 'Down for maintenance' : 'Make a request'}</h1>
        {profile.is_priority && (
          <section className="priority-member" role="status">
            <span className="priority-star" aria-hidden="true">★</span>
            <div><strong>You are a priority member</strong><p>Your requests are moved ahead of the standard queue.</p></div>
          </section>
        )}
        {accountError && <p className="banner error" role="alert">{accountError}</p>}
        {maintenance && (
          <section className="maintenance-banner" role="status">
            <h2>We’re performing maintenance</h2>
            <p>Be back soon.</p>
          </section>
        )}
        {announcement?.announcement_enabled && (
          <section className="announcement-banner" role="status"
            style={{
              backgroundColor: announcement.announcement_background_color,
              color: announcement.announcement_text_color,
            }}>
            <h2>{announcement.announcement_title}</h2>
            <p>{announcement.announcement_body}</p>
          </section>
        )}
        {announcementError && (
          <p className="banner error" role="alert">
            {announcementError}
            <button className="btn ghost sm" onClick={loadAnnouncement}>Retry</button>
          </p>
        )}
        {maintenanceError && (
          <p className="banner error" role="alert">
            Request availability could not be verified. New requests are temporarily unavailable.
            <button className="btn ghost sm" onClick={loadMaintenance}>Retry</button>
          </p>
        )}
        {capacityError && (
          <p className="banner error" role="alert">
            Option availability could not be verified. New requests are temporarily unavailable.
            <button className="btn ghost sm" onClick={loadCapacity}>Retry</button>
          </p>
        )}
        {!isConfigured && <p className="banner error">Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>}
        <div className="options">
          {REQUEST_OPTIONS.map((o) => {
            const availability = capacity?.find((item) => item.option_key === o.key);
            const unavailable = !availability || availability.is_full;
            return (
            <article key={o.key} className="card glass" style={{ '--accent': o.accent } as React.CSSProperties}>
              <span className="dot" />
              <h2>{o.name}</h2>
              <p className="muted">{o.description}</p>
              {availability && <p className="muted small">{availability.outstanding_count}/14 outstanding</p>}
              {availability?.is_full && <p className="queue-full-note">Temporarily full. It will reopen when a request is completed or cancelled.</p>}
              <button className="btn accent" disabled={maintenance === null || Boolean(maintenanceError) || maintenance || !capacity || Boolean(capacityError) || unavailable}
                onClick={() => setSelected(o)}>Request</button>
            </article>
            );
          })}
        </div>
      </main>
      {selected && !result && (
        <RequestForm option={selected} profile={profile} accountEmail={accountEmail}
          onClose={() => setSelected(null)} onSuccess={(r) => { setResult(r); }} />
      )}
      {result && <Confirmation result={result} onClose={() => { setResult(null); setSelected(null); }} />}
    </div>
  );
}

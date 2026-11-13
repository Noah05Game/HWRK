import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from './hooks/useToast';
import { SiteAttribution } from './components/SiteAttribution';
import UserHome from './pages/UserHome';
import Track from './pages/Track';
import Admin from './pages/Admin';
import Lockdown from './pages/Lockdown';
import NotFound from './pages/NotFound';
import { getMaintenanceSettings } from './services/maintenance';
import { publicSupabase } from './lib/supabase';

const EmailVerified = lazy(() => import('./pages/EmailVerified'));

function AppRoutes() {
  const { pathname } = useLocation();
  const [siteAccess, setSiteAccess] = useState<'checking' | 'allowed' | 'blocked' | 'error'>('checking');
  const [siteAccessError, setSiteAccessError] = useState('');
  const [siteAccessAttempt, setSiteAccessAttempt] = useState(0);
  const [lockdownMode, setLockdownMode] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');

  useEffect(() => {
    let active = true;
    setSiteAccess('checking');
    setSiteAccessError('');
    async function checkAccess() {
      const { data, error: invokeError } = await publicSupabase.functions.invoke('site-gate', {
        body: { action: isAdminRoute ? 'check' : 'visit' },
      });
      if (!active) return;
      if (invokeError) {
        setSiteAccessError(invokeError.message || 'Access could not be verified.');
        setSiteAccess('error');
        return;
      }
      if (!data || typeof data !== 'object' || !('allowed' in data) || typeof data.allowed !== 'boolean') {
        setSiteAccessError('Access check returned an invalid response.');
        setSiteAccess('error');
        return;
      }
      setSiteAccess(data.allowed ? 'allowed' : 'blocked');
    }
    checkAccess();
    return () => { active = false; };
  }, [isAdminRoute, pathname, siteAccessAttempt]);

  const loadLockdownMode = useCallback(async () => {
    try {
      const settings = await getMaintenanceSettings();
      setLockdownMode(settings.maintenance_mode);
      setError('');
    } catch (e) {
      setError((e as Error).message || 'Could not verify site availability.');
    }
  }, []);

  useEffect(() => {
    if (siteAccess !== 'allowed') return;
    loadLockdownMode();
    const timer = window.setInterval(loadLockdownMode, 15_000);
    return () => window.clearInterval(timer);
  }, [loadLockdownMode, siteAccess]);

  if (siteAccess === 'blocked') return <main className="ip-blocked" aria-label="Access unavailable" />;
  if (siteAccess === 'checking') {
    return <main className="lockdown-status" role="status"><h1>Checking access…</h1></main>;
  }
  if (siteAccess === 'error') {
    return (
      <main className="lockdown-status" role="alert">
        <h1>Site access could not be verified</h1>
        <p>{siteAccessError}</p>
        <button className="btn primary" onClick={() => { setSiteAccess('checking'); setSiteAccessAttempt((attempt) => attempt + 1); }}>Try again</button>
      </main>
    );
  }
  if (!isAdminRoute && error) {
    return (
      <main className="lockdown-status" role="alert">
        <h1>Site availability could not be verified</h1>
        <p>{error}</p>
        <button className="btn primary" onClick={loadLockdownMode}>Try again</button>
      </main>
    );
  }
  if (!isAdminRoute && lockdownMode === null) {
    return (
      <main className="lockdown-status" role="status">
        <h1>Checking site availability…</h1>
      </main>
    );
  }
  if (!isAdminRoute && lockdownMode) return <><Lockdown /><SiteAttribution /></>;

  return (
    <>
      <Routes>
        <Route path="/" element={<UserHome />} />
        <Route path="/account" element={<UserHome />} />
        <Route path="/requests" element={<UserHome />} />
        <Route path="/email-verified" element={
          <Suspense fallback={<main className="lockdown-status" role="status"><h1>Loading verification page…</h1></main>}>
            <EmailVerified />
          </Suspense>
        } />
        <Route path="/t/:token" element={<Track />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <SiteAttribution />
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AppRoutes />
        </BrowserRouter>
      </>
    </ToastProvider>
  );
}

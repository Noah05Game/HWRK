import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from './hooks/useToast';
import { SiteAttribution } from './components/SiteAttribution';
import UserHome from './pages/UserHome';
import Track from './pages/Track';
import Admin from './pages/Admin';
import Lockdown from './pages/Lockdown';
import NotFound from './pages/NotFound';
import { getMaintenanceSettings } from './services/maintenance';

function AppRoutes() {
  const { pathname } = useLocation();
  const [lockdownMode, setLockdownMode] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');

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
    loadLockdownMode();
    const timer = window.setInterval(loadLockdownMode, 15_000);
    return () => window.clearInterval(timer);
  }, [loadLockdownMode]);

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
  if (!isAdminRoute && lockdownMode) return <Lockdown />;

  return (
    <Routes>
      <Route path="/" element={<UserHome />} />
      <Route path="/t/:token" element={<Track />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AppRoutes />
        </BrowserRouter>
        <SiteAttribution />
      </>
    </ToastProvider>
  );
}

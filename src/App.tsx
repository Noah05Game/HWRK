import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './hooks/useToast';
import Landing from './pages/Landing';
import Track from './pages/Track';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/t/:token" element={<Track />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

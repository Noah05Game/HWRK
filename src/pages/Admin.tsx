import { Loader2 } from 'lucide-react';
import { useSession } from '../hooks/useSession';
import AdminLogin from './AdminLogin';
import AdminDashboard from './AdminDashboard';

export default function Admin() {
  const { session, loading } = useSession();
  if (loading) return <div className="center full"><Loader2 className="spin" /></div>;
  return session ? <AdminDashboard session={session} /> : <AdminLogin />;
}

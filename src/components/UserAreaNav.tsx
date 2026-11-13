import { ClipboardList, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';

export function UserAreaNav() {
  return (
    <nav className="user-nav" aria-label="Account navigation">
      <Link className="btn ghost sm" to="/requests"><ClipboardList size={14} /> My requests</Link>
      <Link className="btn ghost sm" to="/account"><Settings size={14} /> Account settings</Link>
    </nav>
  );
}

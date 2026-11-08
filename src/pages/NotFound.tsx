import { Link } from 'react-router-dom';
import { Wordmark } from '../components/Wordmark';

export default function NotFound() {
  return (
    <div className="page"><header className="topbar"><Wordmark /></header>
      <main className="container narrow"><div className="empty glass"><h2>Page not found</h2><Link className="btn primary" to="/">Go to requests</Link></div></main></div>
  );
}

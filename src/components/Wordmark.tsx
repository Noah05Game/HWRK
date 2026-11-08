import { Link } from 'react-router-dom';

export function Wordmark({ to = '/' }: { to?: string }) {
  return <Link to={to} className="wordmark" aria-label="HWRK home">HWRK</Link>;
}

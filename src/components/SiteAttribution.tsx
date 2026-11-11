import { Info } from 'lucide-react';

export function SiteAttribution() {
  return (
    <div className="site-attribution">
      <button type="button" aria-label="About this site" aria-describedby="site-attribution-tooltip">
        <Info size={16} aria-hidden="true" />
      </button>
      <span id="site-attribution-tooltip" role="tooltip">Made with ❤️ in Nottingham</span>
    </div>
  );
}

// GitHub Pages serves 404.html for unknown paths. Copying index.html there
// lets client-side routes such as /admin and /t/<token> load on refresh.
import { copyFileSync } from 'node:fs';
copyFileSync('dist/index.html', 'dist/404.html');
console.log('Created dist/404.html (SPA fallback)');

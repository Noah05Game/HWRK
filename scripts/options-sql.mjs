// Prints SQL that syncs src/config/options.json into the request_options table.
// Usage: npm run options:sql   then paste the output into the Supabase SQL editor.
import { readFileSync } from 'node:fs';
const opts = JSON.parse(readFileSync(new URL('../src/config/options.json', import.meta.url), 'utf8'));
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = opts.map((o, i) => `  (${q(o.key)}, ${q(o.name)}, ${q(o.description)}, ${q(o.accent)}, true, ${i})`);
console.log(`insert into public.request_options (key, name, description, accent_colour, active, sort_order) values
${rows.join(',\n')}
on conflict (key) do update set name = excluded.name, description = excluded.description,
  accent_colour = excluded.accent_colour, active = true, sort_order = excluded.sort_order;`);

// Edit src/config/options.json to change the request options shown to customers.
// After editing, run `npm run options:sql` and run the output in Supabase so
// emails and the admin dashboard use the same names.
import raw from './options.json';
import type { RequestOption } from '../types';

export const REQUEST_OPTIONS: RequestOption[] = raw;

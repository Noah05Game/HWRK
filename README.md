# HWRK

Request management portal. React + TypeScript + Vite on GitHub Pages, Supabase (Postgres, Auth, Edge Functions) for the backend, Resend for email.

```
src/            React app (components, pages, layouts, hooks, services, types, config, styles)
supabase/
  migrations/   SQL schema, RLS, functions
  functions/    Edge Functions + _shared (email templates live in _shared/templates.ts)
.github/workflows/deploy.yml
```

## 1. Supabase

1. Create a project at supabase.com. Note the Project URL, anon key and project ref.
2. For a fresh project, run the SQL migrations in `supabase/migrations` in order. For an existing project, apply all unapplied migrations, or use `supabase db push`.
3. Authentication > Sign In / Providers: enable user sign-ups and email confirmations. Enable Google and email sign-in. Add the public site URL and local development URL to the Auth redirect allow list.
4. Install the CLI, then `supabase login` and `supabase link --project-ref <ref>`.

The queue migrations add the `cancelled` status and account-slot tables. Migration `0008_queue_and_account_slots.sql` also schedules slot expiry with Supabase's `pg_cron` extension.
Migration `0012_priority_and_account_bans.sql` adds administrator-managed priority access and persistent ban records. Apply it to the database before deploying this version of the app.
Migration `0013_prohibited_ips_and_private_analytics.sql` adds IP blocking and anonymous daily aggregate activity counts. Apply it before deploying the `site-gate` Edge Function and frontend.

## User accounts and onboarding

Visitors create an account with Google or email before submitting a request. Email users set an account password and should confirm their email. Google sign-in uses Google Identity Services; configure a Web OAuth client with `https://hwrk.wpoint.xyz` and your local development origin as authorized JavaScript origins. Set the same client ID as the `VITE_GOOGLE_CLIENT_ID` GitHub Actions variable and the `GOOGLE_CLIENT_ID` Supabase Edge Function secret. Google Workspace accounts are rejected by validating Google's signed hosted-domain claim on the server.

After sign-in, onboarding collects the user's full name, school email, school/Sparx password, school name, and school login type (Email, Google, or Microsoft). The contact email is taken from the account email and must differ from the school email. The request form reuses these saved details; its request options, terms, and completion-date flow remain in place. Profile rows can only be accessed by their owner, and school credentials are copied to each request for the existing admin workflow.

Admins can open **Accounts** to grant or remove priority access and ban or unban accounts. Priority requests move ahead of standard requests and may replace the least-recently-reserved waiting slot; work already in progress is not interrupted. Ban records retain both the account email and school email, including after unbanning. Banned emails are rejected during account creation, sign-in, onboarding, and request submission.

Admins can also manage exact IPv4 or IPv6 addresses under **Prohibited IPs** and review daily page-view and successful-request totals under **Logs**. The analytics table stores only one aggregate row per date and contains no IP, account, email, cookie, or individual visit fields. Page views are not unique people. IP addresses entered in the prohibited list are stored separately only to enforce the block. The site is hosted as a static GitHub Pages app, so the browser checks the visitor's IP before rendering app content; the static app files themselves remain publicly downloadable.

## 2. Admin account

1. Authentication > Users > Add user. Enter your email and a strong password (tick auto-confirm).
2. Authorise that user in the SQL editor:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
   ```
3. Sign in at `/admin`. Accounts not listed in `admins` see "Not authorised" and cannot read any data.

## 3. Resend and the sending domain

1. Create a Resend account and an API key (sending access).
2. Resend > Domains > Add `wpoint.xyz`. Add the DNS records it shows (SPF, DKIM, and optionally DMARC) at your DNS host.
3. Click Verify. Production email will not deliver until the domain shows as verified.
4. Emails are sent from `hwrk@wpoint.xyz` to the customer's **contact email**.

## 4. Edge Function secrets and deploy

Create `supabase/.env` (git-ignored; see `.env.example` for the server-only block). Set `GOOGLE_CLIENT_ID` to the same Google Web OAuth client ID used by the frontend:

```
RESEND_API_KEY=re_...
APP_BASE_URL=https://hwrk.wpoint.xyz
SERVER_SECRET=<output of: openssl rand -hex 32>
ADMIN_EMAIL=you@example.com
GOOGLE_CLIENT_ID=<Google Web OAuth client ID>
```

```
supabase secrets set --env-file supabase/.env
supabase db push
supabase functions deploy submit-request verify-google-account site-gate track-request admin-update-status admin-report-issue admin-delete-completed-request admin-retry-email
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into functions automatically. The service-role key and Resend key never reach the frontend. `APP_BASE_URL` must be the exact public site origin (scheme and hostname, no path) because it is used for both CORS and tracking links. For this deployment, use `https://hwrk.wpoint.xyz`. Do not change `SERVER_SECRET` later: it encrypts tracking tokens.

## 5. Request options

Edit `src/config/options.json` (name, description, accent colour). Then keep the database in step so emails and the admin dashboard use the same names:
The current request types include Sparx Maths, Sparx Science, Seneca, Sparx Reader, Tassomai, LanguageNut, Educake, Century, Maths Watch, Carousel, DrFrost, SentenceBuilders and ActiveHub. New options automatically receive the configured number of queue slots when inserted.

```
npm run options:sql      # paste the output into the Supabase SQL editor
```

The shared daily slot count is configurable in the admin Queue section (1–100 per option). Each slot has a 24-hour cooldown from when processing starts, and each option can hold up to seven days of outstanding requests based on the configured slot count. Reducing the count preserves active reservations and cooldowns until they clear.

## 6. GitHub Pages

1. Push to a GitHub repo with `main` as the default branch.
2. Settings > Pages > Source: **GitHub Actions**.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Actions secrets for the frontend.
4. Add `VITE_GOOGLE_CLIENT_ID` as a repository variable or Actions secret for Google sign-in. For a custom domain, add repository variable `VITE_BASE_PATH` = `/`. Otherwise the base defaults to `/<repo-name>/`.
5. Push to `main`. The workflow builds and deploys. `dist/404.html` is a copy of `index.html` so `/admin` and `/t/<token>` survive a refresh.

## 7. Local development

```
cp .env.example .env.local   # fill VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_GOOGLE_CLIENT_ID
npm install
npm run dev
```

## How it works

- **Submission**: the browser calls the authenticated `submit-request` function. It rate-limits by hashed IP (10 submissions/hour), loads school details from the signed-in user's profile, derives the contact address from the verified account, requires school and contact emails to differ, blocks duplicate school-email/option requests, enforces the 14-request cap under a per-option lock, creates the ticket (`HW-000001` from a sequence), and logs the initial status.
- **Queue and slots**: the database assigns the configured number of independent slots per option and reserves them in FIFO order, with priority requests served before standard requests. A priority request can replace the waiting request with the shortest current reservation time; requests already in progress are never interrupted. The 24-hour cooldown begins only when an admin starts processing. Completing or cancelling an in-progress request early does not release its slot; cancelling a waiting or reserved request releases its reservation.
- **Capacity**: waiting, reserved and in-progress requests count toward the 14-request cap. Completed and cancelled requests do not. Capacity is enforced in the submission transaction, so simultaneous submissions cannot exceed the limit.
- **Expiry and ETAs**: `pg_cron` runs `process_expired_slots()` once per minute without relying on an open browser. Submissions and private tracking lookups also process expiry for the relevant option. Estimated slot availability is derived from active expiries, reservations and FIFO requests and is not guaranteed.
- **Tracking**: the existing `/t/<token>` route is unchanged. The token is 256 bits of random data; only its SHA-256 hash is used for lookup. The page displays queue position, people ahead, estimated wait, reservation details and processing timestamps, and refreshes queue state every 30 seconds.
- **Admin navigation and queue controls**: the dashboard separates requests, queues, accounts, lockdown, announcements and terms into menus. Queue views show per-option counts, both slots, cooldowns and priority-first queues. Admins can start, complete or cancel requests, manually release an active slot, adjust its expiry, and replace an unstarted reservation with a waiting request. The displaced request returns to the queue; slots already in progress cannot be replaced.
- **Priority and bans**: account management displays account and school emails. Priority access is applied to future and waiting requests. A ban blocks matching account and school emails and is retained as an audit record when unbanned.
- **Prohibited IPs and analytics**: an Edge Function checks the connecting address before rendering app routes and records aggregate daily page views; the request insert trigger increments a daily successful-request counter without associating it with a user. The admin can add or remove exact IP addresses and view a 30-day conversion summary.
- **Lockdown mode**: the admin dashboard can replace all public pages with the configured domain listing and block new requests. The `/admin` route remains available so an administrator can turn lockdown off.
- **Main page announcement**: admins can configure and toggle a public banner with custom title, message, background colour and text colour.
- **Status changes**: `admin-update-status` verifies the admin, then a SQL function updates the status and writes `status_history` in one transaction. Email is sent only when the status actually changed, and only for In Progress and Completed.
- **Issue reports**: admins can enter a reason in request details. The customer is emailed using the standard template, and the tracking page displays the latest issue and asks them to submit another request.
- **Order cleanup**: admins can permanently delete requests at any status from their details. Their history and email logs are deleted with them. Deleting a request does not interrupt an already-started slot cooldown.
- **Email failures** keep the ticket, are logged in `email_logs`, and can be retried from the request detail view.
- **RLS**: all tables have RLS on. Browsers can only read via admin-gated policies and column grants (encrypted tokens are never selectable), and the only writable request column is `admin_notes`.

## Notes

- Tracking tokens are stored as a hash (for lookup) and also AES-GCM encrypted with `SERVER_SECRET`, so later status emails and retries can rebuild the link. The encrypted copy is not readable from the browser.
- The admin list loads the latest 1,000 requests and filters/sorts in the browser.
- The provided service password is available only in the admin request details.

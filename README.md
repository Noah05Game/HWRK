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
3. Authentication > Sign In / Providers: **disable "Allow new users to sign up"**. There is no public registration.
4. Install the CLI, then `supabase login` and `supabase link --project-ref <ref>`.

The queue migrations add the `cancelled` status and account-slot tables. Migration `0008_queue_and_account_slots.sql` also schedules slot expiry with Supabase's `pg_cron` extension.

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

Create `supabase/.env` (git-ignored; see `.env.example` for the server-only block):

```
RESEND_API_KEY=re_...
APP_BASE_URL=https://hwrk.wpoint.xyz
SERVER_SECRET=<output of: openssl rand -hex 32>
ADMIN_EMAIL=you@example.com
```

```
supabase secrets set --env-file supabase/.env
supabase functions deploy submit-request track-request admin-update-status admin-report-issue admin-delete-completed-request admin-retry-email
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into functions automatically. The service-role key and Resend key never reach the frontend. `APP_BASE_URL` must be the exact public site origin (scheme and hostname, no path) because it is used for both CORS and tracking links. For this deployment, use `https://hwrk.wpoint.xyz`. Do not change `SERVER_SECRET` later: it encrypts tracking tokens.

## 5. Request options

Edit `src/config/options.json` (name, description, accent colour). Then keep the database in step so emails and the admin dashboard use the same names:

```
npm run options:sql      # paste the output into the Supabase SQL editor
```

Each active option has two slots and can hold at most 14 outstanding requests. There are no weekly capacity limits.

## 6. GitHub Pages

1. Push to a GitHub repo with `main` as the default branch.
2. Settings > Pages > Source: **GitHub Actions**.
3. Optionally add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Actions secrets. Non-empty secrets override the same public frontend values from `.env`; if a secret is unset, the build uses `.env`.
4. For a custom domain, add repository variable `VITE_BASE_PATH` = `/`. Otherwise the base defaults to `/<repo-name>/`.
5. Push to `main`. The workflow builds and deploys. `dist/404.html` is a copy of `index.html` so `/admin` and `/t/<token>` survive a refresh.

## 7. Local development

```
cp .env.example .env.local   # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY only
npm install
npm run dev
```

## How it works

- **Submission**: the browser calls `submit-request`. It rate-limits by hashed IP (10 submissions/hour), validates every field, requires the school and contact email addresses to differ, and calls a locked-down SQL function that accepts the provided service password as free text, blocks duplicates (same Gmail and option while outstanding), enforces the 14-request cap under a per-option lock, creates the ticket (`HW-000001` from a sequence) and logs the initial status.
- **Queue and slots**: the database assigns two independent slots per option and reserves them in FIFO order. The 24-hour cooldown begins only when an admin starts processing. Completing or cancelling an in-progress request early does not release its slot; cancelling a waiting or reserved request releases its reservation.
- **Capacity**: waiting, reserved and in-progress requests count toward the 14-request cap. Completed and cancelled requests do not. Capacity is enforced in the submission transaction, so simultaneous submissions cannot exceed the limit.
- **Expiry and ETAs**: `pg_cron` runs `process_expired_slots()` once per minute without relying on an open browser. Submissions and private tracking lookups also process expiry for the relevant option. Estimated slot availability is derived from active expiries, reservations and FIFO requests and is not guaranteed.
- **Tracking**: the existing `/t/<token>` route is unchanged. The token is 256 bits of random data; only its SHA-256 hash is used for lookup. The page displays queue position, people ahead, estimated wait, reservation details and processing timestamps, and refreshes queue state every 30 seconds.
- **Admin queue controls**: the existing admin dashboard shows per-option counts, both slots, cooldowns and FIFO queues. Admins can start, complete or cancel requests, manually release an active slot, and adjust its expiry.
- **Lockdown mode**: the admin dashboard can replace all public pages with the configured domain listing and block new requests. The `/admin` route remains available so an administrator can turn lockdown off.
- **Status changes**: `admin-update-status` verifies the admin, then a SQL function updates the status and writes `status_history` in one transaction. Email is sent only when the status actually changed, and only for In Progress and Completed.
- **Issue reports**: admins can enter a reason in request details. The customer is emailed using the standard template, and the tracking page displays the latest issue and asks them to submit another request.
- **Order cleanup**: admins can permanently delete requests at any status from their details. Their history and email logs are deleted with them. Deleting a request does not interrupt an already-started slot cooldown.
- **Email failures** keep the ticket, are logged in `email_logs`, and can be retried from the request detail view.
- **RLS**: all tables have RLS on. Browsers can only read via admin-gated policies and column grants (encrypted tokens are never selectable), and the only writable request column is `admin_notes`.

## Notes

- Tracking tokens are stored as a hash (for lookup) and also AES-GCM encrypted with `SERVER_SECRET`, so later status emails and retries can rebuild the link. The encrypted copy is not readable from the browser.
- The admin list loads the latest 1,000 requests and filters/sorts in the browser.
- The provided service password is available only in the admin request details.

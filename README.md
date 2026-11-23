# SupplierDesk

SupplierDesk is a multi-tenant supplier compliance application built with
Next.js and Supabase. The current implementation includes company enrollment,
tenant-scoped supplier and document workflows, a dashboard, reports, and a
scheduled reminder worker.

This is **not yet ready for production data**. Production malware scanning,
hosting-specific trusted-proxy configuration, employee invitations, billing,
workspace cancellation and retention, and independent security review remain
outstanding. See the [deployment readiness guide](docs/DEPLOYMENT.md) before
deploying.

The proposed application-wide UI/UX specification is in
[application design](docs/UI-UX-DESIGN.md); it describes future screens as well
as existing development features.

## Local development

Use Node.js 24 and a running Docker daemon.

1. Run `npm ci`.
2. Run `npx supabase start` to start the local stack and apply migrations.
3. Copy `.env.example` to `.env.local` and replace the anon placeholder with
   the local **anon** key from `npx supabase status`. Set `SITE_URL` to the
   origin you will use in the browser.
4. Run `npm run dev` and open `http://localhost:3000`.
5. To test owner registration, open the verification message in the local
   email testing interface at `http://127.0.0.1:54324` in the same browser.
6. Install the browser with `npx playwright install chromium`, then run
   `npm run test:all`. See [testing](docs/TESTING.md) for the coverage gates
   and other validation details.

If Node.js 24 is not your default, you can start the app with
`npx --yes --package=node@24 -c 'npm run dev'`.

To stop only this project's local services while keeping its data, run
`npx supabase stop` from the project directory. Avoid `--no-backup`, which
deletes local data volumes, and `--all`, which stops other local projects.
The output of `supabase status` includes local secret keys; do not share it.

### Local document uploads

Uploads are disabled by default. To test them against the local Supabase stack,
add `SUPABASE_SERVICE_ROLE_KEY` with the **local** service-role key from
`npx supabase status` and `DOCUMENT_SCANNER=local-noop` to `.env.local`, then
restart the development server. The service key is server-only: never use a
`NEXT_PUBLIC_` prefix, commit it, or use a production key for this setup.
The no-op scanner accepts files without scanning and is permitted only with
`NODE_ENV=development` and the local Supabase URL on port 54321. Uploads and
link creation through the app are disabled otherwise. Do not upload confidential or real
customer documents.

On the Document requests page, create a supplier link, copy it before leaving
the page, and share it securely. It expires in seven days and can be revoked.
Suppliers do not need an account. PDF, JPEG and PNG uploads are limited to
15,000,000 bytes per file. The portal supports English and German, and
submissions appear as in-app notifications. An optional Resend invitation
adapter requires `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`; these
values are server-only. Provider acceptance does not guarantee delivery.
Production link creation and uploads remain disabled until a real malware
scanner is implemented.

The local Supabase config requires email confirmation. Hosted Supabase projects
must separately enable email confirmation and configure the exact callback URL;
deploying with confirmation disabled breaks the security requirement.

Workspaces have a 30-day trial and database-enforced limits of 100 suppliers
(including archived suppliers) and 10 members (including owners). The planned
price is €30 per company per month; payment processing is deferred and access
continues after trial expiry. Employee invitations, billing, cancellation,
six-month retention deletion, supplier import, and app-wide internationalization
are not implemented. See [testing](docs/TESTING.md), [security](docs/SECURITY.md),
[decisions](docs/DECISIONS.md), and [deployment readiness](docs/DEPLOYMENT.md).

Document requests, private storage, version history, reviews, and supplier
upload links are implemented. The only scanner is a local development no-op;
production uploads and application-issued supplier links therefore fail closed.
Do not use real or confidential customer data.

The initial Phase 4 dashboard shows company-scoped document counts, overdue
requests and approved documents expiring within 7, 30, 60 and 90 days, using
the latest request per supplier and requirement. Requests may include an
optional deadline, visible to suppliers, and active suppliers can have a contact
email. Dates use the company time zone, initially Europe/Vienna. The reminder
worker supports deadline and expiry notices, but is not active until the
deployment host, secrets, Resend sender, and Supabase Cron schedule are
configured and verified. The Reports page provides supplier
compliance, expiry and outstanding-request views with server-side pagination;
authorized staff can download company-scoped CSV files up to 10,000 rows and
PDF files up to 2,000 rows. PDF export fails explicitly for characters
unsupported by the embedded font; CSV remains available in that case.

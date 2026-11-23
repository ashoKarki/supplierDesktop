# Deployment readiness

SupplierDesk is not ready to accept customer data until every blocker in this
guide is resolved. The application enforces tenant isolation in PostgreSQL and
keeps document uploads disabled unless a real malware scanner is configured.
Passing local tests does not establish production readiness.

## Required application secrets

Configure these only in the production application host's encrypted secret
store. Do not commit them, expose them through `NEXT_PUBLIC_` variables, or
include their values in logs.

- `NEXT_PUBLIC_SUPABASE_URL`: the production Supabase HTTPS URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the production publishable/anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role key for private storage
  and scheduled work.
- `SITE_URL`: the exact HTTPS origin of the deployed application.
- `SUPPLIER_PORTAL_RATE_SECRET`: at least 32 random characters.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`: a Resend key and verified sender.
- `REMINDER_CRON_SECRET`: at least 32 random characters; shared only between
  Supabase Vault and the application worker endpoint.
- `REMINDER_LINK_SECRET`: a separate, stable secret of at least 32 random
  characters. Rotating it invalidates deterministic tokens for reminder jobs
  currently being retried; do not rotate without first draining the queue.

The local no-op scanner is never allowed in production. Do not set
`DOCUMENT_SCANNER=local-noop` outside local development.

## Automatic reminders

The worker at `/api/cron/reminders` is protected by `REMINDER_CRON_SECRET`.
It also fails closed unless document uploads are enabled with a scanner; the
local no-op scanner is accepted only for local development.
It creates deadline reminders seven days before and one day after the deadline,
and expiry reminders 90, 60, 30 and 7 days before expiry. Dates are evaluated
in each company's time zone. Supplier and confirmed owner/administrator
recipients are deduplicated in a private database outbox. Failed deliveries
retry with bounded exponential backoff; after eight attempts they become
`failed` and require operator review. Resend idempotency keys protect retries
from duplicate sends while the provider retains the key (24 hours). Delivery
is therefore at-least-once, not an exactly-once guarantee. Reminder emails are
English; the supplier portal itself remains English/German. Terminal outbox
records, including recipient emails, are deleted after 180 days; active and
failed-retry records remain until resolved or terminal.

Before enabling reminders:

1. Configure all application secrets above and verify the sender domain in
   Resend.
2. Enable `pg_cron`, `pg_net`, and Supabase Vault for the hosted database.
3. Store the exact application origin as `supplierdesk_app_url` and store the
   `REMINDER_CRON_SECRET` value as `supplierdesk_reminder_secret` in Vault.
   Keep the link secret only in the application secret store.
4. Schedule a POST every five minutes from Supabase Cron. Use the Vault-backed
   URL and header values; do not put the reminder secret in a migration, source
   file, or committed SQL script:

   ```sql
   select cron.schedule(
     'supplierdesk-reminder-worker',
     '*/5 * * * *',
     $job$
       select net.http_post(
         url := (
           select decrypted_secret
           from vault.decrypted_secrets
           where name = 'supplierdesk_app_url'
         ) || '/api/cron/reminders',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'x-reminder-secret', (
             select decrypted_secret
             from vault.decrypted_secrets
             where name = 'supplierdesk_reminder_secret'
           )
         ),
         body := '{}'::jsonb
       );
     $job$
   );
   ```

5. Confirm the job is enabled in `cron.job`, inspect HTTP results in `net`,
   and verify successful and failed test deliveries before relying on reminders.
   Never send production supplier emails as a smoke test.
6. Monitor delivery counts and failures. The outbox contains recipient
   addresses and must be treated as confidential:

   ```sql
   select status, count(*)
   from public.reminder_deliveries
   group by status
   order by status;

   select id, company_id, reminder_kind, attempts, last_error, created_at
   from public.reminder_deliveries
   where status = 'failed'
   order by created_at desc;
   ```

The `pg_net` queued request contains the shared reminder header until sent.
Before enabling the job, confirm `anon` and `authenticated` cannot read
`net.http_request_queue` or other scheduler internals, and restrict database
administrative access to trusted operators.

The scheduler is not active merely because the migration is applied. Reminders
must remain considered disabled until the cron job, Vault secrets, host secrets,
Resend sender, and monitoring are configured and verified.

## Mandatory production blockers

- **Malware scanning:** select, implement and test a production scanner for
  every accepted upload. Until then, uploads and application-issued supplier
  links correctly fail closed.
- **Hosting and trusted proxy:** select the deployment platform and configure
  an authenticated client-IP source for supplier portal rate limiting. The
  current production implementation supports Vercel's trusted
  `x-vercel-forwarded-for` header only and fails closed elsewhere. Never trust a
  client-supplied forwarding header.
- **Supabase Auth:** require confirmed email, configure production SMTP, the
  exact HTTPS callback allow-list and auth rate limits; verify signup,
  confirmation, recovery and session behavior on the deployed domain.
- **Private storage:** keep the document bucket private and at 15,000,000 bytes
  maximum; verify service-role credentials are server-only. Configure
  independent backups and test restore and object retention.
- **Operational lifecycle:** employee invitations and membership management,
  payment processing, workspace cancellation/suspension, data retention and
  coordinated database/object deletion remain unimplemented.
- **Security and operations review:** complete independent security review,
  test the production proxy/log-redaction path for bearer upload links, define
  incident response, monitoring, backups, retention, support and rollback
  procedures, and run the complete CI pipeline against the release commit.
- **Reports:** CSV exports are capped at 10,000 rows and PDF exports at 2,000;
  larger reports must be narrowed or exported in a future implementation with
  streaming and an explicit filter workflow.

Do not upload real supplier documents until these blockers are resolved.

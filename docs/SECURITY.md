# Security status

This is not a production-ready security design or a fully verified isolation
boundary. The current migrations and 95 pgTAP checks passed on the local
Supabase stack; they cover only a subset of the required security cases.

The initial schema separates company-owned suppliers and memberships with
`company_id`, enables RLS, and checks membership and role in policies. An
authenticated, email-confirmed owner can provision a company, profile, and
membership in one database transaction; repeated calls return the same
enrollment. The signup metadata is user-controlled and is validated again in
the database. The profiles table is keyed by user, since a user may belong to
multiple companies.

Local Auth is configured to require email confirmation. This is a mandatory
deployment setting: if a hosted project disables confirmation, Supabase can
mark users confirmed without verifying their email, and the database cannot
distinguish this from actual verification. The application rejects a session
returned immediately at signup as an additional diagnostic, not as a substitute
for configuring Auth correctly. Configure the exact callback URL, HTTPS,
appropriate auth rate limits, and production email delivery.

Only the Supabase anon/publishable key belongs in application configuration.
Never put a service-role key in the browser or a `NEXT_PUBLIC_` variable.
Membership mutations, invitations, cancellation, retention, and company
deletion are not yet implemented. Database triggers serialize company-level
supplier and membership capacity checks, including privileged inserts and
tenant moves. Trial expiry does not restrict access while billing is deferred.
The trial record is visible only to the company's owner and administrators;
clients cannot modify it. Payment processing is not implemented.
Tenant isolation, role escalation, and cross-tenant storage and API access
require comprehensive database, integration, and end-to-end security tests.

The initial supplier actions look up the authenticated user's membership and
check the role before writing. Database policies are intended as an independent
second boundary. Owner registration, supplier creation, and archiving have
passed a local manual smoke test; the remaining server actions and
session-refresh behavior still need integration coverage.

Document records carry `company_id`, use role-based RLS and composite foreign
keys, and use role-checked transactional functions for creation and review.
Application users cannot directly mutate versions or review history. Uploads
go through server-side validation and a private bucket without direct client
object access; downloads check the user's RLS-visible version before streaming
the object as an attachment. The local service-role key is used only on the
server. Database and API integration tests cover part of this boundary.

The scanner is explicitly a **no-op** and is enabled only for development with
the local Supabase URL and an explicit setting. No production scanner is
implemented, so production uploads and app-based link creation fail closed. File
extension, MIME and signature checks are not a substitute for malware scanning
or full file parsing. Do not store confidential files.

Supplier links are seven-day bearer credentials, stored as hashes and
revocable. They permit only submissions for their specific request, and the
database rechecks the link on upload. The URL itself is a secret: protect it in
transit, share it securely, and configure all application, proxy, CDN,
analytics, and error logs to redact its path before any deployment. Development
server request logs currently contain the URL. Supplier page responses use
no-store and an origin-only referrer policy; these do not prevent browser
history, screenshots, recipient forwarding, or server logs from exposing links.
Rate limits, abuse monitoring, email delivery, and a production token-leak
review are still required.

Storage and database writes are not a single transaction. Known failed
submissions attempt to remove their objects; an ambiguous database outcome is
logged and leaves the object for reconciliation. Automated reconciliation,
retention, and coordinated database/object deletion are not implemented.
Review/expiry processing, full API and browser security tests, and an
independent security review are still required before production.

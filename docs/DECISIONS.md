# Decisions

- The separate Master Product Development Specification v1.1 was not provided.
  The attached build prompt and the current request are the available sources.
- Use the five roles in the current request: owner, admin, quality manager,
  procurement manager, and viewer. The attached prompt uses a different role
  list. The user confirmed the proposed permissions and that users may have
  memberships in multiple companies.
- The registration validator checks the shape of the country code, not whether
  it corresponds to an assigned ISO country. Business email is syntactically
  validated; domain ownership is not established by this validator. Verification
  must be enforced by authentication before creating a workspace.
- The password minimum is provisionally 12 characters. Passwords are never
  normalized by the registration validator.
- Company signup uses email confirmation and Supabase PKCE, with workspace
  creation retried on owner sign-in if provisioning fails after verification.
  Until a cross-device confirmation flow is implemented, verification must be
  completed in the browser that started signup.
- The initial supplier list reads all pages before filtering in the app. It
  avoids silently truncating results but needs server-side search and pagination
  before large workspaces are supported. Permanent supplier deletion is not
  granted to application users; the future deletion flow must remove related
  data and files safely.
- Phase 2 requirements use a renewal interval of 1–120 whole months. Calendar
  month addition clamps to the last day of the destination month. Document
  expiry boundaries include the expiry date and use the company time zone.
- The Phase 4 dashboard uses `Europe/Vienna` as the initial workspace time zone;
  configuration is not yet available. Document counts use the most recent
  request for each supplier and requirement, breaking identical timestamps by
  request ID. Archived suppliers and cancelled latest requests are excluded
  from document counts; the total supplier count includes archived suppliers.
  Expiry alerts count approved documents through 90 days and expired approved
  or explicitly expired items. This is not a scheduled expiry transition or
  reminder system.
- Requests may have an optional submission deadline. Existing requests keep
  no deadline. The supplier sees the deadline and company time zone. A request
  counts once as overdue after its deadline when a current requested or
  rejected item remains outstanding; submitted and under-review items are not
  overdue. Cancelled or superseded obligations and archived suppliers are
  excluded. Deadlines do not block late uploads.
- The compliance report uses the latest request per supplier and requirement.
  Active suppliers with no current obligations are "Not assessed". For other
  suppliers the overall priority is action required (rejected), expired,
  incomplete (requested), pending review, expiring within 90 days, then
  complete. The counts and status are calculated, not manually assigned.
  Cancelled latest requests and archived suppliers are excluded.
  CSV and PDF exports require the `export_data` permission. PDFs embed an
  open-licensed Unifont font and explicitly reject unsupported characters
  rather than silently dropping them; CSV remains available.
- The dashboard uses an RLS-enforced database snapshot. Reports use
  tenant-checked SQL aggregation and 50-row server-side pages, ordered
  deterministically. CSV/PDF exports are created from one database snapshot
  and capped at 10,000 CSV rows or 2,000 PDF rows; larger exports return
  HTTP 413 rather than silently truncating data.
- Supplier contact and invitation email addresses retain their case after
  trimming. Existing addresses previously saved in lower case cannot be
  automatically restored.
- Automatic reminders use a Supabase scheduler and secure worker. The selected
  submission-deadline schedule is seven days before and
  once the day after the deadline; expiry reminders use 90, 60, 30 and 7 days.
  Suppliers and company owners/administrators are intended recipients.
  The application now has a durable outbox, deduplication, bounded retries and
  an authenticated worker. Production delivery remains inactive until the
  Resend sender, host/Vault secrets, and Supabase Cron schedule are configured.
  Supplier reminders are English; the portal remains English/German.
- The initial document state matrix is in `src/domain/document-state.ts`.
  Submissions, review transitions, rejections, and superseding an approved
  version are persisted and checked in the database. Scheduled expiry and
  cancellation are not implemented.
- The founder selected a 15 MB per-file limit, expiry entry by both suppliers
  and reviewers, and a clearly marked no-op scanner for local development.
  PDF, JPEG and PNG are accepted, with a 15,000,000-byte limit. The no-op
  scanner is available only on the local development stack; no production
  malware scanner is implemented. The production scanner has not yet been
  selected.
- Supplier links expire after seven days, can be revoked, and can be reused for
  the same request until expiry or revocation. Final-submission locking is not
  implemented. Links can be shared manually or emailed through Resend; email
  processing is not a durable delivery queue.
- The supplier portal supports English and German. Invalid, expired and revoked
  links show the same bilingual message. The rest of the app is not yet localized.
- Supplier portal requests are limited to 60 per IP and 30 per token in a
  five-minute fixed window. The production IP identity is supported only on
  Vercel using its `x-vercel-forwarded-for` header; other production hosting
  fails closed until an appropriate trusted-proxy implementation is added. The
  intended host is not Vercel, but its platform and proxy are not yet specified.
- Supplier submissions generate a company-scoped in-app notification per
  version. Manufacturer email or push notifications are not yet implemented.
- Each company receives a 30-day trial; existing workspaces receive a full trial
  starting when the trial migration runs. The planned price is €30 per company
  per month, but payment processing is deferred and access continues after
  trial expiration. No paid subscription or payment is represented.
- The company limits are 100 suppliers, including archived suppliers, and 10
  members, including owners. Pending invitations are not yet implemented and
  do not reserve seats; invitation acceptance must honor the member limit.
- A cancelled workspace should be suspended with an owner reactivation path,
  and deleted after six months. Cancellation, reactivation, storage cleanup,
  and scheduled deletion are not yet implemented.

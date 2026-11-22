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
- The initial document state matrix is in `src/domain/document-state.ts`.
  Submissions, review transitions, rejections, and superseding an approved
  version are persisted and checked in the database. Scheduled expiry and
  cancellation are not implemented.
- The founder selected a 15 MB per-file limit, expiry entry by both suppliers
  and reviewers, and a clearly marked no-op scanner for local development.
  PDF, JPEG and PNG are accepted, with a 15,000,000-byte limit. The no-op
  scanner is available only on the local development stack; no production
  malware scanner is implemented.
- Supplier links expire after seven days, can be revoked, and can be reused for
  the same request until expiry or revocation. They are manually shared; email
  delivery and rate limiting remain unimplemented.

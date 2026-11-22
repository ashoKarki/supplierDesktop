# Testing

With Node.js 24, run `npm run test:unit`, `npm run lint`,
`npm run typecheck`, and `npm run build`.

Application code uses TypeScript strict mode and checked indexed access. The
type-aware lint rules reject explicit `any`, unsafe propagation of `any`, unsafe
type assertions, unparameterized `SupabaseClient` types and SSR client factories,
and JavaScript under `src/`. Lint warnings fail the command.
`tests/typecheck/database.ts` is compiled by
`npm run typecheck` to verify invalid database calls remain type errors.
Dependency and framework-generated files are not subject to these application
lint rules.

The Supabase database types are hand-maintained and have been compared against
types generated from the current local schema. After a migration, start the
local stack and compare
`npx supabase gen types typescript --local --schema public` with
`src/lib/supabase/database.types.ts`. Reconcile them after every schema change
and rerun lint, type-checking, and the database tests. Nullable RPC arguments
are modeled explicitly where the functions accept null, since the generator
does not infer that from PostgreSQL function signatures. Static types do not
replace input validation, RLS, or database integration tests.

The unit tests cover registration validation, the provisional permission helper,
configuration validation, enrollment orchestration, owner sign-in recovery,
supplier authorization, and supplier filtering with fake dependencies. They do
not prove the actual Supabase integration or supplier actions. A local manual
smoke test covered owner registration, email verification, workspace creation,
and supplier creation and archiving; its disposable data was removed afterward.
Phase 2 unit tests cover document transitions, rejection reasons, expiry
boundaries and time zones, renewal validation and requirement permissions.
A local browser smoke test covered requirement and request creation, staff
upload/download, rejection, replacement, approval, cross-company download
denial, supplier submission, and link revocation. Its temporary records and
objects were removed afterward.

With Docker running, start the local stack using `npx supabase start`, then run
`npm run test:rls` and `npm run test:integration`. The 135 pgTAP checks pass on
the local Supabase stack and cover a subset of tenant isolation, role
restrictions, storage, versions, reviews, and supplier-link expiry and
revocation. The API integration tests create disposable local users, companies,
and objects and exercise request creation, private storage, role restrictions,
cross-tenant access, reviews, version replacement, and supplier links, then
remove their test data. The storage integration test checks both exactly
15,000,000 bytes and one byte over the limit. They require the local Supabase stack at
`127.0.0.1:54321` and obtain its local service key from the CLI without printing
it. Trial and capacity tests also check 30-day provisioning, role isolation,
archived suppliers, tenant moves, independent workspaces, concurrent writes at
both limits, and continued access after trial expiry. Supplier portal tests
exercise localized email with a fake provider, failure compensation, scoped
notifications, and concurrent token throttling. No real email is sent in tests.
Unit tests also cover supplier-link lookup failures and rate limiting, upload
validation and storage cleanup, document download authorization, workspace
and request actions, page permissions, and the verification callback. These
mocked tests supplement, but do not replace, the database isolation tests.

Install Chromium once with `npx playwright install chromium`, then run
`npm run test:e2e` against the local stack. The two browser tests use disposable
data and a separate app server on port 3100. They cover mobile English/German
uploads, rejection and resubmission, review, safe invalid-link pages and axe
checks for serious or critical portal violations. Failed-test traces can contain
disposable bearer links; do not use this suite with real customer data. The
app's local no-op scanner does not protect uploads from malware.

`npm run test:coverage` runs unit and integration tests with coverage over
application source; `npm run test:all` runs the local pipeline. Coverage gates
require 80% overall and 90% in each of `src/domain/**` and
`src/lib/security/**` for lines, statements, functions, and branches. The
global threshold includes the domain and security files. Browser execution is
not included. The latest local run measured 86.48% lines, 84.67% statements,
81.20% functions, and 81.18% branches. Other pipeline checks run before the
coverage gate. The updated CI workflow has not yet been verified on GitHub.

Do not treat the current SQL, policies, or registration flow as production-ready
until the database tests and full security and end-to-end suites have passed.

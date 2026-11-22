# SupplierDesk

This is an incomplete Phase 1 and Phase 2 implementation, **not ready for deployment or
customer data**. A local registration smoke test passed, but automated
end-to-end coverage is incomplete and the database policy tests cover only a
subset of isolation requirements.

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
6. Run `npm run test:unit`, `npm run lint`, `npm run typecheck`,
   `npm run test:rls`, and `npm run test:integration`.

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
15,000,000 bytes per file. Email delivery is not implemented.

The local Supabase config requires email confirmation. Hosted Supabase projects
must separately enable email confirmation and configure the exact callback URL;
deploying with confirmation disabled breaks the security requirement.

Initial protected workspace pages and supplier create, rename, search, and
archive flows are present; only creation and archiving have been smoke-tested
against the database. Invitations,
supplier import, billing, production email delivery, internationalization, and
full integration and browser tests are not implemented. See [testing](docs/TESTING.md),
[security](docs/SECURITY.md), and [decisions](docs/DECISIONS.md).

Phase 2 includes document requests, local-only uploads, private storage,
version history, reviews, and supplier upload links. These are development
features, not a production-ready security or operations design.

# Academy legacy cleanup V106.61

The isolated `feature/academy-review-fixes-10660` preview uses a dedicated D1 application. Its request handler and exported Library storage class do not import Google Sheets, Apps Script, private Google Drive clients or the legacy router. Development and main remain separate releases.

## Runtime and storage

`backend/src/academy-runtime.js` is the Node-testable D1 request handler. `academy-worker-runtime.js` adds the Cloudflare storage export. The feature preview serves that handler with its existing isolated D1 database, R2 bucket, Durable Object namespace, authentication secrets and recovery trigger. It does not reseed accounts or apply database migrations.

`ACADEMY_OPEN_LIBRARY_STORAGE_KEY` contains the complete Cloudflare metadata object name. Class and binding names remain unchanged. V106.60's feature preview had neither a spreadsheet namespace setting nor a neutral key, so metadata routes could not resolve storage. Its new key is `academy-feature-10660:open-library-metadata`. For a future deployment with existing metadata, set the key to the exact previous `<spreadsheet ID>:open-library-metadata` name. This release does not change the live Academy namespace.

Missing settings, `OFF` and invalid modes return an error without selecting Sheets. `PAUSED` stops before storage access. Rehearsal requires a local or explicitly isolated deployment. Public-only Library enforcement retains the assigned Program selector used by account and attendance screens.

Authentication primitives, subject validation, timetable projections and Course/calendar domain factories are separated from storage adapters. Token formats, audience, expiry, PIN formats, account epochs, current Course identifiers, role evidence and publication contracts are preserved. Compatibility adapters remain for legacy regression coverage and offline work, outside the Academy dependency graph.

## Website and intentional media

The publish artifact follows active page references and an explicit allowlist. Its dedicated frontend configuration recognises only this feature preview and local testing, with no Development or legacy backend fallback. It excludes standalone admin/student applications, the old app shell, unused private Library scripts, backend source, tools, documentation and hidden files. Old Program Library bookmarks show an availability page with a public Library link. Current Course management, account, attendance, recorder, PDF tools and activities remain included.

Archive.org, public Google Drive PDF links and YouTube recordings remain intentional connections. Existing R2 lesson files, assessments, announcement images and covers remain supported. The future shared private Library and Module subscriptions are separate work.

## Commands and release ownership

- `npm run check:academy-boundary` verifies the Academy request handler and storage export dependencies.
- `npm run test:academy`, `test:legacy` and `test:offline` select regression groups. `npm test` still runs every file.
- `npm run prepare:feature-release -- <existing private config> <new private directory>` packages an isolated update without recreating storage or rotating secrets.
- `academy-feature-preview.mjs` is the separate synthetic initialisation tool. Do not use it to update an existing preview database.

Deploy only the generated feature configuration. It rejects the live D1 ID, non-feature buckets and route bindings. Existing production/development deployment configuration is retained for those independent releases. Future promotion must deliberately select the Academy entrypoint, verify the existing Library key and complete hosted acceptance for that target.

The preview already had no Google credentials. Production credential retirement and its observation period remain outside this feature-only release.

## Verification and rollback

New checks cover core workflows without Google settings, fail-closed modes, stable Library IDs and revisions, private route rejection, intentional media and exclusion of legacy/private assets. Legacy tests remain available. Inspect the generated bundle for Sheets, Apps Script and private Drive client code. All 154 regression files pass. Fourteen phone and desktop browser checks pass with no page errors or unexpected failed requests. Nine actual local Wrangler runtime checks verify existing synthetic credentials, management, Durable Object metadata reads/writes and private upload rejection. The local emulator uses its supported 2026-10-13 compatibility date; the deployed preview retains 2026-10-14. Hosted checks target only the isolated preview.

Rollback selects the preceding feature Worker version and matching frontend artifact, retaining the same D1 database and authentication secrets. Never restore historical business data or switch to Sheets as a code rollback.

# Umm Abbad Academy — V106.82

This `development` branch contains the Cloudflare D1 Academy application. The separate Git `main` branch continues to serve the legacy Reboot application.

- Website: https://maktab-development.pages.dev/academy/
- API: https://devrebootworker.maktab4life.workers.dev/
- Database: existing `maktab-academy`; no data copy or reimport in this release.
- Independent HifzHelper links remain. The cancelled shared-login integration is not part of Academy.

## Development and deployment

Install the pinned backend dependencies with `npm --prefix backend ci`. Run `npm --prefix backend test` and `npm --prefix backend run check:academy-boundary` before release.

Cloudflare Pages uses `npm --prefix backend ci && node backend/tools/academy-pages-build.mjs`, output `.academy-pages`, repository root, branch `development`. The website calls the existing Development API on stable and preview addresses.

Deploy the matching API with `npm --prefix backend run deploy:development`. The default deploy command also selects Development. This branch contains no deployment configuration for the legacy production Worker.

Changing a website or Worker Git branch selects code only. The Development database, uploaded files, sessions and Open Library metadata retain their existing storage identities. Test edits therefore affect this shared Development data.

## Storage and recovery

Keep the existing D1, assessment and lesson-media buckets, shared public-media bucket, login rate limiter and `PROGRAM_TIMETABLE_COORDINATOR` binding. Its deployed class name remains stable to preserve Open Library metadata. `ACADEMY_OPEN_LIBRARY_STORAGE_KEY` stores the complete existing Cloudflare object name and has no Google dependency.

Offline snapshot validation, import verification, provenance and recovery tools remain under `backend/tools/academy-migration/`. They read saved snapshots; the online Google capture client has been retired. No database migration runs during ordinary deployment.

[Cleanup scope, checks and infrastructure inventory](docs/ACADEMY-DEVELOPMENT-CLEANUP-106.82.md). Earlier implementation history is retained in `docs/` and [the archived README](docs/archive/README-through-10681.md); historical instructions are not current deployment guidance.

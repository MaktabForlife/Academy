# V107.78 — Automatic homepage snapshot refresh

The user authorised local testing and deployment on 26 October 2026. Includes deployed V107.77 and the separately authorised two-page planning-image follow-up.

## Behaviour

A confirmed change carrying pending cache work triggers the existing authenticated cache-refresh endpoint. Final accepted publication records its own pending revision in the guarded transaction, so a refresh of an earlier source draft cannot consume the accepted publication's work. Private-only changes and rejected publications add no homepage refresh. Replaying publication does not increment its marker.

The setup dialog and originating Publish action share one refresh for the same accepted head. Requests have a 20-second timeout; simultaneous distinct saves allow one bounded follow-up. There is no navigation polling or browser retry loop. Network, storage, permission or quota failures leave publication successful and recovery durable. The existing fifteen-minute recovery schedule, leases, revision fencing and quota-reset pause remain in force. Global Admin retains Update timetable as a manual fallback. An automatic refresh invalidates local read caches without prefetching the public homepage from an Admin dashboard.

Current server-side Admin scope, revocation, workspace and manual Global Admin checks remain intact. Public snapshots still whitelist marketing fields and exclude classes, teachers, accounts and meeting URLs. No migration or private coordinator change is required.

## Local verification

- Fifteen focused tests: confirmed hints, bounded/coalesced requests, timeout, denial, session/workspace changes, transaction rollback, earlier draft refresh, replay, private-only changes and durable recovery.
- Forty-one existing publication, public snapshot, permission, read-cache and workspace regression checks.
- Actual Workers/Miniflare split runtime: unchanged private coordinator, Core marker, accepted Admin definitions and public R2 snapshot; assessment publication/learner permissions remain verified.
- Fourteen browser checks using the real UI/Worker and synthetic SQLite/R2, including one immediate refresh, storage failure with successful publication, visible manual fallback and no requests for no-change/rejected publication.
- Thirty-six planning browser checks, including a real two-page PDF becoming one complete full-width image with unchanged fonts and scale, sharing, cancellation, PDF fallback, Arabic and Admin notes.

Verification artefacts are outside the published site in the project's outputs directory. Live checks are limited to release metadata/static assets and one targeted API readiness response; no live timetable publication or snapshot rebuilding is used for acceptance.

## V107.79 page-coverage correction

V107.78 covered the Academy dashboard but missed the shared-helper script on standalone management pages. V107.79 loads it exactly once on all 27 workspace pages. The real Program management browser fixture now verifies a successful Program Publish explicitly reports the public snapshot refreshed and writes the public R2 object. All 24 Program browser checks and nine helper/page-coverage tests pass. Existing V107.78 backend/permissions and accepted-publication browser evidence remains applicable; this correction changes HTML script coverage and release version markers only.

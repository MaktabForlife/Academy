# Isolated Feature preparation

Latest owner direction: test ready changes on Feature before Development.
This preparation branch includes the reviewed V109.25 management/version-label fixes. It does not activate JWT or change Development.

## Exact destination

- Academy account: c9a3e355b3d7a795880b1d36a1dbe123 (hajira.naidu@gmail.com).
- Ready branch and Pages preview: feature-preview, https://feature-preview.academy-maktab4life.pages.dev.
- API: feature_worker; private coordinator: academy_feature_split_coordinator.
- New Core: 0eaf6d46-bbaa-46e3-8287-b6113ef8f2a8.
- New Admin: 18ad0efb-cd34-42a4-b510-7051f0303200.
- Private media buckets: maktab-lesson-media-private-feature, maktab-assessments-private-feature, maktab-feature-media-private.
- New Feature-owned coordinator namespaces; never transfer, delete, or bind live namespaces.
- No schedules, live upstreams, inherited variables, or live DB/R2/service bindings.

The API config stays PAUSED with FEATURE_NOT_INITIALISED until initial schema, synthetic seed, native authentication and installed bindings are verified. The existing Feature Worker migration tag must be inspected before first namespace creation; the proposed tag is not evidence of server state.

## Build and schema evidence

The GitHub-only schema proof reconstructs current schemas from the pinned synthetic split fixture, applies the existing attachment conversion and ordered Core/Admin migration inputs, exports only schema, and checks independent empty-database import, exact object parity, references, integrity, and zero data rows. It exports no accounts, credentials, sessions, fixture seed or live snapshots. This is a new-store schema proposal, not an installed migration ledger.

The Feature build explicitly selects config/hosting.feature.json as config/hosting.json on the disposable runner. Its manifest records both hashes and the exact source commit. Management trust and generated clients use this same reviewed variant. Existing Development hosting.json is unchanged in Git. Studio/Hifz integration is unavailable until separately isolated equivalents exist; Feature cannot silently use live services.

## Remaining first setup gates

1. Review immutable GitHub run and hash-verified schema artifacts with DB check.
2. Install schema only in the two new empty Feature IDs, verify the exact resulting objects and foreign keys.
3. Prepare a private synthetic seed using new Feature-only secrets. Never clone live people or reuse public fixture credentials. Verify native PIN format, scoped Admin, session revocation, authority and media operations before activation.
4. Verify old Feature metadata and migration history; install new private coordinator and new Feature-owned timetable namespace. Remove old Feature-only HIFZ_PROFILE_SYNC_SECRET explicitly; omission does not remove retained secrets.
5. Bind the new stores and private buckets with an explicit variable/secret allowlist, verify PAUSED metadata, then activate only this reviewed Feature instance.
6. Enable a serial test-before-deploy workflow on feature-preview after storing the reviewed initialization receipt. Routine deployment must contain no SQL, seed/reset, secret rotation or Development promotion.

## Dedicated deployment credential

The attempted transfer of an existing production credential was rejected by automatic approval review. It was not committed or executed and must not be retried indirectly.

Create a new credential only after specific owner confirmation of its account, permissions and destination: GitHub MaktabForlife/Academy environment feature, permitted deployment branch feature-preview. Prefer a Worker-specific permission scope if the account supports it. Otherwise Workers Scripts Write and Pages Write are account-wide capabilities; the pipeline target guard restricts its intended use but does not reduce the token's Cloudflare privileges. Read-only account/D1/R2 metadata permissions are for exact target verification. Do not grant D1 Write/Delete, DNS Write or API-token administration to routine deployment. Initial new-store schema/seed work stays separately scoped and reviewed.

No automatic deployment is enabled by this preparation alone.

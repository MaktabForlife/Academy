# Isolated Feature preparation

Latest owner direction: test ready changes on Feature before Development.
This preparation branch includes the reviewed V109.25 management/version-label fixes. It does not activate JWT or change Development.

## Exact destination

- Academy account: c9a3e355b3d7a795880b1d36a1dbe123 (hajira.naidu@gmail.com).
- Ready branch and Pages preview: feature-preview, https://feature-preview.academy-maktab4life.pages.dev.
- API: feature_worker; private coordinator: academy-feature-split-coordinator.
- New Core: 0eaf6d46-bbaa-46e3-8287-b6113ef8f2a8.
- New Admin: 18ad0efb-cd34-42a4-b510-7051f0303200.
- Private media buckets: maktab-lesson-media-private-feature, maktab-assessments-private-feature, maktab-feature-media-private.
- New Feature-owned coordinator namespaces; never transfer, delete, or bind live namespaces.
- No schedules, live upstreams, inherited variables, or live DB/R2/service bindings.

The API config stays PAUSED with FEATURE_NOT_INITIALISED until initial schema, synthetic seed, native authentication and installed bindings are verified. The existing Feature Worker migration tag must be inspected before first namespace creation; the proposed tag is not evidence of server state.

## Build and schema evidence

The GitHub-only schema proof reconstructs current schemas from the pinned synthetic split fixture, omits the explicitly named source-era table-family DDL from a new empty base, then applies the existing attachment conversion and every ordered Core/Admin migration exactly once, exports only schema, and checks independent empty-database import, exact object parity, references, integrity, and zero data rows. It exports no accounts, credentials, sessions, fixture seed or live snapshots. This is a new-store schema proposal, not an installed migration ledger.

The Feature build explicitly selects config/hosting.feature.json as config/hosting.json on the disposable runner. Its manifest records both hashes and the exact source commit. Management trust and generated clients use this same reviewed variant. Existing Development hosting.json is unchanged in Git. Studio/Hifz integration is unavailable until separately isolated equivalents exist; Feature cannot silently use live services.

## Remaining first setup gates

1. Review immutable GitHub run and hash-verified schema artifacts with DB check.
2. Install schema only in the two new empty Feature IDs, verify the exact resulting objects and foreign keys.
3. Prepare a private synthetic seed using new Feature-only secrets. Never clone live people or reuse public fixture credentials. Verify native PIN format, scoped Admin, session revocation, authority and media operations before activation.
4. Verify old Feature metadata and migration history; install new private coordinator and new Feature-owned timetable namespace. Remove old Feature-only HIFZ_PROFILE_SYNC_SECRET explicitly; omission does not remove retained secrets.
5. Bind the new stores and private buckets with an explicit variable/secret allowlist, verify PAUSED metadata, then activate only this reviewed Feature instance.
6. Enable the prepared serial test-before-deploy workflow on feature-preview after storing the reviewed initialization receipt. Routine deployment must contain no SQL, seed/reset, secret rotation or Development promotion.

## Dedicated deployment credential

The attempted transfer of an existing production credential was rejected by automatic approval review. It was not committed or executed and must not be retried indirectly.

Create a new credential only after specific owner confirmation of its account, permissions and destination: GitHub MaktabForlife/Academy environment feature, permitted deployment branch feature-preview. The reviewed but unsubmitted 30-day token uses Individual Workers Editor only for feature_worker and academy-feature-split-coordinator, plus account-wide Pages Write. No direct D1/R2, DNS or token-management permission is requested. Pages access can affect other projects in the account; the workflow pins the existing Pages project and feature-preview branch and checks that it remains a preview. Owner approval of creation and GitHub storage is pending. Initial new-store schema/seed work stays separately scoped and reviewed.

The automatic job is implemented but disabled: the initialisation receipt is PENDING and FEATURE_DEPLOYMENT_ENABLED is unset. It will require both the reviewed VERIFIED receipt and the enable switch. It checks installed bindings/namespaces/keys/limits, no schedules/public coordinator URL, exact ready-branch head, and Pages preview status before deployment; it verifies the installed metadata, exact Pages commit marker and native version afterward. A partial failure attempts to leave only Feature PAUSED and records whether that was verified. It never rolls back the production Pages project, performs SQL, rotates secrets, or promotes Development. Hosted behavior and recovery are still unverified until initial setup is complete.

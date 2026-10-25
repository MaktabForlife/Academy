# Local Academy read optimisation

Branch: `feature/academy-read-optimisation`.

This work is local and has not been pushed, deployed or applied to a hosted database. The user's deployment hold overrides the earlier Development deployment authorisation. This branch started from Development commit `411c7b01` (V107.65) and now includes the already-deployed V107.66 commit `9b5b1361`. The original Development checkout remains separate. Code deployment and the hosted Core upgrade are on hold through the next daily reset, 00:00 UTC / 03:00 Riyadh on 26 October 2026; no automatic deployment is scheduled.

## Behaviour

- Assessment setup loads the Imtihaan and its editable data once. Add to draft, Edit and Remove operate locally. Save all sends up to 100 logical paper edits in one atomic operation, covering at most 1,000 class assessments. A shared paper retains its original class selection and individual row revisions.
- Validate schedule saves any queued edits, then validates every assessment in the Imtihaan against fresh database state. Release schedule rechecks the whole group and atomically releases its schedules and eligible learner rosters. Paper and mark release remain separate. Saving still checks current authority and record revisions; editing a field makes no database request.
- Normal calendar/dashboard reads do not calculate teaching workload. Opening Admin teacher availability explicitly requests it. Learn and Teach cannot request workload, including through an Admin preview.
- Sign-in builds a private permission snapshot. Navigation reuses its roles, subscriptions, learning-area directory and contexts. Every request still checks the primary database for the current session, account status, PIN setup, credential epoch, timed grants and permission revision. Role/subscription changes reload the snapshot immediately. Credentials and tokens are never stored in it.
- Dashboard timetable source rows, assessment metadata and calendar responses use private snapshots. Timetable joining, current time and final audience projection still run for each request. Full assessment details, learner evidence, marking and mutations are not cached.

## Read reduction

Accepted and federated JSON projections are materialized once for queries joining several projected tables or repeating a projected table. Simple single-table reads retain normal SQLite planning. Request-local class-list reuse avoids repeating identical authority/class queries. Group publication loads learner rosters in one query rather than one query per paper.

Local Miniflare D1 benchmark with identical returned results:

| Synthetic query | Rows returned | Previous reads | Optimised reads | Reduction |
| --- | ---: | ---: | ---: | ---: |
| Accepted timetable / teacher join | 20 | 840,732 | 2,205 | 99.74% |
| Federated assessment / class / phase join | 400 | 62,800 | 4,796 | 92.36% |

Warm dashboard assessment and calendar snapshots avoid all expensive coordinator producer queries in the fixture (29 → 0 and 34 → 0 respectively). Small current-access and source-version checks remain. Warm session-state reads do not rebuild role and subscription lists. These are local measurements, not a forecast or guarantee of hosted daily usage.

## Invalidation and permissions

Core and Admin remain the authoritative stores for their existing fields. There is no third database. Snapshots use the existing private lesson-media R2 binding, with hashed keys separated from uploaded assets and personal links.

The accepted setup head, local date, workspace, account, class preview and input distinguish or version published snapshots. Core counters invalidate enrolment, teacher assignment, current visibility/access policies, curriculum disables, cancellations, calendar availability and published assessment facts. Counter account scopes follow the database's case-insensitive account identity semantics.

Permission snapshots use current role/subscription counters and the accepted setup head. Role changes also invalidate a global permission counter because retained legacy role mappings are derived across assignments. Timed substitute grants are checked on every request even without a database mutation. Account blocks, revoked sessions and PIN resets are checked before reading cached permission data.

Within one request, a non-serializable server marker lets a data snapshot reuse the session's verified Core version. A changed Core version causes full authority verification again. Browser JSON and stored R2 objects cannot supply that marker. Private coordinator reads and writes keep their existing authority, fencing, recovery and atomic-commit checks.

Admin metadata retains draft semantics and invalidates on any successful Core/owner transaction, including Admin-only definition changes. Published reader snapshots can survive unrelated attendance, marking and note writes.

Cache storage failures fall back to the established database readers. Missing invalidation schema disables snapshot use. Auth/source checks run again after storage reads and slow writes; permission changes during those waits cannot return the stale result. Stable object keys replace previous dates/publications instead of retaining one object every day. Distinct timetable weeks/calendar inputs may still create separate objects.

## Verification

- Combined V107.66 branch: all 106 Academy regression files passed, including targeted reruns after correcting the Attendance page's versioned asset references. The focused assessment/register/batch/snapshot checks passed all 97 cases.
- Actual local Workers runtime: two D1 bindings, private Durable Object RPC, R2 permission cache at sign-in, and repeat dashboard snapshots passed.
- Browser acceptance: local drafts, editing and batch saving, lost-response retries, whole-Imtihaan validation/release, shared-class scope, mobile layouts and existing paper/result/report workflows passed.
- Additional checks cover stale register/member revisions, rollback of every batch write/event/receipt, denied authority, account/session/PIN changes, source changes during storage, timed grants, private-cache outage, snapshot isolation, policy disables, and idempotent schema installation.
- A 100-paper batch saved and released atomically; every coordinator invocation stayed within the fixture's 50-query budget.
- Academy boundary check passed for 133 modules. Both local browser acceptance scripts passed, with external browser traffic blocked. No hosted verification was performed during implementation.

## V107.66 integration

The merge retains V107.66's class-grouped manual marks, actual-Teacher checks for assigned examiners, fresh permission and revision checks, and one publication step for the complete approved paper set. Marks remain private until explicit Admin release. Assessment detail, marks and report readers remain live; the dashboard snapshot still contains only its existing metadata.

A split-store integration check now batch-saves an Imtihaan, rejects marks entry before schedule release, validates and publishes the whole schedule, and then saves and explicitly releases manual marks without fabricating an answer submission. The native browser acceptance starts from a batch-saved shared assessment and exercises paper publication, Teacher/Admin marks entry, lost-response retries, zero marks and learner-only released results. The earlier browser acceptance also verifies local draft editing, Save all and validation auto-save.

## Release preparation still subject to the user's deployment hold

The additive Core upgrade is `backend/migrations/academy-core/0002_private_dashboard_snapshots.sql`, generated from `snapshot-revisions.js`. It installs only counter triggers/settings; it does not rewrite learning records. The final schema marker activates caching. Installation and SQL-copy round trips are tested for repeatability. This file has not been applied remotely.

When deployment is explicitly authorised, follow the repository version/cache-busting rules and release the matching website and Worker. Apply the reviewed Core upgrade through the normal migration workflow. The code falls back to existing readers until that upgrade is present. R2 storage/read/write operations and small Core counter writes should be included in post-release usage checks alongside D1 row-read totals. No automatic deployment or usage polling is scheduled by this change.

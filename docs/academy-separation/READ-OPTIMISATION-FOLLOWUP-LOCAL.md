# Academy read optimisation follow-up — V107.72

Branch: `feature/academy-read-optimisation-2`. The reviewed optimisation commit `9a89551e` was based on V107.70; this release incorporates deployed V107.71 (`3b472e2a`). The original V107.67 optimisation branch is preserved. On 26 October 2026 the user confirmed V107.71 was deployed and authorised releasing these optimisations as V107.72 to the existing Development API, private coordinator and Academy website. No database upgrade is required.

**Keep live checks small to limit database usage.** Implementation and measurements use saved analytics and disposable local fixtures. No hosted Academy request, SQL query, migration or setting change was made during implementation. Release verification uses targeted version/readiness metadata; no live assessment records are changed.

## Remaining costs identified

The saved post-V107.67 analytics included 149 readiness/time-zone executions, reading 105,194 rows in total (about 706 per execution). The setting itself is fixed Admin configuration; the repeated cost came from the query walking published setup components to find it. Another recurring settings capture ran 237 times, averaging 23 Core rows, with additional Admin capture work. Schema inspections at roughly 1,092 reads per execution were development/release diagnostics, rather than normal navigation queries.

The small current session/permission checks remain. Their purpose is to enforce revocations, account blocks, current grants and credential changes, even when navigation reuses cached configuration and definitions.

## Fixed settings

- Published time-zone configuration is loaded once per Worker isolate and accepted publication, into a bounded cache of immutable scalar values. Later requests reuse it. A new accepted publication, a different deployment namespace, a cold isolate or eviction reloads it through the existing `(head_id, table_name, scope_key)` index.
- Readiness now checks Core directly. It retains the deployment generation/source/state guards and active account/confirmed Global Admin guards without fetching Admin settings.
- Readiness, sessions and permission decisions are never cached across requests. The immediate operational disable for memorisation cards is still read live.
- Pinned historical publications keep their own fixed settings. No new index or database migration is required.

Actual local D1 measurement with 700 setup components and the same returned configuration:

| Readiness SQL path | Database row reads |
| --- | ---: |
| Previous | 709 |
| Optimised, cold fixed-setting cache | 12 |
| Optimised, warm fixed-setting cache | 7 |

The warm reduction is about 99% for this readiness path. These numbers exclude the request's other application/access queries; they are not a daily usage forecast or a claim about the whole app.

Core federation also captures only the exact `AcademyWrite:` Admin counter prefix when combining settings. Other Admin settings were already ignored in Core's result and no longer need to be transferred. Both owners' write counters still add correctly.

## Published assessment definitions

A successful assessment-related setup publication prepares one shared, private R2 snapshot of accepted definitions and published labels. Learner lists and details reuse that source, avoiding repeated reconstruction of assessment/class/register/phase JSON joins. Normal learners fetch current assessment facts only for their own assessment IDs; existing Admin preview behaviour is retained. Dashboard assessments retain their existing private snapshot path.

The shared source includes titles, subject/date/timing definitions and class/activity/register labels. It contains no learners, recipient lists, answers, marks, feedback, examiner account IDs, paper file identifiers, permissions or release state. Personal results, current submission/collection state, paper approval/release, schedule withdrawal, ownership and class access remain current. Paper-opening decisions are calculated against the current clock.

Saved Admin drafts remain private until accepted publication. The accepted head identifies the definition version. Current session and authority checks run before and after R2 reads and writes, including slow failed writes. Revocation during storage waits rejects the learner request.

The existing private lesson-media bucket and snapshot schema marker are reused; no public bucket, additional database, binding or migration is introduced. Storage failures fall back to the established reader. Warming is optional after commit, so its failure cannot turn a successful publication into an apparent failure or change retry behaviour.

One stable object per deployment namespace replaces previous publications. A pinned historical reader may replace it with that older head; a later current reader safely rebuilds its own version. This can cause extra rebuilds while historical heads are used, but never mixes heads. The source is capped at 10,000 rows / 4 MiB; larger sources and the existing 1,001-row list boundary use the original reader to preserve behaviour.

## Local verification

- V107.72 integration: all 118 backend regression files passed across the full run and targeted rerun. One new optimisation fixture was updated to confirm V107.71's required external marks moderation before entering a mark; the application's gate remains intact. The other 117 files passed in the full run, and all eight cases in the corrected fixture passed on rerun. Current release/version checks and the actual local split Workers/D1/R2 runtime passed. API, private coordinator and matching website builds passed; the dependency boundary covers 140 modules.
- All 113 Academy regression files passed. The affected settings/assessment tests were rerun after the final review.
- Actual local Workers runtime passed with two D1 bindings, private Durable Object RPC and R2, including whole-register save/release/publication and repeated learner list/detail requests using the shared source.
- Cached and original learner responses match. Coverage includes separate learners, private and explicitly released zero marks, live collection closure, unpublished Admin renames, publication changes, pinned heads, denied scope, role changes, session revocation during both storage reads and writes, time-based paper opening and release withdrawal.
- Local D1 query-cost tests passed. Warm assessment reads skip the definition-producing joins and restrict live reads to the learner's assessment IDs.
- The Academy dependency boundary passed. API and private coordinator bundles passed local dry runs; nothing was uploaded.

Original local run logs and bundles are in `outputs/academy-read-optimisation-2-20261026/`. V107.72 integration, build and deployment evidence is in `outputs/academy-read-optimisation-10772/`. Hosted savings have not been measured for this follow-up. Any later usage comparison should use bounded analytics windows that account for development/testing traffic, D1 reads and R2 operations.

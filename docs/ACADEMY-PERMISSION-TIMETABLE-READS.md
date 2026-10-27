# V107.84 — Permission and timetable/calendar read optimisation

The user authorised deployment of the tested work as V107.84 from feature/academy-permission-timetable-reads. It incorporates deployed V107.83 (3a67676d7949d316ea8a41369ab77acede753b01) and local optimisation commit b2ac731a.

**Keep live checks small to limit database usage.** Implementation used saved analytics and disposable local fixtures, with no hosted database queries or live data corrections. Release verification is limited to management deployment metadata, one API readiness request and static/version checks.

## Changes

- The private split coordinator retains at most 128 previously verified reader proofs. A key includes the exact account, session, credential epoch and permission signature. Reuse still reads the live database version, account/session/PIN state, session expiry and current timed substitute grants before and after loading data. Any Core change forces a full authority comparison. A failed read discards its hint; eviction/restart causes a full verification. Caller-supplied versions cannot establish verification.
- Write admission and atomic write guards remain unchanged. Every coordinated owner write still rebuilds current authority under the Core fence.
- Generated accepted timetable/calendar projections carry their pinned publication head and required table names to the private coordinator. It selects the matching component references using existing indexes and captures only those component IDs from both stores, preserving the existing owner merge and live overlays.
- Explicit history/component queries, invalid or absent scope hints, unusually large mixed-head batches, non-split databases and older coordinators use the original unrestricted path. Private drafts, hidden/disabled content, current cancellations, publication pointers and date-based access retain their existing checks.

The application screens and response data are unchanged. This does not add a time-to-live cache for permission acceptance, timetable responses or calendar responses.

## Local measurements

Run **node tools/academy-read-benchmark.mjs** from backend/. It creates synthetic data and measures local Miniflare D1 rows_read counters. The baseline uses the original full proof at each read and the original unrestricted component capture. No production data is imported.

| Scenario | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Ten unchanged permission-protected reads by a synthetic Global Admin | 120 rows | 93 rows | 22.50% |
| Published timetable/calendar facts for two areas across 13 synthetic publication heads | 10,663 rows | 349 rows | 96.73% |

Both comparisons returned identical data and wrote zero database rows during measurement. Ten unchanged reads rebuilt the role/subscription proof once instead of ten times. The publication comparison captured nine required components/references instead of 585; it added one small indexed selection query (ten queries rather than nine).

These are bounded local measurements, not production savings or a daily allowance forecast. Permission savings depend on the frequency of intervening writes and coordinator restarts. Publication savings depend on retained history and the tables requested. Broad Admin management datasets and repeated Class Notes rights expressions remain separate potential follow-ups.

## Validation

- Complete local backend regression: 130/130 test files passed.
- Final targeted permission, snapshot, timetable/calendar and owner-transaction tests: 66/66 passed after the scope fallback refinements.
- Expanded actual Workers runtime test builds the API and coordinator, imports synthetic history into local D1 and exercises accepted Admin projections over private Durable Object RPC, including repeated planner requests.
- Security coverage includes forged verification versions/signatures; actor/session separation; session revocation, disabled accounts, PIN removal and credential changes; scoped roles, subscriptions and lifecycle changes; clock-only session expiry and substitute activation/expiry; revocation after capture; bounded-cache eviction/restart; unchanged write admission and recovery.
- Publication differential tests include current and historical pinned heads, mixed-head batches, live disables, unpublished names, owner-local setting counters, explicit/quoted history reads, invalid hints and the non-split fallback.

## Authorised release

No database migration, backfill, republishing or configuration change is required. Deploy the private coordinator before the matching API and website through the existing release workflow. Older coordinators safely ignore the optional read scope and use the unrestricted path during rollout. Keep live verification to small release/readiness checks; do not run this synthetic benchmark against hosted databases. Future deployments require fresh user authorisation.

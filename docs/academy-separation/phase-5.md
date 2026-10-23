# Phase 5 execution record — inactive fresh database preparation

23 October 2026; source branch `feature-split-db`, V107.29. **Phase 5 is in progress, not complete.** This checkpoint creates and verifies the selected inactive copies. It does not claim that cross-store writes or publication recovery have passed.

## Phase 4 checkpoint

The complete UI is deployed at V107.28 on Development and the existing feature preview. The source checkpoint is `8904ec2e9b4014f0f60ca1eddd0888fca5c67161`, tagged `academy-ui-separation-v107.28`. The Development Worker version is `422f6863-6e31-45f1-af43-6fdf3b5e9c77`; the feature Worker version is `d3164187-7ddc-44a8-ab38-4c15092e2b8c`. See the [UI checkpoint](ui-development-checkpoint.md).

Layouts, ordinary Student/Teacher projections and direct manual Admin assessment controls remain as reviewed. No manual exception subsystem is added.

## Fresh target preparation

| Target | D1 ID | Tables | Rows | State |
| --- | --- | ---: | ---: | --- |
| dev-academy-core | 1c8aece3-dc1d-40d1-8a82-01ab4f63336f | 107 | 1,964 | PREPARING; not an app writer |
| dev-academy-admin | fe85dac1-b1f0-4079-9127-2e36089aa385 | 58 | 820 | Inactive authoring preparation |

Both targets have exact per-table row-hash matches against their rehearsed artifacts, zero foreign-key errors and successful private SQLite restoration/integrity checks. Counts include technical reference/acceptance records. They are not counts of unique business records across both stores. [Copy register](phase-5-copy-register.csv).

The copy comes from the verified V107.28 source snapshot, SHA-256 `3ed73804e35f1d0c8b1bacd0a10e3b868644a38bbc30e11aa063a89716e6ac12`. It selects 74 active accounts, 14 active Program/Course areas and one active Course delivery. Nine required timetable publications are selected from 23 source publications. Current source changes must be reconciled before any future writer switch.

Selection excludes archived/inactive business records and inactive identities/credentials. Current disable policies remain in force: an `active=0` memorisation setting or session control is a current denial, not discarded baggage. Minimal opaque historical recorder IDs preserve active records without importing inactive accounts. Current role/subscription outcomes are materialised from verified source authority, preserving explicit versus historically mapped grant origin and Hifz semantics. Teacher designation, roster membership and import labels create no extra authority.

Core retains 303 original retry outcomes once, with their original actor, payload hash and result. Admin receives no copied outcome ledger. Historical accepted heads/components are retained only when selected active work cites them; exact immutable evidence is preserved rather than rewritten. The current live dataset needs no additional historical head chain. R2 objects and the separate Open Library store are untouched.

The new schemas omit old import/activation ledgers, source mapping tables, legacy access evidence, old attendance and retired discussion tables. Compatibility query shapes are computed or empty; they have no old database connection and reject retired writes. Core holds accepted reference caches; Admin holds the selected editable source preparation. This inactive overlap is not permission for dual editing. Final field-aware owner routing is still required before activation.

## Verification performed

- All 74 selected account credentials, roles, subscriptions and contexts match the original repository projection; Hifz role/active projection is identical. Private credential hashes stay in Core.
- Synthetic checks cover private draft isolation, current disable facts, inactive identity/delivery exclusion, original retry preservation, exact active-work head references and large Unicode/frozen-data SQL round trips. The read-federation rehearsal sanitises credential proof and rejects writes, including mutations prefixed by `WITH`. It is not wired as a production write adapter or a cross-store authorisation transaction.
- The hosted import initially rejected the historical insertion order because assessments were rebuilt after their recipients in the old schema. It rolled back completely. The corrected exporter proves immediate foreign-key insertion order locally, enforces the D1 statement-size limit and reassembles large values without modifying their bytes. Hosted readback then matched every row hash.
- A successful import acknowledgement containing CLI progress text was recovered by reading the nonempty target. The importer does not overwrite or blindly replay a nonempty database. Its input/config safety checks permit only the two exact new database IDs.
- A new read-only recovery snapshot after copying matches all 135 original source tables, including all 4,365 rows, exactly. No source table changed.
- The full regression run initially passed 90 of 92 files. One existing configuration assertion omitted the three authorised Phase 4 feature flags and was corrected. The Hifz runtime check required a local listener outside the sandbox and passed separately. The final complete regression passed all 93 test files, including the local Workers runtime check. The feature Worker bundle dry run passed; it was not deployed.

Private source/target snapshots, SQL, hashes, import diagnostics and readbacks are stored outside Git/public assets in `work/Academy-private-recovery/phase-5-20261023/`. The schema generator and copy/verification tools are committed; record values are not.

## Remaining before Phase 5 completion

1. Implement field-aware owner routing for each coherent Admin family, keeping identity, permissions, memberships, plans, attendance, progress, files and assessment workflow in Core. Remove remaining writes to obsolete import/ownership tables from fresh-generation paths. Separate local counters and audits; do not make copied Core reference caches a second editable Admin master.
2. Implement durable admission/retry/recovery for mixed operations and accepted publication. Recheck current Core permission at admission/commit, preserve owner-local outcomes, copy exact frozen components, and activate one complete Core head. Rehearse partial/unknown acknowledgements, concurrent revocation, a failed PDF-cap check and safe recovery without a permanent writer fence or orphan file deletion. A D1 transaction cannot span databases.
3. Verify the complete hosted workflow and browser role matrix, current file/byte permissions, new identity/reference creation, exact retries and measured combined query cost under the invocation limit. The local read-federation rehearsal alone does not satisfy these checks.
4. Configure a genuinely isolated split Worker/API and compatible Pages build only after those checks pass. `feature-split-db` currently fails its Pages build deliberately before artifact generation, preventing the generic branch fallback from silently publishing against Development. There is no split preview release yet. The data-only Wrangler config has no Worker entrypoint or routes.

The user's Phase 4 review hold applies to merging Phase 5 into `feature-admin` and switching current Development routing. It does not replace the outstanding engineering checks above. Keep `development`, `feature-admin`, the two existing Worker deployments and the original database at the verified Phase 4 checkpoint while preparing the split. Do not delete the original database; its eventual retirement is a later reviewed action.

## Recovery and next activation

The original database remains the sole live owner. The fresh databases contain no subsequent app writes, so an unsuccessful preparation is inspected/rebuilt only under an explicit target-only plan; there is no automatic fallback or cleanup. Before a real switch, capture a fresh source snapshot, drain/fence the old writers, reconcile the final active selection, repeat exact validation and preserve both sides' recovery copies. After new target writes are admitted, an old deployment must never be pointed at a stale original copy without reconciliation.

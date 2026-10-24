# Phase 5 — separate Core and Admin Development

24 October 2026: the user explicitly authorised deploying the reviewed feature release to Development and switching Development to the fresh Core/Admin stores. V107.38 implements that cutover. Its completion is attested only after live verification by `academy-development-split-v107.38`; the earlier preview-only limits below are historical.

## Prior preview checkpoint

23 October 2026, V107.31 on `feature-admin`, following the user's completed Phase 4 review and explicit preview promotion instruction. Owner routing, recovery and the isolated split API were implemented and verified at V107.30 on `feature-split-db`. This release promotes the same prepared stores to the Admin feature preview. Current Development remains on Phase 4 V107.28 and its original database; a Phase 5 Development cutover is not authorised. The old database must not be deleted.

## Released UI checkpoint

The released Phase 4 checkpoint is V107.28, commit `8904ec2e9b4014f0f60ca1eddd0888fca5c67161`, tag `academy-ui-separation-v107.28`. Development still uses Worker `422f6863-6e31-45f1-af43-6fdf3b5e9c77`; the pre-promotion feature default was `d3164187-7ddc-44a8-ab38-4c15092e2b8c`. [UI checkpoint](ui-development-checkpoint.md).

The current layouts, Student and Teacher audience projections and direct manual Admin assessment controls are retained. There are no new case entities, replacement lanes, automatic result holds or manual-exception workflows.

## Fresh stores and selection

| Target | D1 ID | Tables | Initial copied rows | Use |
| --- | --- | ---: | ---: | --- |
| dev-academy-core | 1c8aece3-dc1d-40d1-8a82-01ab4f63336f | 112 | 1,965 | Isolated preview Core |
| dev-academy-admin | fe85dac1-b1f0-4079-9127-2e36089aa385 | 51 | 527 | Isolated preview Admin |

Counts include stable references, immutable accepted projections and technical controls; they are not distinct-person/business totals. The hosted recovery proof adds two reusable Core transaction guards and one Admin guard, with no test business records, open fence or retained command payload. See the [copy register](phase-5-copy-register.csv) and [actual field ownership](runtime-field-ownership.csv).

The source is the verified V107.28 snapshot, SHA-256 `3ed73804e35f1d0c8b1bacd0a10e3b868644a38bbc30e11aa063a89716e6ac12`. Selection contains 74 active accounts, 14 active areas, one active Course delivery and nine required timetable publications from 23. Inactive/archived identities and business rows are excluded. Current deny settings remain: `active=0` on a current owner's access/control row is an effective denial, not disposable history.

Minimal opaque recorder IDs preserve selected work without copying inactive accounts. Current roles/subscriptions retain explicit versus historically mapped grant origin; all 74 account projections and Hifz authority match the source. Core alone holds credentials, sessions and authoritative roles. Original retry evidence is retained once in Core (303 outcomes). Historical immutable heads are retained only where selected work cites them; the current live source needs no extra historical chain.

Old import/activation/mapping ledgers, legacy evidence tables, old attendance and retired discussion tables are absent. Compatibility query shapes are computed from canonical grants or empty, never connected to the old database, and reject retired writes. Existing R2 homes and shared Open Library metadata stay in place.

## Runtime ownership and commit boundary

Admin owns editable definitions and private drafts. Core owns accounts/access, current memberships and assignments, attendance, learner/Teacher work, assessment files and workflow/release facts, current lifecycle/deny controls and operational timetable publications. Mixed rows are split by column. Core stable references for new unpublished definitions contain keys/necessary references/current facts, with nullable definition values; private draft titles, timing and editor JSON are not copied into them. Accepted frozen components provide the read model. Publication updates the complete Core head atomically and preserves current denials and older pinned readers.

Owner-local receipts, counters and audit evidence remain local. Reads combine counters and original retry evidence without cloning a success ledger. Success receipts/audits for a mixed save are finalised only after Core commits. Core publication envelopes/components cross only as exact frozen reviewed content. Accepted media associations change with their head, and draft definition deletions preserve Core anchors required by accepted work/history.

A private SQLite Durable Object in `academy_split_coordinator` coordinates only cross-store saves and coherent private reads for this Academy generation. Ordinary Core work stays on D1. Durable journals in the two stores record admission, owner changes, reverse operations and completion. A Core fence prevents acknowledged permission/work changes from passing a pending mixed transaction. Scoped guards run under that fence; the Core transaction checks the current session/credential and real expiry again. Private reads check current authority and the Core mutation epoch before and after capture. A rejected commit reverses the Admin changes; unknown acknowledgements recover from committed state. Failed/complete private payloads are pruned. This is storage recovery, not an assessment business workflow, and it adds no third Records database.

Core-only writers are protected by the same fence and an epoch comparison for coherent counter reads. New identities/assessment files supply validated ID-only Admin references. Fresh-generation paths no longer write retired ownership/import tables.

## Verification

- Exact hosted counts and row hashes matched both prepared artifacts before activation. Both hosted snapshots restore with integrity `ok` and zero foreign-key errors. After the hosted write/rollback/revocation proof, every copied business table still matches exactly; only reusable technical guards/epoch changed. There are no pending commands, fences or private recovery payloads.
- Synthetic tests cover inactive selection, current deny policies, original retry outcomes, exact required head ancestry, large Unicode and frozen-byte SQL round trips, field ownership, nullable draft anchors, local counters and safe SQL bindings/quoted literals.
- Recovery tests interrupt admission, planning, Admin application and Core completion, then recover in a new coordinator. They cover compensation after rejection, lost acknowledgements, fenced Core writes and revocation during private reads.
- HTTP tests cover actual sign-in and workspace roles, scoped Admin access, frozen publication/pinned reads/retry, private media and Teacher curation denial, six-week untimed assignments, direct manual answer upload/check/mark/finalise/explicit release, and Program timetable publication. The tested RPCs stay within the account's Free-plan 50-query limit (maximum write 49; private read 39). Bulk rows are grouped rather than producing one D1 write per row.
- The actual local Workers runtime exercises two D1 bindings and private Durable Object RPC through media creation and accepted publication. Hosted Cloudflare checks prove owner save, rejected-commit rollback and revoked-session denial. The temporary protected verifier is removed. The API readiness gate was checked before activation and health now reports V107.30 / `SPLIT_V1`.
- The final complete regression passed all 97 test files. The split Pages artifact build and current release-integrity checks passed. No layout CSS or product workflow is redesigned.
- A final read-only original-source snapshot still contains all 135 tables. It has 4,366 rows versus 4,365 at copy time: one normal sign-in session was added and `accounts.last_login_at` advanced. No original session disappeared; no other table changed. Original credentials, roles and business work remain intact. Reconcile these normal source changes before any later promotion/cutover.

Private exports, SQL, diagnostics and verification snapshots are outside Git/public assets in `work/Academy-private-recovery/phase-5-20261023/`. No credential hash, session/token value, personal row or recovery payload is published in these documents.

## Original isolated release — V107.30

- Website: <https://feature-split-db.academy-maktab4life.pages.dev/academy/>
- API version URL: <https://split-db-feature_worker.maktab4life.workers.dev/>, version `43efe991-10e0-4f82-9882-4c137caaeb5d`.
- Private coordinator: `academy_split_coordinator`, version `9f9a6cfe-268f-4e24-bccd-c21c5f4fe6c7`.

At the V107.30 isolated release, the split API was an uploaded version of `feature_worker`, with its encrypted secrets inherited in place and no default traffic. The feature default and Development were still V107.28 then. Its separate entrypoint has no cron. The split Pages target selects only the separate API and cannot silently fall back to Development.

For isolation, this preview disables Hifz outbound/handoff and shared Open Library/My links writes; their existing reads and stores remain. New uploaded objects have explicit `dev-split-v1/` keys stored in their new database records. Physical deletes are suppressed in this preview, preserving original bytes and uncertain uploads. These preview holds remain in V107.31. Restore shared-service writes deliberately during a separately authorised Development cutover, after reconciling preview work and the current source.

## Admin feature preview promotion — V107.31

The user reviewed Phase 4 and requested Phase 4 on Development followed by Phase 5 on the Admin feature branch. Read-only live checks confirmed that the complete Phase 4 website and API were already live at V107.28. No new Development deployment is required for this instruction.

`feature-admin` incorporates `feature-split-db` and selects `academy-split-runtime.js` for the default `feature_worker`. Its Pages config continues to call that Worker. The CORS allowlist admits both exact preview aliases and immutable Pages hosts; it rejects Development and unrelated hosts. Preview URLs stay enabled so the original V107.30 split URL remains usable. Authentication secrets are inherited encrypted in place. The private coordinator code is unchanged and is not redeployed.

- Website: <https://feature-admin.academy-maktab4life.pages.dev/academy/>
- API: <https://feature_worker.maktab4life.workers.dev/>
- Stores: the same READY `dev-academy-core` and `dev-academy-admin` already used by the isolated preview. No reset, reimport or duplicate copy is part of promotion.
- Recovery: fresh read-only snapshots of both preview stores and the original Development source are taken before promotion, with integrity/foreign-key verification. Target business data and journal readiness are checked before admission. Private exports remain outside Git and public assets.
- Release verification: configuration/CORS, release markers, role/workflow/recovery regression, Worker dry run, Pages packaging, live health/config checks and desktop/mobile browser checks. The final deployed version and commit are attested by `academy-feature-admin-split-v107.31` after verification.

## Later Development cutover

1. Obtain separate authorisation to move Phase 5 into current Development. Snapshot both sides, fence/drain original writers and reconcile final active source changes with preview work. Do not blindly overwrite READY targets.
2. Verify exact authority, rows, references, accepted heads, retry outcomes and files again. Deliberately restore the approved shared-service configuration before full Development use.
3. Switch the matching Development website/API together and verify the complete role/file/recovery matrix. Never fall back to a stale source after admitting new target work.
4. Retain the original database and recovery copies until separately reviewed retirement. Deletion is not part of the preview promotion.


## Development cutover — V107.38

User authorisation: “deploy to develop and swtich the dev db to the new core and admin”. Development uses dev-academy-core (1c8aece3-dc1d-40d1-8a82-01ab4f63336f) and dev-academy-admin (fe85dac1-b1f0-4079-9127-2e36089aa385), with the same generation and private coordinator. The existing ProgramTimetableCoordinator class, its object name, R2 buckets and encrypted bindings are retained. The original encrypted-key provisioning record confirms that the feature keys were copied from Development; no live diagnostic endpoint is added for this cutover.

The original source changed only sign-in state after the copy: two new sessions, one revoked session and a last-login timestamp. The offline reconciliation rehearsal adds the two current sessions and carries the revocation; the target's newer last-login value already wins. No current credential, role, learner work, accepted head, private draft or retry history is replaced. Final application uses fresh quiesced snapshots and a Core mutation-epoch guard; readback must match the rehearsed manifest before admission.

Pause Development and feature API writes, close the original migration activation gate and the target readiness gate, drain the coordinator and take final recoverable snapshots. Retain maktab-academy with its run in VERIFIED rather than CUTOVER, so old application versions cannot start new work on it. Do not delete or blindly reload either READY target. The new Development API stays paused until the matching Development website is published and the reconciled stores verify. Reopen only the new stores and restore the unchanged feature release after activation.

The Development runtime restores Hifz handoff/profile delivery, shared Open Library curation, private My links and the 15-minute recovery schedule. Actorless scheduled cache recovery touches only Core-owned refresh markers and retains Core's write fence. Newly uploaded files continue under dev-split-v1/ and retain normal cleanup. Original file bytes remain protected from physical deletion while the former database is retained.

Feature-admin remains its reviewed V107.37 preview, now sharing the new Development stores. Preview edits therefore affect Development data; its existing Hifz/shared-write holds remain. A future isolated preview database requires a separate copy. After any new-store work is admitted, recovery must preserve that work and retain the new bindings; reverting to the old database is not a routine code rollback.

Validation includes all 99 regression files, current configuration/storage identity checks, scheduled refresh without an Admin actor and its outstanding-fence denial, both builds, private source/target integrity and reference checks, storage readback, exact session reconciliation and final website/API checks. Private snapshots and verification evidence stay outside Git and public assets in the Development cutover recovery directory. The retained annotated tag records actual deployment versions, source and evidence digests.

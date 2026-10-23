# Phase 5 — separate Core and Admin preview

23 October 2026, `feature-split-db`, V107.30. Owner routing, recovery and the isolated split API are implemented and verified. The Pages preview is the release target. Promotion into `feature-admin` and current Development remains held for the user's Phase 4 review. The old database remains in service and must not be deleted.

## Released UI checkpoint

Development and the existing feature preview stay at V107.28, commit `8904ec2e9b4014f0f60ca1eddd0888fca5c67161`, tag `academy-ui-separation-v107.28`. The existing Development Worker is `422f6863-6e31-45f1-af43-6fdf3b5e9c77`; the existing feature default is `d3164187-7ddc-44a8-ab38-4c15092e2b8c`. [UI checkpoint](ui-development-checkpoint.md).

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

## Isolated release and hold

- Website: <https://feature-split-db.academy-maktab4life.pages.dev/academy/>
- API version URL: <https://split-db-feature_worker.maktab4life.workers.dev/>, version `43efe991-10e0-4f82-9882-4c137caaeb5d`.
- Private coordinator: `academy_split_coordinator`, version `9f9a6cfe-268f-4e24-bccd-c21c5f4fe6c7`.

The split API is an uploaded version of `feature_worker`, with its existing encrypted secrets inherited in place. It receives no default traffic; the existing feature default and Development Worker remain V107.28 against the original database. Its separate entrypoint has no cron. The split Pages target selects only the separate API and cannot silently fall back to Development.

For isolation, this preview disables Hifz outbound/handoff and shared Open Library/My links writes; their existing reads and stores remain. New uploaded objects have explicit `dev-split-v1/` keys stored in their new database records. Physical deletes are suppressed in this preview, preserving original bytes and uncertain uploads. Promotion must restore the approved shared-service configuration deliberately, after reconciling preview work and the current source.

## Promotion after Phase 4 review

1. Obtain the user's Phase 4 review/promotion instruction; keep current Development and `feature-admin` held until then.
2. Snapshot both sides, fence/drain original writers, select/reconcile final active source changes and any preview work. Verify exact authority, rows, references, accepted heads, retry outcomes and files again. Do not blindly overwrite a target after preview writes.
3. Integrate into `feature-admin` with its matching split API/Pages configuration and intentional shared-service settings. Verify the complete role/file/recovery matrix before the later Development cutover.
4. Keep original database/recovery copies until a separately reviewed retirement. Never fall back to a stale source once target work has been admitted.

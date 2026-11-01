# Academy note retention — local feature, 1 November 2026

Based on deployed V109.2 / 6a1399da. Implementation is local on feature/academy-note-retention. Nothing has been deployed, sent to real classes, migrated remotely or deleted from hosted storage. The owner confirmed a seven-day PDF warning and clarified Academy only. Studio frontend changes explored during discovery were completely restored; its worktree is clean.

## Behaviour

Global Admin's existing App settings form controls retention (default three calendar months, allowed 1–120) and PDF warning lead time (default seven days, allowed 1–90 and shorter than the retention period). Existing management guards recheck the current account/session/Global Admin authority atomically; scoped Admin and learner requests cannot edit this policy. A stale form is rejected and an exact uncertain-save retry is idempotent.

Class Notes age from original `class_notes.created_at`. Teacher PDF notes age from original `lesson_note_entries.created_at`, the first upload; replacement versions and recurring occurrences do not restart the clock. Official session PDFs age from their asset upload/creation timestamp. Calendar arithmetic uses the original UTC timestamps and clamps month ends. Class Note due dates are reminders, independent of retention. Recurring PDFs expire as one resource after their original upload period, rather than gaining another period for every occurrence.

Existing overdue content receives the initial grace period. Every affected PDF gets one shared class inbox notice at least seven days before deletion, asking current class learners to download a copy through the existing protected reader. No email/push provider, per-learner delivery job or recipient fan-out is added. Read/archive receipts are created only when a learner interacts. Current membership/roles still gate the notice and current file permissions still gate downloads. A shared warning is posted to the original class even when it currently has no learners, with the same full grace period and zero recipient fan-out. A PDF without any recoverable class scope is held for mapping rather than deleted without a scoped notice. Extending retention postpones expiry and resets a distant warning so the class receives one fresh warning for the revised deletion date; shortening settings cannot truncate an already announced download window. Deletion removes the obsolete warning and its sparse receipts.

Academy students can mark a dashboard Class Note complete or incomplete. These marks are account-scoped browser localStorage entries containing note/activity/version IDs, with no completion API or DB writes. They survive sign-out/reload on the same browser; clearing browser data removes them, and devices do not synchronise. A changed note version becomes pending again. Teach/Admin-Learn cannot create student completion marks.

## Scope and deletion boundary

- Only Academy Class Notes, Teacher PDF notes and official SESSION PDF attachments are eligible. Frozen/Studio-owned offerings are excluded during discovery, due processing and atomic warning/deletion guards. Studio databases, buckets, pages and dashboards are unchanged.
- Separate MP4, recording companion, journal, assessment, Course resource and general Library retention are unchanged. An official asset also linked as permanent COURSE media is held. Library/recovery objects outside the current private lesson-PDF prefixes are not collected.
- Expiry physically removes current Class Note bodies/versions and Teacher PDF version/entry rows, not merely their visibility. Scheduled narrow guards allow these deletes; ordinary immutable-history protection remains in force.
- Official accepted setup snapshots and Admin definitions retain attachment metadata/file pointers. A durable Core tombstone filters old pinned snapshots, Admin readers, downloads and publication/upload limits. The PDF byte collector removes an unreferenced current-namespace PDF after its last live reference expires. Other lessons, Studio-owned Source references and permanent Course references keep shared bytes. Shared bytes are conservatively retained by checksum.
- Minimal IDs, context/provenance, existing audit/retry evidence and retention tombstones remain. Historical accepted metadata, protected recovery copies, provider backups and copies already downloaded to devices are not erased. This is application retention, not a claim of deletion from every historical backup.
- Garbage collection and upload commits bind an object generation. A racing collection forces upload retry; a later identical upload uses a fresh storage generation. Replaying an old successful operation cannot reinsert the old note or restore its bytes; its historical receipt may still return the original identifiers, which current readers reject.

## Bounded maintenance and schema

A separate hourly `7 * * * *` trigger runs only this job when `ACADEMY_NOTE_RETENTION=1`. The existing minute, quarter-hour and Monday absentee schedules are unchanged. The future release adds a fourth Source trigger; check the account-wide trigger quota before deployment. Each run has a request-owned cap of 40 D1 binding calls plus at most five R2 deletes. It stops safely at the cap and resumes persisted work next hour. A batch counts as one binding call; individual statements still determine rows read/written ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)). Policy is read by the job and the Admin settings form, not on ordinary student pages. Each run keyset-scans at most 20 candidates per type using creation-time indexes and a persisted cursor, selects at most 20 due items using state/deadline indexes, retires at most 40 immutable versions (24 fresh / 16 resumed) in bounded chunks, and attempts at most five PDF collections. Up to four incomplete purges resume per run; their content is hidden and further edits blocked immediately. The separate budgets prevent long histories from starving fresh expiries. A policy extension cannot restore content whose deletion already began. Discovery cycles daily and restarts when policy revision changes. Blocked/shared objects are deferred so they do not starve other work.

Required for a future coordinated release:

1. `backend/migrations/academy-admin/0003_note_retention_indexes.sql` — two metadata indexes only.
2. `backend/migrations/academy-core/0021_note_retention.sql` — policy/defaults, tombstones, shared notice receipts, object queue, discovery cursors, indexes, split fences/epochs and narrow immutable-delete exceptions. Accepted PDF admission ignores expired pointers.
3. Deploy the matching split coordinator and Academy API source together with the reviewed Academy dashboard/settings JS/CSS and retained feature flag. Preserve the existing bindings/origins/verification policy. Assign the coordinated release version and update changed asset cache query strings there.

`backend/migrations/academy/0046_note_retention.sql` is the disposable monolithic-fixture equivalent; do not replay it against the live split stores. There is no R2 lifecycle rule: a bucket-wide TTL would be unsafe for shared files. Production schema/deployment approval remains separate from this local build.

## Validation and cost

The focused and related local regression command passes 68 tests, covering calendar boundaries, real split settings/notice paths, seven-day grace, immutable-content deletion, Studio/frozen exclusions, cross-offering and permanent-Course shared PDFs, Library-prefix protection, empty-class grace, upload races, long-history chunk/resume behaviour, permissions and device/account/version completion isolation. The local real-Worker messaging regression passes separately. Desktop/390px Academy-only browser checks use intercepted synthetic responses and verify settings save, completion/undo/reload, no completion request, and no horizontal overflow.

`backend/tools/academy-note-retention-cost.mjs` is a disposable workerd/D1/R2 rehearsal. For a class with 199 learners, one old Class Note and one old PDF:

| Phase | Statements | D1 rows read | D1 rows written |
| --- | ---: | ---: | ---: |
| Discovery / class warning | 29 | 65 | 34 |
| Delete both notes and collect one PDF | 50 | 150 | 66 |
| Idle hourly tick | 9 | 14 | 0 |

The warning creates zero per-learner receipt rows; these counts include the local split fence/epoch/index effects. No coordinator RPC was used in this fixture. Retention-only settings do not republish timetables or change the app time zone. The corresponding D1 binding-call counts are 24, 28 and 10. These are local Miniflare D1 metadata measurements, not hosted billing or a production/population-wide load guarantee; the bundled emulator supports 2026-09-28, while deployment compatibility remains unchanged. Official PDF resolution still uses the existing accepted-publication JSON reader after indexed, bounded candidate selection; its publication-envelope costs should be considered separately in independent review.

Three unrelated tests already fail on the unchanged V109.2 baseline: two Admin-inheritance query-budget assertions, and an older scheduler assertion expecting two recovery promises although the baseline already schedules companion cleanup as a third. They are recorded, not silently fixed or counted as passes. All feature checks are local; no hosted acceptance is claimed.

Evidence outside the source checkout: parent project `outputs/note-retention-20261101/{read-write-cost.json,browser-checks.json,admin-settings.png,student-completed-desktop.png,student-completed-mobile.png}`. Re-run the cost tool from the feature checkout with a desired output path.

## Integration overlap

The dedicated lesson editor owns `Academy-academic-lesson-corrections`. Compose tested commits; do not replace either worktree. Both touch `lesson-media.js`: this feature adds the retention import, PDF visibility/download filters, and guarded PDF upload storage generation. Preserve the editor's recorded-context/sessionDate/context-options/context-save/publication work, original recording upload anchor and existing permission checks. The feature also changes the publication PDF-count helper/caller and `setup-reader.js` expiry projection. No recording date correction may reset note/PDF age. This feature is explicitly excluded from the separate narrow V109.3 navigation correction; integrate it only after the requested independent review in a later authorised update.

# Academy review fixes V106.60

The fixes are implemented on `feature/academy-review-fixes-10660`. The feature preview has a separate database, storage bucket and Worker with 12 synthetic accounts. Development remains on V106.59. The preview requires no changes to live Academy data or schema.

## Account changes

The alternate `/api/academy/d1/accounts/update` and `/reset-pin` routes return `410 ACCOUNT_WRITE_RETIRED`. Account edits and resets use User profiles. Local acceptance tools use that same supported API. PIN resets revoke sessions, own resets require another Global Admin, and the resulting database state must retain an active Global Admin.

## Independent management saves

Management transactions compare versions for their learning areas and shared dependencies, including calendars, teaching schedules and teacher eligibility. Profile changes guard the affected accounts and credential epochs. Course workflow revisions use the Course counter rather than unrelated Academy writes. Version counters and pending refresh work share one settings statement to retain the Free-plan statement budget.

The legacy global epoch is still advanced for compatibility with specialised assessment, progress and lesson-media transactions. Those specialised transactions retain their existing conservative guards. The shared management save path no longer uses that epoch as its conflict condition.

## Profile labels across browsers

A confirmed name edit records pending profile-label publication in the same transaction. An anonymous R2 marker contains only its revision. Academy checks it on opening or returning to the page, throttled to once per minute; a changed marker invalidates cached labels. Activity tools retain their drafts while lesson labels refresh. An unchanged marker does not reload the timetable. Marker checks perform no D1 reads.

## Public timetable updates

Published Course changes, cancellation, Program timetable publication and calendar changes record pending public refresh work atomically. A separate browser request publishes the new R2 snapshot. A recovery trigger runs every 15 minutes if the browser closes or refresh fails. Leases, generation checks and conditional R2 writes protect concurrent refreshes. Failures retain pending work with backoff; D1 quota exhaustion pauses recovery in R2 until the next UTC day. Manual refresh also acknowledges pending work. Public snapshots retain their privacy whitelist and joining remains checked at click time.

## Homepage reads

Classes, Program subjects and modules are filtered by learning-area keys in SQL using the existing indexes. Public previews load class destinations only for free joining. Existing curriculum navigation remains available; moving the complete curriculum to on-demand loading remains optional follow-up work.

## Verification and deployment

All 153 regression files pass locally, including concurrency, scale, privacy, retry and Free-plan statement-budget checks. Eight local browser checks pass across isolated admin and learner sessions at phone and desktop widths. The preview package round-trips its SQL locally before upload. It contains 491 data rows and no live account records. Deployment verification uses static assets and the preview health route, which performs no D1 reads; no hosted regression or load suite is run.

Use `backend/tools/academy-feature-preview.mjs` to generate private deployment files outside the repository. The tool rejects the live Academy database ID and storage bucket. Its generated credentials and SQL must remain private and must never be committed.

Preview initialisation consumed 1,041 D1 rows read and 1,894 rows written, including schema/index work. No hosted regression or load tests were run.

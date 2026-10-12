# Assessment build progress

Specification: [ASSESSMENT-SPEC.md](ASSESSMENT-SPEC.md).

| Stage | Deliverable | Status | Validation |
|---|---|---|---|
| 1 | Screens, navigation and process help | Complete | Real Chrome desktop/mobile walkthrough and same-Program Close pass |
| 2 | D1 records, permissions and private R2 | Complete | Native D1 permission, transaction, checksum and orphan cleanup tests pass |
| 3 | Schedules, papers, moderation and timed release | Complete | Return/revise/approve, atomic batch release and exact 03:00 boundary pass |
| 4 | Student submissions and authorised replacements | Complete | Failures, exact retries, ownership and retained versions pass |
| 5 | Marking and moderation | Complete | Examiner ownership, self-moderation rejection, stale revisions and held results pass |
| 6 | Independent release controls | Complete | Whole-class readiness and selected feedback/script privacy pass |
| 7 | Arabic reports and uploaded templates | Complete | PNG/PDF backgrounds, saved design, private issuance and four-page Arabic export pass |
| 8 | Acceptance and feature handoff | Complete | 141/141 regression files, ten assessment cases, browser, R2 simulator, bundle and version checks pass; delivered as V106.27 |

## Decisions and observations

- Starting checkout is clean at b77286d (V106.26). Existing Assessment buttons are placeholders.
- Reuse current Academy page/role patterns; add dedicated assessment endpoints and a private ASSESSMENT_BUCKET binding.
- Scope all downloads through authenticated endpoints; no public R2 URLs or transferable query-string bearer tokens.
- Resubmissions invalidate only the affected learner's obsolete releases; other learners keep already released results. Corrected marks return through the whole-class marks release action.
- Report templates use explicit field placement, rather than inferring fields from uploaded artwork.

## Evidence log

- Initial inspection: repository clean; current navigation, session, guarded D1 transaction and native SQLite test-fixture patterns reviewed.

- Stage 2–6: nine assessment API tests pass against the native D1 fixture, including concurrent moderation and database rollback.
- Browser walkthrough reached Arabic report issuance and student results on a 390 px screen. It exposed direct-link Close returning to home; corrected to the same Program page and rerunning acceptance.

- Stage 1/7: complete real Chrome acceptance, including PNG/PDF design uploads, multi-page report and a delayed admin response after account replacement. No browser exceptions; no mobile page overflow.
- PDF visual review: one-page export and last page of four-page Arabic report checked for joined Arabic text, RTL columns, pending result, subtotal and page numbering.
- Stage 8: 141/141 regression files pass. The only initial full-suite failure was an old configuration test assuming MEDIA_BUCKET was first in the binding list; changed it to check named bindings and distinct private development/production buckets.
- Actual local Workers/R2 smoke validates fixed-length PDF streaming and checksum rejection at the Worker’s configured compatibility date. Dry-run bundle and generated R2 binding types pass.
- Final remote/version/diff review and feature push remain. Production deployment and live migration are outside this build.

## Final handoff

V106.27 is the completed module for `feature/105.3.4.13`. The feature branch Git history is the delivery record. Remote branch was checked at b77286d immediately before this release; no intervening update was present. Release version consistency and final diff checks pass.

A tenth API case also verifies inherited Global Admin access and rejects scoped-admin, teacher and student changes outside their authority. Activation requirements and operational limits are recorded in [ACADEMY-ASSESSMENTS-106.27.md](ACADEMY-ASSESSMENTS-106.27.md). No live migration or Worker deployment was performed.

## V106.28 — Schedule review

- Owner is building the schedule; no timetable import. Requested header removal, shared Subject/Module choices, a timetable for learners/teachers and examiner editing of duration/total mark.
- Development V106.27 503 resolved separately by backing up D1 and applying only migration 0016. Eight assessment tables verified, authenticated endpoint returned 200, desktop/mobile screens passed and all 80 existing table row counts were preserved.
- V106.28: 141/141 regression files pass, including 12 assessment API cases. Real Chrome acceptance passes with the Academy selector, timetable, examiner upload, moderation, separate releases, report generation, session replacement and mobile layout. Development Worker dry-run bundle passes (1664.24 KiB / 335.77 KiB gzip). No migration is required.

## V106.29 — Phase-based scheduling

- Added Program/Course assessment phases and optional subject descriptors, including timetable/report display and explicit migration 0018.
- Existing entries remain unassigned and available; no schedule import or inferred phase.
- Paper status is None before PDF attachment. Both selectors match Assessment input height.
- 14 assessment API cases and Chrome workflow acceptance pass. Full regression: 141/141 files. Development Worker dry-run: 1667.28 KiB / 336.33 KiB gzip.

## V106.33 — Earlier schedule editing

- Earlier unpublished entries now show an explicit **Edit schedule** action instead of the misleading **Attach paper** label for admins. The existing saved form, permissions and backend save rules are reused.
- Moving the last earlier entry into a phase returns to the phase schedule, instead of an empty Earlier assessments view.
- Read-only live inspection confirmed four unpublished entries without papers or phase assignment, and zero submissions. No live data was changed.
- Validation: 16 assessment/API, Academy UI and version/routing checks passed, with the development Worker dry-run. Chrome acceptance passed, including editing an earlier entry on mobile, saving all schedule fields and its phase, returning to the phase, and the existing paper/moderation/submission/report workflow.
- Release authorised on 12 October 2026. Version markers and the assessment script cache advance to V106.33. No database migration or live schedule changes are required.

## V106.35 — Add dates to earlier schedules

- Fixed the remaining gap: Earlier assessments displayed existing dates without an Add form. Each earlier class/name timetable now offers **Add assessment date**, with its class and name retained and a blank subject/date.
- Additional dates create new unpublished entries without papers; existing entries are preserved. Retry protection uses the current D1 create service.
- Fixed the timetable's hidden heading escaping its scroll container on mobile.
- Validation: 16 affected checks and full Chrome assessment acceptance passed. The new form fits 320, 390 and 768 pixel screens, adds multiple dates, persists after refresh, and retries an interrupted creation without a duplicate. Existing edit/phase, moderation, submissions, marking, release, reports and session guards still pass. Development Worker dry-run passed.
- Development deployment is covered by the user's prior release authorisation and request to continue this correction. No migration or live assessment data correction is needed.

## V106.37 — Assessment Register, validation and session deletion

- Added the editable Assessment Register with multiple Programs/Courses, one class or All classes, manual status, filters and Open. Register names update shared session titles while preserving custom paper titles and existing dates.
- Added explicit **Add session → Validate → Change status** controls. Checks use actual schedules, moderation, publication, received submissions and mark releases; the server revalidates status changes atomically. Status labels never authorise release.
- Added confirmed session deletion. Deleted sessions leave the active schedule; audit and private R2 attachments are retained. Learner access, submissions and marks prevent deletion. Teacher/student deletion and stale writes are rejected; exact retries are safe.
- Expanded the info dialog to describe who acts, where, which action moves the workflow and the corresponding tracking labels.
- Migration 0020 groups earlier schedules into register rows and retains every existing assessment identifier and field. No dates, paper attachments, rosters or results are invented.
- Local validation: 10 register/validation/deletion API cases pass, including migration preservation, permissions, conflicts, rollback, revalidation after intervening changes and independent release controls. Chrome acceptance passes at 320, 390 and 768 pixels and through the paper, submission, marking, moderation, report and session-change flow. Full regression: 143/143 files passed. Development Worker dry-run: 1707.73 KiB / 345.56 KiB gzip. Applying migration 0020 to a private copy of the live backup preserved all nine existing sessions and all 94 pre-existing table counts, with no foreign-key errors.

- Development D1 was backed up before installing only migration 0020. Post-install comparison preserved all nine session IDs and every original field; all sessions are linked to their existing schedule name, deletion metadata is empty and foreign-key checks are clean. No assessment was published or deleted during release.

## V106.38 — Imtihaan group and distinct paper/results progress

- Corrected the Register terminology: Imtihaan is the group; assessments are its individually named papers. Renaming an Imtihaan preserves all paper titles and existing dates. New paper names start blank.
- Kept schedule confirmation as an admin-validated action. Later Imtihaan stages are derived from paper publication, the final Johannesburg exam day, approved marking and mark release. Staff see separate paper and results status columns; students do not see class-wide result stages.
- Rewrote the information dialog around the group, paper and result workflow. No D1 schema, R2 object or existing assessment record needs changing.
- D1 register tests and the full local Chrome desktop/mobile acceptance walkthrough pass. The source sheet's proposed manual Results transitions remain a separate design decision; see [release details](ACADEMY-IMTIHAAN-106.38.md).

## V106.39 — Human submission review and readiness

- Each latest learner PDF now needs an explicit teacher or admin confirmation that it is correct and legible. The reviewer must open that PDF first. The confirmation stores the reviewer and time against that submission version; an authorised replacement starts unchecked.
- A teacher or admin manually marks an assessment **Ready for Assessment** after checking every received latest PDF and confirming that no more submissions are expected. Missing learners remain visible and prompt a final acknowledgement. Marking waits for this step; a later answer or authorised replacement clears readiness.
- Omitted the automatic **Processing results** label. Imtihaan stays **Being assessed** until the moderated latest answers have their marks released, then becomes **Complete**.
- Additive migration `0021_assessment_submission_review.sql` adds review and readiness fields without rewriting older submissions. The D1 assessment tests, 143/143 backend regression files, and real Chrome assessment walkthrough pass; the PDF review dialog fits a 390-pixel screen. Release and live verification are recorded in [the V106.39 release note](ACADEMY-SUBMISSION-REVIEW-106.39.md).

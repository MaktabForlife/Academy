# Assessment table — V107.71

The user authorised implementation and Development deployment as V107.71 on 26 October 2026, superseding the investigation-only hold for this release. This release builds on committed V107.70 (`113d6e61`). Practice uploads and a camera scanner inside Academy remain deferred.

## UI

- Edit assessment name, subject/module, examiner, exam/assignment dates, timing, duration, allowance and total marks in Admin table rows. Examiners come from the Program/Course teacher list. Definitions lock after student availability/access or entered marks; operational controls remain available.
- Add separate Approve paper, Ready for assessment and Marks moderated checkboxes. Stage checkbox and detail changes for Save all.
- Show Open or Closed in small text below the submissions checkbox; remove the side label.
- Replace Admin's paper pencil with a link icon opening a PDF-only attachment dialog. Remove Review paper and the separate detail editor from existing rows. Rename Open assessment to Open PDF.
- Use a trash icon with an assessment/class-scope confirmation before deleting an unused assessment. Keep its audit history.
- Teach and Admin-Teach group the Imtihaan and its original shared papers across the currently authorised classes. No attachment/edit icon is shown in Teach. A partially authorised Teacher never receives another class's students or records.
- Reveal Review progress below the assessment row once its paper is available to students. Group students by class, with alphabetical names, access/submission timestamps, elapsed time and receipt state. Open submissions in PDF.js; confirm receipt only after reviewing the exact latest PDF for correct content and legibility.

## Workflow

- Publish papers publishes the current approved, unpublished set through one reviewed Imtihaan-level operation. Unapproved papers remain unpublished and can be published later with the same control. Original shared class selections are atomic. Papers still open only at their configured exam-day/student-availability cutoff.
- An authorised Program Admin may replace a released paper before that cutoff. Student access, submissions and entered marks continue to protect existing evidence. A replacement requires fresh approval/publication and clears the old external marks-moderation confirmation.
- The user explicitly clarified that Marks moderated confirms moderation outside Academy, before marks are entered. Enter marks stays hidden, and its API rejects entry, until Admin saves this confirmation. Transcribing the moderated marks does not clear the confirmation. Changing the paper/definition resets it.
- Enter marks retains the existing class-grouped alphabetical popup, zero/decimal marks, private saved results and exact retries. Admin-Teach can enter within its existing Admin authority after external moderation.
- Release marks is one action for the whole Imtihaan. Its preview checks all current records and moderation decisions. The confirmation states any missing marks; blanks stay pending and are never converted to zero. Results stay private until this explicit release succeeds.
- Receipt confirmation records existing submission checking facts and does not publish a paper, enter a mark or release a result. Student submission times are actual server acceptance times, and elapsed time is absent when either endpoint is missing.

## Learners

- Render the learner's cached assessment table on a return visit, then refresh in the background. A first visit needs its initial load. Keep caches isolated by signed-in session and context, omit Admin previews, and clear old identities when another account opens Learn. Preserve selected answers and open dialogs while refreshing.
- Hide View results until a result is released to that learner, including zero marks. Show the released mark in the assessment row.
- Open PDF uses PDF.js. A visible Print action invokes its native print service for the paper, with Download PDF retained.
- Add Need help creating a PDF? beside Upload answer PDF, with short iPhone Files/Notes and Android Files by Google scanning steps and official help links.
- Preview the chosen answer PDF locally, confirm that every page is present, legible and ordered, then explicitly Submit answers. Selected-file previews do not upload the answer.
- Show Answers received with assessment name and confirmed timestamp only after server acceptance. Uncertain responses use the same retry identifier; no duplicate submission is created.

## Database and access

No schema migration or live record correction is required. Use existing assessment definitions, collection settings, access/submission facts, immutable events and retry receipts. Save all is one application operation and atomic database batch; it still writes the affected records and audit entries.

Recheck Admin/Teacher authority, original shared membership, register/member/recipient revisions, exact PDF identities and current marking records. Preserve the split Core/Admin ownership and private coordinator protocol. Release selections and retries are exact. PDFs and unsaved editable forms are not stored in the learner metadata cache; opening protected PDFs and submitting answers always recheck live access.

Progress loads on demand when expanded, with no polling. Elapsed time is calculated from existing timestamps. Batch reads and grouped statements limit repeated database work. Production checks must remain small, following the shared database-usage rule.

## Verification

All 119 focused backend/release checks passed, including external moderation before marks entry, class-scoped shared grouping, exact retries, atomic rollback, released-paper replacement boundaries, whole-Imtihaan release and PDF-review-before-receipt. Additional final guard checks passed after tightening release counts. Both browser workflows passed, including 390/1440px layouts, native Print dispatch, scanning help, local preview, lost-answer-response retry, instant cached rendering before a delayed refresh, grouped Teach/Admin-Teach and submission review. The full regression run and its local-runtime reruns are recorded in the project outputs under `academy-assessment-10771`. Both builds and the 138-module Academy boundary check passed. All tests use disposable records and file storage; no assessment corrections or test messages are sent to real accounts.

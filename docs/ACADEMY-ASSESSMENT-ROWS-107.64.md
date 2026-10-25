# V107.64 — Assessment rows and paper popups

All assessment controls stay in rows for Students, Teachers and Admins. Moderation and Release views also use tables. There is no separate assessment detail page.

- Open assessment opens the authorised PDF in the embedded PDF.js viewer.
- Student Submit answer opens a PDF attachment popup. Dirty-file protection, session checks and exact upload retries remain. Released marks appear in their own row, including zero; unreleased marks and other learners’ marks are omitted.
- Admin Publish papers publishes approved, scheduled papers in the current Imtihaan. It expands shared assessments to all their selected classes and rechecks approval and revisions before release.
- Close submissions and Release marks are in the assessment rows. Closing applies to exams and assignments without changing their existing due time or exam cutoff. Shared changes are atomic across classes. Release retains validation of the existing manually completed marks.
- Paper status opens a compact moderation popup with the assessment name, assignment due date or exam duration, total marks, PDF.js Open, Approve and Edit. Approval requires the exact-PDF checkbox and explicit confirmation. Edit opens timing, duration, allowance, total mark and replacement-PDF controls.
- Examiner is an active teacher selected from the relevant Program/Course; an Admin upload records the Admin separately as uploader. A designated examiner receives access only to their assigned assessment within their current Teacher scope. Global and scoped Program Admins can upload and moderate their own paper.
- Delete assessment and unpublished schedule editing are available directly from the Admin row. Results, feedback and reports remain available in a learner popup.

The old assessment detail renderer, Learner submissions & marking UI, its learner list, readiness/marking/review/release event handlers, answer-review dialog and unused styles are deleted from the client. Existing stored learner work, audit history and backend operations used by results/report workflows are preserved.

Validation uses disposable D1/R2 fixtures and the real Worker/browser application. It covers shared paper replacement and approval, Program Admin scope, examiner/uploader separation, submission closure, row-based mark release, student PDF and answer upload, released-mark privacy including zero/withdrawal, stale revisions, exact retries, PDF.js rendering and downloads, legacy assessments, Arabic reports, and mobile/desktop layouts. No migrations or live data corrections are required.

Verified: 102 affected backend/release checks passed; native/shared, legacy/report and PDF.js browser acceptance passed at mobile and desktop widths. Worker dry-run and Development website build passed.

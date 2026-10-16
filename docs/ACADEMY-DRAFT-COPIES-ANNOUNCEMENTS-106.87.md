# V106.87 — Editable copied enrolments and full announcements

The New Program and New Course copy dialogs default to including the timetable and current learner enrolments. These options can be deselected. Copies use existing user accounts and fresh local IDs; no duplicate users are registered. Curriculum/public cards remain editable and shared Academy catalogue definitions remain shared.

Program copies retain current Student assignments and active class memberships mapped to the new classes, including membership dates for admin to review. Global Admin can edit the draft learner roster and class memberships. Inactive accounts and revoked Student assignments are not revived. A copied Program stays inactive/Draft until activated or published.

Course timetable copying retains dates, times, weekdays, teacher selections, individual sessions and their current scheduled/cancelled choices. Session IDs are fresh. Existing local Course curriculum rows are remapped to new IDs. Validation/acceptance/publication history is not copied. Admin can edit dates and sessions individually or explicitly regenerate them. Course copies may include current Student/subscription enrolments as an editable roster. Copies stay inactive/Draft, so copied learners have no new Course context, timetable or lesson access until publication. Global Admin may add/remove draft Student selections; draft staff authority cannot be added through this exception.

Enrolment requests, Paid indications, attendance, progress, assessments, lesson plans and media stay with the original. Paid is only the applicant's checkbox on an enrolment request. There is no payment ledger or payment-processing workflow. Existing Course Repeat behaviour remains unchanged.

An announcement picture opens an accessible modal containing the complete image, heading, full message and clickable links/PDF attachment. The image is contained without cropping, text is not truncated, and the layout scrolls within the viewport on phones. Close and Escape return focus to the picture. The existing safe link renderer still escapes HTML and rejects unsafe protocols.

All changes use the existing Development branch, Worker and database. No schema upgrade, new branch or new Cloudflare resource is required. Copy batches retain authority/revision guards, atomic rollback and retry receipts. Tests use synthetic rosters and announcements; no live copies or test announcements are created.

Verification: all 71 backend test files passed, including copy rollback, retry, source preservation, draft roster editing and access becoming available only after activation/publication. Fourteen packaged Chrome flows passed: nine creation/copy/editing flows and five announcement pop-up checks across phone and desktop sizes. Full posters, complete text, safe links/PDF, Close/Escape and keyboard focus restoration were inspected. No live copies, learner changes or test announcements were made during verification.

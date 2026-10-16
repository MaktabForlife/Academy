# V106.86 — Copy an existing Program or Course

Global Admin can choose **Blank** or an existing learning area from **New Program** / **New Course**. A copy is saved as a separate editable draft. Renaming or editing it does not change the original. Existing Course Repeat remains available for completed/archived deliveries.

Programs copy active curriculum definitions (Subjects, levels, Modules and tasks), active classes and the public card. Local references get fresh IDs and shared Academy Subject/Module catalogue definitions remain shared. Classes use the current academic year. The optional schedule copy carries the weekly pattern, meeting links, class teacher selections and planning settings into an unvalidated timetable with fresh rule/record IDs. Publication history, validation and effective dates do not transfer. The normal publication flow requires a future effective date.

Courses copy their category, access setting, timezone and public card. The optional schedule copy carries weekdays, times, teacher and meeting link. Dates and generated sessions always start empty. Review, validation and publication must be completed for the new Course. Copying from an active, draft, cancelled or archived Course is supported.

No students, enrolments, roles, subscriptions, payment data, enrolment catalogue entries/requests, attendance, progress, assessments, lesson plans or media are copied. Teacher selections are planning data and do not grant access. The existing publication flow grants teaching access only after publication. Media reuse on the older Course Repeat action is unchanged.

The copy operations require current Global Admin authority, use atomic database batches and check source revisions. Existing retry receipts prevent a repeated acknowledgement from creating a second copy. Concurrent source changes are checked inside the write transaction. No database schema upgrade, live data correction, new branch or Cloudflare resource is needed.

Verification: all 71 backend test files passed. Eight packaged Chrome acceptance flows passed, covering both creation dialogs at phone and desktop sizes, source selection, independent edits, lost-acknowledgement retry, unpublished copies, required Course dates, blank creation and scoped-admin restrictions. All browser copy operations used synthetic data; no live learning area was created for testing.

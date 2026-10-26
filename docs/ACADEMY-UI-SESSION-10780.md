# V107.80 — UI and session update release

The five-part batch was directly authorised for implementation and Development deployment in “UI and lesson updates” and handed to optimisation. It follows deployed V107.79 and preserves that release’s automatic public snapshot refresh and manual Update timetable fallback.

## Behaviour

- Assigned Teachers choose **This lesson only** or **Every occurrence of this session** when posting a PDF. Recurring attachments reuse one stored version across matching accepted occurrences. The author can replace or withdraw it; other assigned teachers and learners can read it. Admin oversight remains scoped.
- A recurring binding contains the Program/Course, saved rule/source session, class/offering and subject/module identities. Renames and clock changes preserve it; a different source session, class, offering or module does not inherit it. Current accepted sessions, current membership/roles, visibility and download permission are checked. A former Teacher cannot use an old occurrence to change a future recurring resource.
- The combined ten-PDF limit includes official, dated Teacher and recurring Teacher PDFs. Replacing one version retains its slot. Publication also checks the combined limit under the source/head fence.
- Session plan requirements inherit Required/Optional from the Program/Course. Admins load accepted sessions and save up to 100 changed choices atomically, including restoration of inheritance. Changes start on a future teaching day and preserve earlier choices and saved plans. Optional plans remain editable; missing/overdue warnings use the same effective policy. Join/access rules do not depend on plan submission.
- Global Admin navigation is Users; Announcements; Attendance; Curriculum; Library; Lesson plans; Assessments; App settings; Update timetable. Curriculum groups Subjects, Programs and Courses. Enrolments is reached through Users. Scoped Admins retain their filtered destinations. The same menu appears across Admin spaces without another permissions lookup.
- Admin Quick tools contain Surahs and Duas Tracker, Library and Voice Recorder. Teach/Learn keep their existing tools.
- The separate Review setup UI, script and review/freeze/publish/resolve endpoints are retired. Existing feature-specific validation/publication and assessment release confirmations remain.

## Safe completion without the extra setup screen

A server-authored write plan captures only its intended row identities and columns. The immutable operation receipt stores before/after facts inside the source transaction; receipt details remain private. The feature action silently completes those exact changes into a new immutable accepted vector. Saving an unchanged visible form also confirms its explicitly supplied older saved fields. Untouched fields, other rows and other learning areas stay private.

Current source facts, accepted head, session/credential state and every affected Admin scope are rechecked before the final commit. Lost acknowledgements replay the same receipt/head and do not duplicate publication or public refresh. Older pending operations can be completed by opening their feature editor and saving again. Immutable staging remains an internal coordinator safeguard and never requires a separate Admin screen.

The split coordinator evaluates feature receipts after Core publication facts have been written, while projecting the guarded Admin owner plan. Core-only release actions take this path when their receipt needs those facts. Interrupted owner writes retain the existing recovery protocol. A scoped all-class Imtihaan derives authority from its exact learning areas rather than demanding Global Admin because its shared register is physically stored in a global component.

## Reads and storage

There is no navigation polling and no new permissions request for the shared menu. Session requirement JSON joins the existing indexed settings lookup. Accepted session facts and date resolution are shared within each planning request when overrides exist. Note lookups derive recurring keys server-side and reuse known accepted sessions; extra resolution occurs only for matching recurring candidates. Publication/upload limits aggregate each attachment family once. Definition confirmation runs on Save/Publish, never on learner navigation.

No schema migration, storage copy or live data correction is needed. Existing JSON settings and immutable note source metadata carry the new policy and recurring identity. The compatible private coordinator must deploy before the API; the website then deploys from the same release commit.

## Local verification

- All 126 backend regression files, plus focused release integrity, exact row/column merge and refresh tests.
- Source guard, current authority, unrelated drafts/fields, stale receipt rejection, failed transaction retry, pinned accepted readers and live disables.
- Split owner receipt AFTER-state, interruption recovery and actual local Worker/Durable Object/D1 runtime publication. Source write requests stay within the existing 50-query bound.
- Recurring/dates-only resources, one file version reused, replacement/withdrawal, role revocation, Teacher reassignment, Course rescheduling/source isolation, metadata/bytes denial and combined PDF cap.
- Program and Course plan inheritance/overrides/restoration, future history, optional editing and atomic stale-batch rejection.
- Actual Program Publish browser action automatically refreshes the public snapshot. Admin menu/fallback/Quick tools, session choices and learner PDF opening pass at desktop and phone sizes. The current whole-Imtihaan browser flow passes all nine checks, including partial paper publication, learner PDF/submission, examiner scope, marking moderation and separate marks/report release. Existing planning browser checks include all 36 export/sharing/layout checks.

Release evidence is stored locally under `outputs/academy-ui-session-*` and `outputs/academy-ui-session-10780/` in the project workspace. Live verification is limited to release metadata, one API readiness request and a few static asset matches; there is no authenticated live acceptance run, SQL, timetable publication or snapshot rebuild. Keep live checks small to limit database usage.

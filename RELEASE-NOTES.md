# V107.8 — Visible timetable validation editor

Fix the apparent freeze after opening a lesson from a validation issue in Review & publish. Select the visible Timetable workspace before opening the lesson modal, preserving the current draft. Verify desktop and phone correction, cancellation, saving and revalidation against a disposable database. Development only; no database migration or live timetable edits.

# V107.7 — Session lesson media

Extend the MOU lesson-media service to Programs and Courses. Media entries link to a dated published Program lesson or saved Course session, accept up to ten YouTube links and ten private R2 PDFs, and start as drafts. LEARN/TEACH expose the dedicated Lesson media tab. Assigned teachers and administrators manage their sessions; enrolled learners see published entries within their class/course scope. Retain MOU recordings, notes and discussions. Apply migration 0030 before deployment; it preserves existing media records and permits Course sessions without a Program class. [Release details](docs/ACADEMY-SESSION-MEDIA-107.7.md).

# V107.6 — Numeric PDF annotation controls

Replace the PDF.js text-size, line-thickness and freehand highlighter-thickness sliders with number fields and native step controls. Preserve their ranges of 5–100, 1–20 and 8–24 respectively. Temporary empty, fractional or out-of-range entries never reach the annotation editor and revert to the last valid value on blur. Verify direct entry, keyboard stepping, drawn/typed annotations, saved PDF sizes and phone layout. Development only; no database or content changes.

# V107.5 — PDF toolbar and full screen

Combine reader and selected-PDF controls in one row on large screens. Full screen hides the Academy brand and account headers, with a persistent exit button and Escape support. The PDF frames stay mounted, preserving reading position and annotations through header toggles and responsive layout changes. Phone layouts retain compact pane controls. [Verification](docs/ACADEMY-PDF-TOOLBAR-107.5.md).

# V107.4 — Library refresh

Fix shared-header Refresh delegating to CSS-hidden controls on the active visible page. The public Library now replaces its weekly browser snapshot on explicit Refresh, allowing new Archive resources to appear immediately. Hidden/inactive panels, disabled actions and existing draft guards retain their checks. No Library records, assignments, database schema or storage identities change. [Verification](docs/ACADEMY-LIBRARY-REFRESH-107.4.md).

# V107.3 — Header layout aligned with Hifz

Branding and dates share the left of the top banner; Home, Refresh and Login/Sign
out sit on the right. The second banner contains the profile and existing role
navigation. Academy has no Zoom control. Shared scripts preserve page actions and
their draft guards across standalone tools. Updated header assets use V107.3 cache
keys; the matching Development Worker changes only its health version. No database,
credential, profile or Hifz changes. [Verification](docs/ACADEMY-HEADERS-107.3.md).

# V106.82 — Development Academy cleanup

Promote V106.81 Academy features to the existing `development` branch and remove the unused legacy application, Google backend clients, private Drive handlers, old upload bridge, isolated feature packager and legacy deployment target.

Use the dedicated Academy Pages builder and D1 Worker entrypoint. Preserve the existing database, account credentials, sessions, role evidence, Library namespace, Durable Object class and all active storage bindings. Independent HifzHelper links remain; the cancelled shared-login integration is excluded.

Direct clean-runtime regression checks also correct Open Library expired-session responses to return 401. Offline import comparisons use the current public timetable contract. Legacy-only regressions remain recoverable in Git history; current D1, UI, media and recovery checks remain active.

No new branch, Worker, database or production environment is created. Legacy `main` and `rebootworker` are unchanged. [Full release record](docs/ACADEMY-DEVELOPMENT-CLEANUP-106.82.md).

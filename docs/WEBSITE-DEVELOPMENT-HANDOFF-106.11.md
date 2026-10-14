# Academy website development handoff V106.11

Continue development of Umm Abbad Academy from V106.11. D1 is the current application store, and the development website is the current product. Preserve existing accounts, roles, publications and saved data. Several media and teaching workflows remain unfinished; visible navigation is not proof that those workflows are implemented.

## Start the next chat

Open a new chat in the maktab project. Give it this file and the next change you want. Ask it to read the repository AGENTS.md, inspect the working tree and remote feature branch, and confirm the current release before editing. If its workspace differs, it should locate this repository or obtain the latest feature branch rather than modify the read-only project sources.

The owner authorised the V106.11 release after testing. For later batches, prepare and test changes, then push only when the owner explicitly authorises that batch. A feature push deploys both the website and backend. Every feature push requires a new synchronized version, updated asset cache arguments, README and release notes. Do not force-push or overwrite another chat's changes.

## Repository and deployment

| Item | Current setting |
| --- | --- |
| Local repository | `/Users/hbnaidu/.codex/.chatgpt-projects/g-p-6ab255fb8710819189b4ee1da081d7f6/work/Rebootyourmaktab-sheets-throttling` |
| Git remote | `https://github.com/MaktabForlife/Rebootyourmaktab.git` |
| Local branch | `feature/academy-d1-preflight` |
| Deployment branch | `feature/105.3.4.13` |
| Website | `https://maktab-development.pages.dev/academy/` |
| Current Worker | `https://devrebootworker.maktab4life.workers.dev` |
| Main D1 | `maktab-academy`, `7e732b79-a72f-4da6-be83-524919c49ba4` |
| Separate test D1 | `academy-d1-core-test-20261010-a01264a4`, `c5b96e84-f6ae-4fa6-ba7b-3ce91fe5c22c` |

The production-named Worker is legacy and outside this development release. Keep dashboard variables and secrets intact. Current activation uses D1 and `ACADEMY_LIBRARY_MODE=PUBLIC_ONLY`; do not silently reactivate the old private Library permissions. Project `sources/` files are synced reference material and must not be edited, renamed or deleted.

The owner will not upgrade Cloudflare. Run regressions and concurrency tests locally with synthetic data. Main and test databases share the account's allowance; hosted testing previously exhausted it. Avoid polling, large scans, repeated activation probes and hosted load tests. Do not resume the paused hosted test application without a specific reason and authorisation.

## V106.11 changes

- Program and Course landing pages show visible Admin, Teach and Learn pill rows according to authority. Admins see Admin and Teach; students see Learn. Redundant Classes, curriculum and placeholder panels are removed.
- Each individual Program or Course shows only its own authorised timetable. My Timetable opens the complete permitted Academy timetable. These views reuse the daily authorised snapshot.
- Courses navigation is hidden when the account has no Course role or access. Global Admin retains access to management.
- Public and personal Library catalogues are cached in the browser for seven days, with immediate saved display and a Refresh icon. Cards have equal dimensions. Personal caches are session-scoped and cleared on sign-out/account change; protected file access still requires a current server check.
- User profiles has editable Name, UNIQUEID/Login ID, WhatsApp number and Status, followed by Actions and narrower Program/Course role columns. Login IDs permit letters and numbers, with case-insensitive uniqueness, including inactive accounts. Unchanged legacy IDs remain valid.
- Scoped Program Admin is displayed as Admin in the profile sheet. None means no assigned role. Active only filters Program/Course columns, while the separate status filter controls users.
- Global Admin can confirm a PIN reset for another account from its row. Reset revokes all sessions, clears the PIN and allows a new PIN through the existing sign-in link. Exact retries cannot erase a subsequently chosen PIN. Another Global Admin must reset the current administrator's own PIN.
- Free published Program/Course lessons offer public homepage joining from five minutes before start until lesson end. The browser updates the button locally. A fresh server check on click verifies publication, Free/Paid policy, cancellation and the time window. Cached snapshots contain no meeting URLs; Paid lessons have no public joining reference.

## Verification and database status

All 137 local regression test files pass. The development Worker dry-run build passes. Additional browser checks use synthetic accounts and verify the compact profile sheet, role rows, scoped timetable, reset confirmation cancellation and equal Library card heights. A further public-joining UI test confirms local boundary updates, no polling and the unauthenticated click-time endpoint.

Migration `0011_account_contact_details.sql` is applied to the main database. Its zero-row verification succeeds; it adds private WhatsApp storage without replacing accounts, credentials or permissions. Existing numbers have not been imported and remain blank until entered. This release did not apply 0011 to the separate hosted test database; local test fixtures apply it.

Historical schema upgrades were installed through controlled SQL, and Wrangler's generic migrations list shows those files as pending. Do not run migrations apply against the entire directory on main. Inspect the existing schema and apply only the intended, tested additive upgrade. Migration 0010 was already applied to main and test. The cached Wrangler 4.127.1 successfully performed this release's database administration; 4.148.0 initially returned an access error for the query command.

Local test logs and synthetic screenshots are outside Git, under `/private/tmp/maktab-10611-handoff-tests.log` and the project `artifacts/academy-10611/` directory. No hosted capacity test was run for V106.11. Check the remote release commit and hosted version after deployment; do not infer deployment success solely from a push.

## Roles and access

Use the same scoped roles for Programs and Courses: None, Student, Teacher and Program Admin. The profile sheet shortens Program Admin to Admin; it does not change the stored role or its scope. Old Senior roles map to Teacher.

Global Admin is an independent Academy-wide designation. It automatically inherits Program Admin authority in every Program and Course, including newly created ones. Scoped edits cannot remove inherited authority. Preserve self-removal and final-active-administrator protection. User profiles has a separate searchable Global status editor for Global Admin and Global Teacher.

Global Teacher identifies Academy teaching staff for teacher selectors. It grants no blanket access to Programs, Courses or administrator functions. Access follows assignments. Teacher selectors include active teaching staff and existing active Teachers, rather than every account.

Always enforce authority on the server. Hidden buttons, cached roles and disabled controls are not permission checks. Retain atomic writes, revision conflict review, audit records and exact operation receipts for uncertain retries.

## Programs, Subjects and Modules

Programs run continuously and organise Subjects, Modules, classes and scheduled lessons. The five intended live Programs are Alimiyah, Reboot, Mothers of the Ummah, Tafseer and Hifz. The older Reboot Your Maktab workspace is archived rather than the active replacement. Preserve current saved statuses rather than reimporting old registry flags.

Subjects and Modules are Academy-wide reusable definitions. A Module belongs to a Subject. Programs and Courses use these definitions; they do not own separate lists. The editor shows where a definition is used. Existing scoped usage IDs, published lessons and media references must remain stable. Some migrated Course Modules still require explicit Subject classification; do not guess their Subject from a Course title.

## Courses

Courses are current offerings; only the old Global Subject and Global Curriculum terminology is obsolete. Short courses, workshops and bootcamps have fixed duration and can be Free or Paid. A Course's Subject/Module selection is for categorisation only and does not inherit content or access.

A draft requires only a name. Editable schedule details include date range, weekdays, start/finish time, timezone, teacher and Zoom link. A one-day Course can have the same start and end date. Use the flow: save draft, validate schedule, generate dated sessions, review/edit exceptions, accept, publish. Sessions should inherit schedule defaults so dates and times do not need re-entry. Regenerating replaces individual session edits only after confirmation. Later changes invalidate acceptance. Highlight Academy holidays and teacher clashes before publication.

Course states are Draft, Published, Active, Complete, Archived and Cancelled. Repeating a completed/archived Course creates a new Course ID, with an option to reuse existing media. Keep the original Course and its participants intact. Paid Course subscriptions apply to that fixed Course offering.

Use 24-hour `HH:mm` display throughout. Compact input must normalize before saving: `830` becomes `08:30`, `2100` becomes `21:00`, and `21h30` becomes `21:30`. Invalid input stays visible for correction. The shared helper is `js/m4l-time.js`.

## Media and Library rules still to build

The Public Library requires no sign-in and uses Archive.org material. Personal Library uses the existing Academy account. Private Academy media will use one shared protected store; R2 is a candidate, and the storage/access workflow is not enabled. Old requirements for separate Program Drive upload folders are superseded.

The later Course-specific agreement takes precedence over older documents that describe Course media as Module subscriptions: Course media access begins on completion. An account with the Student role for that Course can access everything attached to it, including later attachments. The Student record stays intact to retain access; removing it removes Course-based access. Archiving does not automatically delete participants or media. This learner media workflow remains unfinished.

Program Module subscriptions and permanent completion entitlements also remain unbuilt. A learner subscribed when a Module completes receives permanent account access to the media included at completion. A subscription ending before completion does not qualify. Ending a subscription later, or archiving a Program/Module, must not revoke a permanent entitlement. A resource can belong to multiple Modules; eligibility through any one is sufficient. Completion grants need durable provenance and atomic, idempotent processing. Do not infer grants from old roles or retrospectively import inactive/archived material without an agreed mapping.

Protected resources require server checks both when listing them and when opening their files. Public Archive.org URLs cannot serve as private media storage. Keep private delivery disabled until the agreed model is implemented and tested.

## Timetables and navigation

The public homepage timetable is a marketing preview. The implementation serves one shared daily snapshot covering seven days, stored in the existing R2 bucket and cached at the edge. There is no background or tab-return fetch. Public policy/schedule edits may take up to a day to appear in the preview; joining always checks current state.

Signed-in timetables load once per Academy day per session, with a manual Refresh button. The browser alone updates joining, start/end states and highlights. Explicitly browsed ranges are cached separately. Students and Teachers see lessons in which they are directly involved. Program Admins see their Programs' complete schedules, rolled up by meeting link and day. Global Admin sees the entire Academy similarly. Use one timetable colour and a dark highlight while joining is open. Lesson information shows only Module (or Subject if none), class, time and teacher.

Landing-page tools are:

- Admin: Users, Library, Programs, Courses, Academy. Academy groups Subjects & Modules, Calendar, Announcements and Progress; shared catalogue editing remains Global Admin only.
- Teach: Attendance, Progress, Assessment, Plan, Announcements, My Timetable.
- Learn: Library, My Progress, My Assessment, Calendar, Announcements, My Timetable.

Existing Program attendance opens its real workflow. Calendar shows cached Academy events. Progress, Assessment, Plan, Announcements and Course attendance currently open compact coming-soon notices. These require development; do not describe the new pills as completed teaching features. Private learner Course media is also disabled. Program Free/Paid settings are still read-only in the profile matrix; Course offerings have their own editable Free/Paid setting.

## Working practices and next work

Use compact, intuitive screens with a spreadsheet-like management layout. Explain changes to the owner in plain language. Do not repeatedly ask for approval for already-authorised work, but honour release holds and clarify genuine business ambiguities before changing permissions or media rules.

D1 owns current application writes. Sheets were the migration source, not a live replacement for D1 records. The initial active-only import contained five Programs, two Courses and 73 accounts; these are historical counts. UserAccounts and UserCourseAccess were identified as account/Course-access sources. Do not reimport old source data over newer website edits. Preserve private backups and keep credentials, contacts and account exports out of Git.

The next chat should start with the owner's next priority. Likely unfinished areas are the teaching tools above, protected media and subscription workflows, remaining Module classification, and a reviewed Program Free/Paid editor. Inspect the implementation and current data before planning changes. Older release notes describe historical states; this handoff and later explicit owner decisions supersede them.

Useful implementation references: `RELEASE-NOTES.md`, `docs/ACADEMY-CATALOGUE-106.10.md`, `docs/ACADEMY-COURSE-WORKSPACE-106.6.md`, `docs/ACADEMY-COURSE-REVIEW-106.8.md`, and `docs/ACADEMY-LIBRARY-ACCESS-MODEL.md` (whose Course-specific media scope is superseded above).

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

# V106.82 — Development Academy cleanup

Promote V106.81 Academy features to the existing `development` branch and remove the unused legacy application, Google backend clients, private Drive handlers, old upload bridge, isolated feature packager and legacy deployment target.

Use the dedicated Academy Pages builder and D1 Worker entrypoint. Preserve the existing database, account credentials, sessions, role evidence, Library namespace, Durable Object class and all active storage bindings. Independent HifzHelper links remain; the cancelled shared-login integration is excluded.

Direct clean-runtime regression checks also correct Open Library expired-session responses to return 401. Offline import comparisons use the current public timetable contract. Legacy-only regressions remain recoverable in Git history; current D1, UI, media and recovery checks remain active.

No new branch, Worker, database or production environment is created. Legacy `main` and `rebootworker` are unchanged. [Full release record](docs/ACADEMY-DEVELOPMENT-CLEANUP-106.82.md).

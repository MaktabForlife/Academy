# V107.65 — Dashboard Imtihaan timetables

Built from V107.64 on `feature/academy-role-dashboards`.

- Add Assessments directly below FYA on Learn, Teach and Admin, including phone layouts.
- Group each authorised Imtihaan’s dates into a linked timetable. Current means today lies within its first/last exam dates; upcoming starts after today. Past, completed, released, cancelled and archived registers and assignments are excluded.
- Learners see published schedules for their own eligible classes. Teachers/Admin also see their authorised draft schedules, labelled Schedule draft. A dashboard link opens the selected existing Imtihaan timetable, preserving V107.64 row controls and shared-class Admin behaviour.
- The existing scoped assessment reader accepts `dashboard: true` and returns timetable metadata only, skipping result aggregation, register management, curriculum and examiner selectors. Dashboard caching stores only safe summary fields and revalidates in the background.
- Admin Coming up next shows Courses only, as clarified by the user. Other active Program/Course management tiles, assessments and review queues remain scoped as before.
- Rename the Admin action and queue to Review Lesson Plans.
- Synchronise V107.65 release markers and updated asset URLs. No schema migration or live data correction.

## Verification

- Full backend regression covered 107 test files; two stale Attendance asset-version references were corrected and their affected checks rerun successfully. Worker runtime checks passed with local loopback access.
- 36 affected assessment/register/navigation/attendance tests passed, including the new summary-only API contract and learner draft privacy check.
- Local browser acceptance passed across Learn, Teach and Admin: correct placement, current/upcoming grouping, exact timetable links, learner/staff separation, saved summary display before delayed responses and subsequent background refresh, active-area filtering, Admin Courses-only upcoming list, calendar/queue regressions and 320–1440 px layouts. The cache assertion rejects result, staff and file fields.
- Development site build, matching Worker dry-run and Academy boundary checks passed.

Development’s existing D1 daily read allowance was exhausted before this release. Live sign-in verification must wait until the reported reset at 2026-10-26 00:00 UTC (03:00 Riyadh). Deployment build status and public static release markers can be verified without database reads.

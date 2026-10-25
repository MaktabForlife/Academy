# Connected Academy dashboards — V107.57

Branch: `feature/academy-role-dashboards`, based on deployed V107.56.
Development deployment authorised on 25 October 2026. No database migration or
live-data correction is required.

## Signed-in navigation

The existing Learn (`#timetable/learn`), Teach (`#timetable/teach`) and Admin
(`/academy/admin/#administration`) home entries now render the dashboard. Normal
sign-in selects the highest authorised workspace: Admin first, then Teach, then
Learn. A previously selected lower workspace does not override that priority. An
explicit lesson/tool link survives sign-in. Home and the Academy brand return to
the current workspace dashboard.

Visit website opens `/academy/#website`, the public Academy homepage. This
explicit public destination does not bounce signed-in users back to the dashboard.

Continue learning/teaching and management display linked tiles for **active**
authorised Programs and Courses, grouped by kind. Hifz uses the existing approved
personal HifzHelper destination. Administrative tiles and timetable rows exclude
personal/public learner memberships outside the account's management scope.

Your workspace includes Surahs and Duas Tracker, Library, Recorder and Visit
website. Tracker links open the personal tracker in Learn, an assigned-area chooser
in Teach, and management in Admin. Teach has prominent **Mark attendance** and
**Submit plans** actions which select an assigned area and open the real existing
tools. Global Admin retains all existing management destinations and inherited
Program Admin authority, including setup review and public-timetable refresh.

The Program/Course chooser and repeated Messages/Reminders, calendar and tracker
support panels are removed from individual Learn, Teach and Admin activity/tool
pages, including Assessment and Lesson media. Their title, local tool tabs and
scoped timetable remain. A tracker opened deliberately is still available as a
tool; it is no longer duplicated as a support panel.

## Data and cache

| Dashboard area | Existing real source |
| --- | --- |
| Identity, authorised tiles, next sessions, This week | Scoped entrance snapshot |
| This week | The original `academy-schedule` component, including seven swipeable days, week arrows, details, Class Notes, lesson media and timed joining |
| FYA | Authorised Class Notes due this timetable week; scoped Admin enrolment inbox (plans have their own panel) |
| Messages | Existing public Academy announcements and the same authorised due Class Note records |
| Attendance / Review attendance | Existing native register reads for started lessons in the displayed timetable week; Teacher lists unmarked registers and Admin can review both submitted and pending registers |
| Lesson plans due / Review plans | Existing scoped planning reader; Teacher deadlines and Admin submitted/due plans |
| Calendar, directly below timetable | Existing embedded Academic Calendar with the selected workspace and accepted setup |

Coming up next shows one row per authorised Program/Course with an upcoming
scheduled session in the displayed timetable week, ordered by the next start time.
Each whole row links to that learning area’s workspace and shows its subject/module,
Program/Course name, date, time and timezone. Ended and cancelled sessions are
excluded, and later sessions in the same learning area are not duplicated.

The dashboard introduces no fictional submissions, acknowledgements, assessment
releases or queue counts. It shows records that the current Academy services can
actually supply. Class Notes open the existing protected reader/editor. Reading
one clears its message indicator but does not dismiss its FYA reminder; the
preparation reminder expires when its linked lesson begins. Read indicators are
account/workspace-specific device preferences, not a new cross-device inbox or
acknowledgement service.

Entrance, planning, enrolments, Class Note summaries and calendar reads use the
existing protected read cache. A warm snapshot renders immediately while a background request checks for updates,
even when the dashboard snapshot is less than a minute old. Concurrent checks share
one request. Other readers retain the existing 60-second freshness policy; saved
snapshots expire after 30 minutes or when the Academy day changes. Account, workspace, class and accepted-publication boundaries are preserved;
authoritative access failures discard protected cached results. Temporary failures
retain a labelled saved view with retry rather than claiming zero work.

Submitting a plan and posting/revising/relinking a Class Note now invalidate the
read snapshots as well as the existing save/withdraw actions. Refresh retains the
selected timetable week and reuses existing tools' draft guards. No meeting URLs,
bearer tokens or signed file URLs are added to the read cache.

## Local review

Run `node backend/tools/academy-dashboard-preview.mjs` from this checkout, then
open `http://127.0.0.1:4179/academy/`. The loopback-only server serves these feature
files and proxies API requests to the existing Development Worker. Sign in using
the normal Academy form. It reads no saved browser credentials and logs no PINs,
tokens or payloads. Actions explicitly taken in this connected preview use the
real API and its normal permission checks.

The earlier sample design remains at `academy/dashboard-design/` for reference.
The connected dashboard is the normal Academy entry, not that sample route.

## Verification

- Existing Academy regression group (103 files); runtime tests use installed local
  dependencies and loopback-only Workers fixtures.
- Connected browser acceptance against disposable SQLite/R2 records, exercising
  the actual Worker and full front end: sign-in landing, all authorised tiles,
  original timetable, Class Note source reuse, calendar, Teacher actions, scoped
  Admin, duplicate-panel removal, mobile widths and delayed background refresh.
- Existing Class Notes browser acceptance for posting, retrying, corrections,
  history, scoped withdrawal and sign-out privacy.

V107.57 synchronises all release markers. Work remains on the feature branch.
The sample design is excluded from the Development publish artifact.

Attendance and plan panels remain 340px high, with independent keyboard-accessible
scroll regions. They sit beside the calendar on wide screens and stack on phones.
Class Note preparation remains in FYA; lesson-plan deadlines do not. Only register
metadata is cached by the dashboard; learner names, rosters and marks are discarded.
Attendance links select the actual date and lesson in the existing register editor.

Calendar Terms and Teaching hours use read dialogs. Scoped Admin can choose a
teacher and open the existing availability editor. An open availability draft keeps
its reviewed revision if a background calendar response arrives.

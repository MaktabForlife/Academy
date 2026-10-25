# V107.57 — Connected workspace dashboards

Normal sign-in opens the highest authorised workspace: Admin, Teach, then Learn.
Explicit lesson and tool links retain their destination. Home returns to the
selected workspace, and Visit website opens the public Academy homepage.

Only active, authorised Programs and Courses appear on the dashboards, including
their tiled links, next sessions, timetable and action lists. Coming up next has
one linked row per learning area in the displayed timetable week, with its
subject/module, name, date, time and timezone.

The existing timetable is followed by the Academic Calendar. Teacher has Mark
attendance and Lesson plans due in fixed-height scrolling panels beside it.
Program and Global Admin have Review attendance and Review plans. Attendance
reads actual submitted-register state and opens the selected date and lesson;
dashboard reads never submit registers. The review period is the displayed
timetable week through today. Plans no longer appear in FYA; Class Note
preparation and scoped enrolment actions remain there.

Calendar Terms and Teaching hours open as dialogs. Scoped Admin can choose a
permitted teacher and edit availability through the existing guarded editor.
Background reads cannot silently advance the revision of an open availability
draft. Shared support panels are removed from individual activity pages,
including assessments and lesson media.

Saved data appears immediately and revalidates in the background. Cache boundaries
retain account, workspace, class, day and accepted setup. Attendance caches contain
register metadata, without learner names, rosters or marks. Temporary failures
retain a labelled saved view; access failures discard protected saved data.

## Release validation

- Disposable Worker/SQLite/R2 browser acceptance: sign-in priorities, workspace
  scope, active-only cards, next-session rows, original timetable, shared Class
  Notes, cached/background updates, actual attendance links and calendar dialogs.
- Desktop and 390px/320px layouts, independently scrolling 340px action panels,
  keyboard controls, and Admin teacher selection.
- Existing calendar, attendance, entrance, workspace and Class Notes regressions.
- Academy source boundary, full Academy regression group, allowlisted Pages build
  and matching Development Worker bundle.

No database migration, data reload, live-record correction, new external provider
or scheduled task is required. The sample design remains local reference material
and is excluded from the publish artifact. Source remains on
`feature/academy-role-dashboards`.

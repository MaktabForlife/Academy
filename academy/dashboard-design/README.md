# Academy dashboard design

Local, responsive design proposal for the Learn, Teach and Admin landing pages.

Open `/academy/dashboard-design/` from a local static server at the repository root.
No build step, account, API, network dependency or production data is required.
The page reads no existing account tokens and makes no API requests. All sample
actions exist in memory and reset on reload. Nothing is deployed by this feature.

## Layout

The existing Academy identity is retained: plum controls, pale surfaces, serif
headings and the Academy logo. The workspace switcher remains in the application
header. Only the selected workspace's navigation and records appear.

Desktop gives FYA a wide left column, with the next lesson and Messages alongside.
Mobile orders FYA, the next lesson, Messages, current learning/teaching/management,
This week, and Quick tools. The mobile navigation gives Home, Timetable and Messages
direct access, with other destinations under More. All three dashboards use the
same structure, with role-specific content and actions.

On phones, FYA shows the first two actions and a `View all` control so that the next
lesson is close to the initial screen. `View all` opens the full actionable list.

| Workspace | Attention | Next step | Continuation and tools |
| --- | --- | --- | --- |
| Learn | Preparation, homework, acknowledgements, released feedback | Next enrolled lesson; Join, Preparation, Resources | Current Courses/Programs; Library, Recorder, My progress, Attendance |
| Teach | Registers, submissions, memorisation confirmations, lesson planning | Next assigned class; Classroom, Lesson plan, Resources | Assigned Courses/Programs; Attendance, Lesson planner, Library, Recorder |
| Admin | Enrolment decisions, overdue planning, report release, acknowledgement follow-up | Next lesson within scope; Lesson, Planning, Attendance | Authorised Courses/Programs; Enrolments, Assessments, Academic calendar, Reports |

The top preview controls can simulate individual account roles, scoped Course
Admin, inherited Global Admin, no assigned roles, empty content, loading, failed
loading, an up-to-date dashboard, and a phone-width layout.

## State and record rules for the connected implementation

- A notice and its FYA entry reference the same source record, with separate
  recipient read state and action completion state. Reading a message clears its
  unread dot; it never implicitly completes its action.
- Preparation remains outstanding until the relevant lesson starts (or the source
  instruction is withdrawn). The preview deliberately provides no generic dismiss
  button for preparation. Production must derive expiration from the lesson and
  current server time, not a client-side dismiss flag.
- Acknowledgement stays outstanding until explicit acknowledgement. The prototype
  updates both views immediately when acknowledged.
- Draft homework remains outstanding. Submission, reviewing feedback, completing
  a register, reviewing every submission, confirming memorisation, and completing
  planning each have distinct completion actions.
- A grouped queue remains visible while any members remain. Enrolment and review
  counts update as sample members are processed.
- The teacher planning task and the admin planning follow-up refer to the same
  lesson. Completing its planning removes both outstanding views in the preview.
- Overdue planning and missing acknowledgements cannot be dismissed merely by
  viewing them. Their source condition has to be resolved.
- Dashboard counts and rows must come from one consistent response/snapshot. Do
  not fetch separately for every card. Distinguish no records from failed loading;
  failed loading must not imply that a learner has no outstanding work.

## Routing and access

- Normal sign-in resolves to the selected authorised workspace dashboard. A valid
  saved return destination for a notice, lesson or resource takes precedence.
- Home and the Academy brand return to the selected signed-in dashboard. The
  separate Academy homepage link serves public discovery. The catalogue panel in
  this prototype is illustrative, not a proposed replacement for the public site.
- The preview includes normal sign-in and notice-link return flows under Options.
- Learn reflects the account's own enrolments; Teach reflects assigned teaching.
  Admin reflects administrative authority. Administrative access does not create
  personal learning progress or teaching assignments.
- Global Admin inherits Program Admin authority in every Course and Program,
  including new learning areas. Scoped Course/Program Admin must never receive
  records from outside its assigned scope.
- Accounts with no learning role show role `None` and an empty personal learning
  view. They must not see another user's learning data.
- Production must enforce these rules on the server for every read and action.
  The in-memory role selector and filtering here demonstrate UI states only; they
  are not production authorization or authentication.
- Deep links must be validated for access after sign-in, use internal allowlisted
  destinations, and show an unavailable state for inaccessible records.

## Verification

`backend/tools/academy-dashboard-design-acceptance.mjs` starts a loopback-only
static server, uses Playwright to exercise the design, and captures desktop and
mobile screenshots. Set `ACADEMY_BROWSER_RUNTIME` to your installed Playwright
module path and optionally set `DASHBOARD_DESIGN_ARTIFACTS` for screenshots.
The check uses an installed Chrome browser by default; use
`ACADEMY_BROWSER_EXECUTABLE` to select another Chromium executable. Pass `--serve`
to keep the restricted preview server running on `127.0.0.1:4178`, or set
`DASHBOARD_DESIGN_PORT` to choose another port. The server serves only this design
and the existing Academy logo.

The acceptance covers all three workspaces; 320px, 390px, 768px and desktop layouts;
shared message/action state; review and enrolment queues; scoped accounts; Global
Admin without personal enrolment; empty/loading/error states; normal sign-in and a
notice return destination; and the absence of external/API requests.

## Connected implementation

The connected implementation is now part of this feature branch at the normal
Learn, Teach and Admin home routes. This sample route remains a design reference.
See [the connected dashboard notes](../../docs/ACADEMY-DASHBOARDS-LOCAL.md) for real
data sources, caching, scope boundaries, local preview and verification. Nothing
has been pushed or deployed.

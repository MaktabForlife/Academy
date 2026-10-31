# Offline Academy workspace GUI rebuild

This branch prepares a compact, intuitive Learn / Teach / Admin interface for local review. It is an isolated GUI project; the released Academy and ongoing Studio migration continue independently.

## Workspace and baseline

- Branch: `feature/academy-workspaces-ui`.
- Checkout: project `work/Academy-workspaces-ui/`.
- Starting commit: `67000f231305ca52f8ef0ea89d16f00c0f2dfa91` (released V108.7 code plus the completed Tafseer/Kahf handover receipt).
- Runtime baseline: Academy `b65d2b8b8fde229dc09008c080dc0e7eeee76886`, as recorded in `outputs/academy-studio-handover-20261031/release-verification.json` at the project root.
- The existing Circles homepage/course/editorial work remains in its original checkout. Held Kahf `890d994` and the MOU migration are not included as new GUI scope.

The first local styling pass is complete. Native screens and controls are retained; a shared theme and compact programme navigation are layered over the released source. The isolated review harness runs the actual native runtime with disposable sample records.

## Confirmed design direction

The interface should be intuitive, elegant and compact. Preserve the current content and functions; do not add new content or capabilities without asking first.

**Desktop Learn / Teach:** aim for one screen per programme. Keep programme and class context visible. Arrange routine programme work within that workspace; reveal details in place through compact panels, tabs or drawers as appropriate. This is a design target to test against the existing functions, not permission to remove them or flatten their access boundaries. Dense detail can open in a bounded panel while the programme workspace remains available.

**Mobile:** Learn and routine Teach remain mobile-first. Admin is reviewed screen by screen. Record whether a screen supports full mobile use, a useful limited set of mobile actions, or desktop-only work. Make these decisions with the owner as the screens develop. Do not assume every desktop control must appear on a phone. Some teaching operations may also require desktop treatment when necessary.

## Offline review approach

Use clearly fictional sample records, local assets and local view-state for the first screen prototypes. Keep the prototype's data adapter separate from the native service adapters. The review harness must not sign in to the real app, make production API/database calls, submit messages, publish lessons, change permissions or fetch private media. Prototype saves remain explicitly local.

Use the current native screens and source as the content/function inventory. The earlier Circles `academy-workspaces.html` demo may inform visual direction, but its illustrative content and workflows are not evidence of current native functionality. Do not copy its invented records into the Academy or treat every demo feature as approved scope.

Validate navigation, screen density, readable text, keyboard/focus behaviour and narrow layouts in the local prototype. Use synthetic native fixtures for any later adapter checks. Full functional integration and publication require a separately reviewed connection to the current Academy/Studio baseline; an offline screen cannot establish real permissions or server-side gates.

## Boundaries to preserve

- Current master identity, login, account switching, scoped staff roles, programme/class allocation, assessment and publication gates.
- Tafseer and migrated Course website access in Studio, with no short-Course website delivery rebuilt in Academy Learn/Teach.
- Separate MOU monthly-access and published-timetable work; existing MOU PDFs/recordings remain in Academy under that project's current plan.
- Current native header/dashboard/Library/PDF return behaviour and the per-offering ownership state; no blanket authority switch.
- Existing data, source files, drafts, rights and media references. Do not seed or reset real records for visual review.

## Review order

Start by inventorying one retained programme's current Learn and Teach functions, then build a shared desktop programme shell using those functions. Review its phone adaptation and navigation before extending the pattern. Review Admin task groups and mobile limitations alongside each screen rather than imposing a global desktop-only rule.

Keep a per-screen review record of the existing functions, proposed layout, mobile support, unresolved decisions and later adapter dependency. Record questions as they arise; routine layout choices may progress without repeated approval. This setup does not authorise deployment, live integration changes, hosted operations or Git push.


## First review checkpoint — 31 October 2026

Implemented locally on this branch; no deployment, push, production login, hosted request or live data change.

### What changed

- Shared Circles styling in `css/m4l-workspace-theme.css`, loaded by 23 native entry pages. Local DM Sans and Libre Caslon Display fonts; warm cream, muted plum, sage, rose and restrained borders.
- Compact header: a single identity/account/workspace row on large desktops, two rows at smaller desktop widths, and the existing accessible mobile header/history controls.
- Programme tools stay visible above the active panel on desktop at 70rem and above. The original Menu drawer remains on compact screens. Resizing an open drawer to desktop returns the original tools and focuses the selected tab.
- One bounded programme reading/work area on desktop. Notes, attendance, planning, assessments and lesson media keep their original routes, controls, class context and draft/save/review flows.
- Attendance registers and day summary sit side by side on desktop. Media cards are shorter on desktop, with their own file scrolling. The planner's Revert label no longer squeezes into a 44px column.
- Learn/Teach programme launchers and personal timetable exclude standalone Course delivery. Tafseer cards remain out of Learn/Teach. Admin retains Course management and compatibility routes; this is a UI boundary, not a change to permissions or ownership.
- No lesson text, real records, access policy, server adapter, migration, publication or live joining logic was changed.

### Screen coverage

| Screens | Local review | Mobile treatment / review note |
| --- | --- | --- |
| Learn / Teach programme timetable | Desktop and 390px; 7-day desktop rail and phone day rail | Full routine use; native date and Join gates retained |
| Programme Menu and Class Notes | Native drawer, desktop tabs, class chooser, saved sample note, correction/history/withdraw actions | Drawer retains focus and Escape behaviour; no role controls added |
| Learner assessment / teacher assessment shell | Native register and disabled/unavailable states | Full routine viewing; wide registers scroll within their card |
| Attendance | Real synthetic registers and unknown-before-submission summary | Routine phone controls retained; desktop summary moved beside registers |
| Planning | Teacher editor and Admin teacher-by-week review board | Editor fits 320/390px; weekly matrix remains a contained horizontal table |
| Lesson media | Learner empty state and teacher session-card rail | Existing media/edit access retained; external playback unavailable offline |
| Dashboard | Learn, Teach and Admin shells | Compact cards; programme context and scoped native tools retained |
| Users | Existing user details table; native section tabs retained | Contained table scrolling, 44px phone controls; bulk matrix work needs owner review |
| Curriculum / subjects / modules | Shared catalogue and programme curriculum | Tables scroll inside their sheet |
| Programme administration | List, details, classes, curriculum, participants, timetable, review/publish, media and enrolment shells | Existing controls retained; dense timetable authoring and publication review are desktop candidates |
| Course administration | Native list and unified management shell | Kept under Admin; not inserted into Learn/Teach |
| Enrolment | Request inbox and catalogue | Phone filters and contained table; access/payment meaning unchanged |
| Announcements | Existing editor and file fields | Two-column editor on desktop, stacked phone layout |
| Library | Native Library and management shell; isolated Open Library editor | Phone reading/search retained; bulk resource editing remains a review candidate |
| Calendar | Existing monthly calendar and native details | Fits phone width |
| PDF defaults | Native controls and preview | Fits phone width; report/PDF canvas authoring not redesigned |
| Settings / messages | Native settings form and shared dialog styling | Existing actions and states preserved |
| Memorisation | Shared theme on main Academy/management components | Fixture has no complete memorisation dataset; detailed tracker workflows require a suitable offline fixture before claiming full acceptance |

No mobile action was disabled in this pass. The suggested desktop candidates above are review notes, not implemented restrictions. The external HifzHelper app and website lesson readers are outside this GUI pass.

### Validation

- 27 checks passed across `academy-workspace-client.test.mjs`, `academy-course-dashboard.test.mjs` and `academy-entrance-ui.test.mjs`. They cover account/workspace isolation, delayed-response guards, native roles, class context, joins, timetable grouping, draft guards and website-course separation. Updated the historical Course-card expectations to the owner's current programme-only Learn/Teach direction.
- JavaScript syntax checks and `git diff --check` passed.
- Browser review at 1440px desktop, 390px phone and 320px planner width. Checked programme Menu open/close, route focus, resizing an open drawer to persistent desktop tools, saved note/class context, and contained Admin table scrolling. User, assessment, calendar, enrolment, PDF defaults and programme/planner screens did not overflow the phone document.
- Large desktop header measured 82px; phone header measured about 216px. Preview screenshots are at the project `outputs/academy-workspaces-ui-20261031/` folder.
- No claim of real integration or production acceptance is made from the synthetic preview. PDF upload/rendering, external video playback, live joining, actual publications and complete memorisation data remain separate integration checks.

### Local review

Run `node backend/tools/academy-workspace-ui-preview.mjs` using Node 24 with its built-in SQLite support, then open `http://127.0.0.1:9031/`.

Choose Learn, Teach or Admin. These are synthetic accounts; preview edits and saves affect only memory and are reset when the server restarts. Each role change clears storage on this preview origin only. Other app ports and browser accounts are untouched.

The server binds only to loopback, uses a same-origin CSP, rejects foreign hosts/origins, blocks external navigation/fetch and live Join endpoints, stubs external date lookup and serves only the necessary local UI assets. Open Library uses an additional disposable native coordinator fixture. No real credentials, database snapshots or copied private media are present.

### Integration handoff / next owner review

Hold this branch for the owner's visual review. Do not merge or deploy it as part of the active Circles migration. Review the shared theme and native UI diffs against the then-current released Academy before connecting. Preserve the separate MOU monthly-access/timetable project, frozen website assets and Studio ownership boundaries. In particular, do not use this GUI branch to move MOU media, link recordings, change enrolment/access or re-run a migration.

Owner review can settle programme density, which bulk Admin tasks should have limited phone actions, and the desktop treatment of timetable/report design. No new teaching content or new feature is proposed in this checkpoint.

# V106.13 — Program management and timetable fixes

The owner authorised resolving all issues since V106.12 and pushing this batch on 11 October 2026, including Program management tabs. Deployment branch: `feature/105.3.4.13`. The development website and `devrebootworker` are the application; D1 remains authoritative and the production-named Worker remains legacy. No schema migration is required.

## Navigation and compact management

The selected Program shows its name, ID and one **Open Program management** link. Management has Timetable, People & classes, Library and Attendance tabs; Global Admin also has User profiles. Tabs retain the selected Program and reuse the existing authorised screens and unsaved-change protection. The compact header includes Home and Return to Program icons. Private Library attachments and Module subscriptions remain unfinished and disabled.

Academy home uses **Self paced learning opportunities for you** above image-only workshop/course posters. The `ummabbadacademy.com` overlay is part of each poster link. My Timetable has a Close link returning to its originating Program/Course, including after reload. Program/Course return navigation uses a large Home icon, and the Teacher pill says **Planning**.

## Program setup and teacher availability

- Program Zoom input remains editable after loading/saving; **Save Zoom link** persists it in the timetable draft. Precedence remains Program, session, then class.
- Opening an older editable Program with no class records creates its default editable `[Program] Class [Academy year]` through the normal revision-checked save. Existing/inactive class records are preserved. Class teacher selection is visible and optional; session validation still requires at least one teacher.
- Selected Subjects/Modules appear in a box beside **Add to Program**, with **Add New** underneath. Shared catalogue editing retains Global Admin authority.
- Teacher availability uses a Name / Availability / Edit table and the existing seven-day editor. Global Admin edits any eligible teacher, Program Admin edits teachers currently assigned to learning areas they administer, and teachers edit themselves. Historical teaching alone does not grant editing authority. Saves recheck current scope/session, retain audit/retry guards and notify relevant scoped administrators and Global Admins.
- No availability record or empty ranges means unrestricted availability. Validation, publication and the lesson preview inherit the class teacher even when an older lesson contains `teacherMode: NONE`; explicit session teachers still take precedence.

## Publication and exports

Publishing atomically activates a Draft Program, exposes it to the established authorised Home projection, saves the publication and updates the Program revision. A failed publication rolls everything back; retry replay does not activate or increment twice. Future effective dates remain enforced, default tomorrow. Published state survives reload; stale pre-publication Program edits receive a conflict instead of silently resetting it to Draft.

Program, teacher and class previews provide **Share image**, **Share PDF**, **Download image** and **Download PDF**. PDF output is explicitly one A4 landscape page. Native file sharing retains the user gesture; unsupported sharing falls back to downloading. Draft, Valid, Published, Archived and Cancelled presentation and live join checks remain in place.

The existing **Steps to My Rabb** publication was already Published, effective **12 October 2026**, while its Program remained Draft. After restoring and checking a private D1 backup and rehearsing rollback/retry rejection, a guarded, audited correction activated only that Program (ID ending `afba23df5a0c`, revision 3 → 4). Readback confirmed Active, visible and Published. All 73 accounts, 73 credentials, 102 role assignments, 13 publications and the timetable record were preserved. The other same-name Draft Program was not changed.

## Refresh the public homepage snapshot

As Global Admin, open **Academy administration → Refresh public timetable** after changing a public card or publication. The action rebuilds today's whitelisted public snapshot in the existing R2 bucket and replaces the local edge copy. Other cached copies update within **one minute**. The public card uses only the entered JSON time/title/description; it never derives those values from lessons or the Program name.

Visitors continue reading the durable daily snapshot, without background database polling. Short edge caching permits explicit refresh propagation without rebuilding from D1 on visitor requests. Refresh rechecks Global Admin authority before writing and uses an R2 ETag condition so concurrent refreshes cannot overwrite a newer snapshot. Failed refreshes preserve the previous snapshot. No meeting URL, teacher, class or account data is added to the public file. Signed-in timetables retain their daily/session cache and existing manual Refresh button.

## Verification

**138/138 local regression test files pass**, including scoped availability changes/revocation, class-teacher inheritance, publication activation/replay/stale edits/late rollback, public refresh authority/concurrency/redaction and landscape export geometry. The development Worker dry-run build passes.

Synthetic browser checks pass for older empty Programs, Zoom save/reload, class teacher selection, shared subject selection, all management tabs, publication/reload/fresh Teacher sign-in, explicit public snapshot rebuild, homepage posters, return navigation, availability editing and desktop/mobile layout. Native image/PDF share and download fallbacks pass. Actual exported Program, teacher, class and dense 60-lesson PDFs were inspected: each is one landscape page with content and Zoom annotations inside page bounds. Browser fixtures use only local synthetic data and disable outbound services; no hosted load tests or live synthetic users were introduced.

The [V106.11 handoff](WEBSITE-DEVELOPMENT-HANDOFF-106.11.md) and [V106.12 Program workspace notes](ACADEMY-PROGRAM-WORKSPACE-106.12.md) retain the agreed Course workflow, roles, shared catalogue, cache/access rules and unfinished teaching/media work. This release does not complete private media, Module subscriptions or the outstanding teaching tools.

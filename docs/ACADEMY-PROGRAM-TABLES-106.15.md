# V106.15 — Compact Program tables and public timetable refresh

## Program and timetable editing

The Programs grid adds an inline **Program Zoom link** column with the row's existing Save / Discard controls. The selected Program panel contains only its name, ID and Open Program management button. Zoom remains in the existing `academy_settings` record and saves independently of a published timetable. Free/Paid remains in the grid and shares the current User profiles value.

The explicit public-card editor returns to the Timetable tab. Time, title and description remain one JSON object with the existing 12 / 80 / 240 character limits, safe optional bold, Save card and Discard. Public cards use those entered values without deriving them from lessons or the Program name. Stale settings revisions cannot overwrite a newer Program decision.

Classes use compact spreadsheet-style rows for Name, optional Teacher and optional Zoom. Native Tab moves between fields; Ctrl/Command + Enter saves the row. Save and Discard enable only after a change, and new unsaved rows can be discarded. Academic year remains stored and is included in default class names. Content lists the linked shared Subjects/Modules in rows, with an Academy selector and Add to Program on the next row. Global Admin can open Add new Subject / Module from this section. These links reuse existing shared definitions and scope references.

The compact weekly planner retains its period/day editing and undo behavior. Save draft, Validate, Preview/share, Copy, Archive, Cancel and Publish now appear together below the board. Preview and history remain below it. Unsaved class or card entries must be saved or discarded before publishing.

## People and teacher availability

Rename People & classes to **People**. Show teacher availability opens a searchable popup, approximately 60% of desktop width and full width on mobile. Its compact table contains Name / Availability / Edit. Edit opens the recurring weekday and teaching-hours editor inside the popup; closing and reopening preserves unfinished entries, while Back to teachers confirms discarding changes. Saves retain the existing revision, retry receipt and administrator-notice behavior. Account changes clear protected popup content.

Global Admin can edit every eligible Academy teacher. Program Admin can edit only teachers assigned to their Programs; teachers retain access to their own availability through the teaching calendar. The backend filters the People list to permitted teachers and rechecks authority on edit and save. Missing or empty availability means unrestricted availability. The old availability table is removed from Timetable setup.

## Public homepage snapshot

**Publish this timetable** confirms publication, then automatically requests a public snapshot refresh. These are separate requests under the same button so their database work stays within Cloudflare Free limits. The refresh endpoint requires a committed publication belonging to a Program the current actor administers; it rechecks the session and authority before replacing the snapshot. It does not grant scoped administrators the separate manual Academy refresh action.

Future effective dates still control when new lessons start. The snapshot contains the same whitelisted public card and lesson references; no meeting URLs, teachers, classes, memberships or account records are stored. R2 replacement uses an ETag condition so competing refreshes cannot blindly overwrite one another. Edge snapshots can take up to one minute to pick up the replacement. No visitor polling or new Cloudflare binding is added.

A failed snapshot request leaves publication confirmed and explains how a Global Admin can retry. An exact publication retry returns the existing publication; retrying its snapshot replacement creates no second publication. The manual **Refresh public timetable** button moves to the **Academy actions popup**, visible only to Global Admins. It is removed from the separate Academy administration panel.

Timetable saves omit unrelated Library, task, progress, curriculum-editor and attendance-mark payloads. Teacher role grants use one JSON-based statement regardless of the number of assigned teachers. Current references, memberships, availability, attendance dates, permissions, transactional revision guards and immutable history remain checked. The synthetic three-teacher publication uses 49 D1 queries; its snapshot follow-up uses 29, each below the Free-plan 50-query limit.

## Verification and remaining work

All **138/138 local regression files pass**. Synthetic tests cover publication/refresh ordering and query budgets, future effective dates, snapshot privacy, scoped and revoked authority, failed storage, exact retries, availability list permissions, unchanged joining precedence and existing Course/Program workflows. The development Worker dry-run build passes. Desktop/mobile headless Chrome checks cover inline class saves and Discard, content selection, card save/reload, availability search/edit/clear, toolbar order, Zoom saves after publication, automatic snapshot refresh, the relocated manual action and page widths. Tests use only local synthetic data.

No database migration or live record correction is required. Deploy the matching frontend and development Worker through `feature/105.3.4.13`; the production-named legacy Worker is unchanged. The owner authorised the recorded batch after the temporary release hold.

Library and Attendance remain **Coming soon** as requested. Private media, subscriptions/permanent completion entitlements, Progress, Assessment, Planning, Announcements and remaining Module-to-Subject classification are still unfinished as recorded in the V106.11 handoff.

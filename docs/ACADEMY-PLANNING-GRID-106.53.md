# V106.53 — Weekly plan sheets and teacher/week grid

The user supplied the weekly-plan example and requested deployment on 13 October 2026. This update extends the existing V106.48 planner on the latest Features release V106.52 (`24153427`), preserving subsequent visitor activities, PDF tools and Academy home/access changes.

## Teacher plans and A4 sharing

One weekly plan belongs to a teacher and Program. Each subject/class combination has its own section; a teacher's plan can include more than one class. New Program suggestions combine repeated timetable lessons into one subject/class section, with the individual date optional. Existing saved plans, dates and revisions are retained.

The on-screen plan and generated A4 PDF show Weekly plan, the Program name, teacher and week starting. Subject/class headings sit across each boxed section, followed by the teaching content. Optional overview, objectives, resources and reflection remain available. The final Admin note box includes attributed, dated feedback and its submitted revision. Four short sections plus feedback fit on one A4 page; longer content continues in labelled boxes on additional A4 pages. PDFs are generated on demand and are not stored by the Academy.

## Admin grid

**Admin → Planning** shows a separate teacher/week matrix for each selected Program. Teacher names are rows and teaching weeks are columns. Eight neighbouring weeks load together (two earlier, the selected week and five later); earlier/later buttons move through the next eight-week window. The grid scrolls horizontally on phones with teacher names held in place. Submitted cells show a check, status, submission time and Open plan. Missing cells distinguish due and overdue. Open plan displays the submitted snapshot, including when the administrator is also the plan's author; newer private edits do not replace the submitted view.

Area/status filters, deadlines, individual extensions, admin comments, guarded retries and permissions remain available. Teacher drafts stay private. Course offerings use the same grid, with an additional Entire course column where that planning choice is used. Submitted plans by formerly assigned teachers remain visible in their historical cells.

## Course lifecycle

The scheduled end date no longer removes expected weekly Course plans. Teachers can save and submit weekly or entire-course plans until the Course offering is explicitly marked COMPLETE, CANCELLED or ARCHIVED. Planning checks the authoritative Course management stage, with imported state as a fallback, and the run's active flag. Closed Course plans remain readable and exportable; new saves/submissions are rejected. A closure concurrent with a submission is protected by the existing guarded D1 transaction and rechecked on retry.

## Verification and deployment

- 39 affected tests pass, including planning privacy, week-range bounds, correct teacher/week lookup, submitted snapshot selection, Course submissions after the scheduled end, all three closure states and concurrent closure rollback, plus Course management, entrance, shared controls and release/activation checks.
- 23 local Chrome acceptance checks pass, covering save/reload, interrupted-submit recovery, eight-week navigation, phone/tablet/desktop grids, sticky teacher names, submitted-cell opening, feedback, deadlines/extensions and permission checks.
- A one-page four-section weekly PDF with admin feedback and an 18-page Unicode Course plan are rendered and visually checked.
- The configured Development Worker dry-run build (1779.40 KiB, gzip 362.81 KiB), JavaScript syntax and diff/version checks pass.

No schema upgrade or live teacher-plan edits are required. The authorised Features push publishes the matching Development website and backend. Hosted verification checks build results, release versions, exact static-file hashes and authenticated route protection. Protected editing workflows use synthetic local accounts and data.

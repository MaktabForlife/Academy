# V106.48 — Teaching plans and admin review

The owner authorised building and deploying the planner, then confirmed continuation on 13 October 2026. Target: the Development website and matching `devrebootworker`, via `feature/105.3.4.13`. D1 remains authoritative. The release is based on V106.47 (`ce45ea17`), preserving its compact calendars and availability editors.

## Teacher workflow

Open **Teach → Program or Course → Planning**. Programs use one plan per teacher per week. For a Course offering, choose weekly or entire-course planning. A new plan suggests relevant timetable lessons, excluding breaks, and supports title, overview, dated lesson sections, class/group, subject, objectives, activities, resources and reflections. Teachers can save drafts, submit, edit and resubmit. Unsubmitted edits preserve the submitted snapshot available to administrators.

The responsive layout starts with one column on phones. Unfinished entries survive reload in account-scoped session storage; navigation warns before leaving an unsaved draft. Stale edits are rejected without silently replacing the saved version. Interrupted submissions and comments retain their operation identity, allowing a confirmed retry without duplicate records. Signing out clears private local planning state.

**Download / Share A4 PDF** generates a formatted, paginated document in the browser. It uses native file sharing where available, otherwise download. PDFs are not uploaded or retained by Academy storage. Unicode and Arabic are rendered into page images; the exported PDF is not searchable text. Draft exports are labelled Draft.

## Admin workflow and deadlines

Open **Admin → Planning**. The board includes expected plans that have not been started, with area, teaching week and status filters. It distinguishes due, overdue, submitted on time and submitted late. Administrators open submitted content and add dated, attributed feedback visible in the teacher planner. Feedback is linked to the submitted revision.

Global Admin sees all active learning areas; Program/Course Admin sees assigned areas. Teacher drafts remain private. Only the teacher edits their plan. Expected plans are derived from active Teacher roles and active Course offerings; individual lesson suggestions follow timetable teacher/class assignments.

Default weekly deadline: Sunday 18:00 before the teaching week. Default entire-course deadline: three days before the first lesson, at 18:00. Administrators can change defaults and grant individual extensions with a reason. Deadlines use the Academy timezone; late submissions remain allowed. Submitted plans retain their original deadline when default settings later change. Where an entire-course start date is unknown, its deadline is explicitly unset until configured. First submission and latest resubmission dates are recorded separately.

## Storage and release

Apply only additive migration `0023_lesson_planning.sql` after a private remote D1 export. It adds six planning tables, indexes and append-only history/comment protections. Existing accounts, teaching data, attendance and assessments are not rewritten. Mutations use the existing guarded D1 transactions, current-role checks, audit records and operation receipts.

The feature push publishes the matching website and backend automatically. Before release, the exact remote branch ref was checked against V106.47 (the local origin fetch configuration tracks only development, so its older feature tracking ref is not used to select the release).

## Verification

- Full backend regression: **148/148 test files passed**.
- Final affected tests: **19 passed**, covering scoping, private drafts, submitted snapshots, feedback, deadline rules, concurrent edits, atomic rollback, revoked authority and lost acknowledgements.
- Synthetic Chrome acceptance: **19 checks passed**, including teacher and admin layouts at 320, 390, 768 and 1440 pixels, save/reload/retry, whole-course submission, feedback, extensions and unsaved navigation.
- A4 exports: one-page weekly plan and 17-page Unicode course plan rendered and visually inspected, including page headers, footers and page breaks.
- Development Worker dry-run build passed: 1771.54 KiB, gzip 361.01 KiB. Syntax, version and diff checks passed.

Protected workflows were checked using synthetic local accounts and D1 data. Remote release verification checks versions, deployed asset hashes, unauthenticated access rejection and schema integrity; it does not submit plans for real teachers.

## Database activation — 13 October 2026

A private remote D1 export was restored locally and checked before migration. Only migration 0023 was applied. Remote verification confirms six new tables, two named indexes and four append-only triggers, with no foreign-key errors. Counts before/after match: 73 accounts, 12 learning areas, seven attendance registers, 49 attendance marks, nine assessments and zero assessment submissions. No existing records were rewritten.

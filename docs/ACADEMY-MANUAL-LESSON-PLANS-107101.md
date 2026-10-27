# V107.101 — Manual lesson plans

The user authorised implementation and Development deployment on 27 October 2026 after confirming V107.100 was deployed. This feature branch starts from `0e767b89` and preserves that release.

## Behaviour

Admin → Lesson plans opens a compact alphabetical table of active Programs and Courses within the Admin's scope. Each row shows Curriculum, Plans required and Open plans. The checkbox saves explicitly; Open plans appears only when checked and opens the existing teacher-by-week grid. Only actual manual submissions appear as document links, with the submission time; empty cells are neutral dashes.

Save draft remains private. Submit plan explicitly shares the chosen content with Admin. Subsequent saves do not change the submitted snapshot until the teacher submits again. Weekly and entire-course plans, existing course lifecycle permissions, accepted curriculum/class choices, loading another week, saved history, local unsaved-work protection, lost-acknowledgement retries, PDF download and single-image sharing remain available.

When plans are off, Teach menus, dashboard tools, upcoming Course links and direct planner routes no longer offer planning. The API rejects direct reads, saves and submissions, including a requirement disabled while a save is pending. Re-enabling restores access to the existing documents and history. Requirement metadata is read fresh outside cached timetable snapshots.

## Removed workflow

Remove deadline/status computation, expected or missing plan generation, dashboard reminder queues and their background requests, deadline defaults/extensions, per-session requirement overrides, feedback/comments and their PDF/image export sections. Legacy action routes return a retired-action response to authorised Admin callers and cannot mutate stored data. The only new Admin planning action changes the requirement checkbox.

Existing historical tables, revisions and legacy values remain intact and inert. Do not drop or rewrite stored plans/history. No database migration, private coordinator update, content publication or live settings change is required by deployment. Admins choose any later requirement changes themselves.

## Validation

- All 139 backend regression files pass across the complete run and focused reruns. Initial local-listener sandbox failures were rerun successfully with the local runtime permission; obsolete expected-plan assertions now check actual stored documents.
- 54 focused planning, authority, historical parity, query-budget and split-store checks pass; six actual Worker runtime checks pass. Requirement acceptance across Core/Admin, teacher revocation, private drafts, immutable submitted snapshots, idempotent retries, disabled access and pending-write guards use disposable synthetic fixtures.
- 40 browser checks pass: 320/390/768/1440 widths, alphabetical curriculum table, teacher/week grid and historical links, toggle off/on, privacy, manual submission, saved draft reuse/revert, PDF and image sharing, Android/iPhone-sized touch and account cleanup. No live accounts were used. Phone sharing is tested in Chromium with platform API stubs, rather than on physical devices.
- Matching V107.101 website and API dry-run builds pass, with release/cache integrity checks. Development release verification uses deployment metadata, public static bytes, the custom-domain HTML and one API readiness call, with no live account lookup, SQL, timetable publication or user-data changes.

Local evidence is under `outputs/academy-manual-lesson-plans/` and `outputs/academy-manual-lesson-plans-107101/` in the task workspace.

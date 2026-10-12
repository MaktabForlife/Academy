# V106.29 — Assessment phases

## Behaviour

- Admin creates a named phase in a Program or Course, then adds class assessments to it. Only classes in that learning area are offered.
- Schedule entries use the active Academy subject/module catalogue. The optional Subject descriptor can contain teacher initials, a name or a paper part; it does not assign an examiner.
- A shared subject can have separate assessment entries with different descriptors, dates, durations, marks and eventually different submitting examiners.
- Teachers and students see class timetables grouped by phase. Descriptors remain visible in timetable rows, assessment details, moderation/release cards and reports.
- The staff-facing Paper status is None when no PDF is attached. Publishing the schedule does not create a paper. PDF submission starts moderation as before.
- The Class and Subject/module fields use the same 44 px control height as the Assessment field, including explicit Safari select styling.

## Existing schedules and storage

Apply only `backend/migrations/academy/0018_assessment_phases.sql` to the development Academy D1 database before deploying the new Worker. It adds the phase table and two assessment columns. Existing assessment columns, recipients, papers, marking and releases are preserved. No phase is inferred and no timetable is imported.

Existing entries remain under Earlier assessments. Admin can open an unpublished entry, select its phase in Edit schedule and save it. The earlier restriction on changing a published schedule remains.

New UI entries require a phase. The API tolerates an omitted phase for previously cached clients; existing entries are never silently moved.

Phases enforce Program/Course administration scope, duplicate-name protection per learning area, exact retry receipts, transactional audit records and database scope constraints. Students only receive phases attached to their visible published assessments.

## Validation

- 14 assessment API cases pass, including scoped phases, duplicates, exact retries, rollback, stale schedule edits, descriptor/report persistence and None-to-moderation transitions.
- Real Chrome acceptance covers phase creation, equal form control heights, descriptor display, no-paper status, desktop/mobile layout, upload/moderation/release, student privacy and Arabic reports.
- Full regression: 141/141 files. Development Worker dry-run: 1667.28 KiB / 336.33 KiB gzip.

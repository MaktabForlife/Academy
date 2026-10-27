# Shared header, Menu and Imtehaan cards — V107.98

The user authorised deployment of the reviewed local changes on 27 October 2026. The release incorporates deployed V107.97 (`f2174a5f`).

## Behaviour

- Shared header: Academy/logo/version and date box above; welcome, yellow username-only highlight and highest role below on the left, with Home/Refresh/account/Sign out actions on the right. Preserve workspace/history navigation, PIN/account safeguards, Curriculum access and read-only Admin-Learn context.
- Standard white Menu/hamburger buttons replace visible Contents labels, including the Surah Kahf course. Close occupies a separate column beside Program navigation; dialogs keep their top-right X and existing dismissal/draft safeguards.
- Admin Coming up next shows up to four permitted Course cards in two columns at phone and desktop widths, with open arrows at the top right. Ordinary Learn/Teach retain their existing three-session selection.
- Dashboard Imtehaan uses two columns with small Program/Course name, register name, date window and open arrow. Show published schedules regardless of dates; exclude REGISTERED/DRAFT, COMPLETE, CANCELLED and ARCHIVED registers. Keep current class, account and publication filters.
- Include assignment-based Imtehaan using opening and effective due dates, respecting each paper's timezone and inclusive final day. No-date deadlines display From. The safe dashboard metadata contains no papers, marks or recipients; browser summaries use a new cache key.
- Reboot's missing card was confirmed with two bounded read-only Development metadata queries: its published papers are ASSIGNMENT/UNTIMED with no exam_date. They use available_from/due_at instead. No live records or assessment types are changed.
- Global Admin's Admin-Learn/Admin-Teach dashboard and Program/Course timetables bundle each day into one card per Program/Course. Keep every permitted lesson/class and its actions in the information dialog. Ordinary/scoped users retain existing grouping and authorisation.

## Local verification

- 114 focused checks pass across assessment operations/registers, shell, page actions, dashboards, entrance, course companion and workspace boundaries. The grouped-card follow-up also passes its entrance regression.
- Chrome and Safari-compatible WebKit each pass 130 browser checks at phone/tablet/desktop sizes, including 200% text, native assignment metadata, Imtehaan and upcoming grids, grouped timetables, Menu/Close geometry, keyboard focus, account switching, unsaved plans, Library/PDF reader and course navigation. No page errors; outbound browser traffic is blocked.
- Dashboard browser regression passes 16 checks with synthetic records, including assignments, past published schedules and protected summary metadata.
- Manual phone/desktop review confirms the reference header, separate Menu/X, single desktop Menu caption and nonduplicated lesson counts.
- Full release regression: 137/137 test files pass. Release-integrity and source-boundary checks pass (150 Academy modules, zero Google backend clients).
- Development API dry-run and website package build pass. The website contains 785 files, targets the existing Development API and has synthetic-only mode disabled. Version markers and changed static assets agree on 107.98.
- Hosted verification uses release/static metadata and one API readiness request after the Git deployment completes.

## Deployment scope

Publish the matching Development API and Academy website through the existing workflow. No schema migration, live material upload, data correction, timetable publication, settings/binding change or private coordinator deployment is required. Use only bounded release/static checks and one API readiness request after deployment.

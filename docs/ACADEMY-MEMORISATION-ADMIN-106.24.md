# V106.24 — Surahs and Duas: personal, class and administration views

All current memorisation entry points are labelled **Surahs and Duas**. The approved adult-ladies pastel module cards remain, in separate swipeable Surah and Dua rows. The personal introduction reads: “All registered users have free access to these surah and dua memorisation trackers.” followed by “Record your progress here.”

## Personal learning and visitors

The personal page contains only the current user's accessible modules and progress, with no class or administration tabs. Registered accounts can mark/unmark their own items; teacher confirmation remains separate. Admins and teachers have a Learn row below Teach.

Unregistered visitors can open public cards and try the checkboxes. A visible preview notice explains that selections are temporary. They live only in page memory; no save, receipt or browser progress storage is created. Refresh/reload resets them. Public `GET /api/academy/progress/preview` returns only public definitions, empty records and preview flags, without learner data, user lists or restricted modules. All writes still require authentication.

## Class teaching

Teach opens Surahs and Duas inside the selected Program page, replacing the timetable while retaining navigation and tools. Close restores the starting Program and scroll position, including after a pending-save reload. Return details and retries are session-bound.

Surahs and Duas each have a swipeable row of class cards. Cards open an inline learner-by-item grid, learners on the left and items across the top, with a subject-filtered module selector. Classes come only from active **Programs**; virtual Course/global Subject groups have been removed. Current teacher/class/lesson assignments, Program Admin authority, active students and dated class memberships govern access. No unrelated class opens automatically.

Global Admins set a per-Program learner limit: **5, 10, 15, 20 (default), 30, 40 or 50** per card. Larger classes appear as **Class X - 1**, **Class X - 2**, etc., in both subject rows. Each opens its learner slice; switching modules keeps that slice. Previous/Next move between slices.

## Progress Admin

Admin opens a separate page. Its plum navigation, ivory panels, responsive workbench, shared fields/buttons and save/recovery messages provide reusable styles for later admin pages.

Global Admin tools:

- **Modules:** create/rename modules, set Surahs/Duas and level, add/remove/rename items, and move items between modules. Renames and moves preserve item identity and progress. Removing items requires confirmation and removes only their progress.
- **Upload a list:** read the first worksheet of Excel or CSV (`ModuleName`, `TaskName`, optional `Subject`, `Level`), review classifications/access, then add or explicitly replace matching modules. Confirmed replacement resets only those modules' task progress.
- **Availability:** public (default), or selected active Programs and/or Courses. Restricted modules are hidden from visitors and users without a current role/subscription in a selected area. A Program grid accepts public modules or modules assigned to that Program. Server reads and writes enforce the restrictions. Global Admins retain complete catalogue authority.
- **User cards:** search users and deactivate/reactivate an individual personal card without deleting progress or changing teaching/account access.
- **Programs and Courses:** include/exclude areas from class progress and configure Program learner limits. Excluded Programs have no class cards or accessible grids, including for Global Admins. Personal progress is retained. Courses never create class grids. These settings do not change module assignments or account roles.

Scoped Program Admins can view their accessible catalogue and teach their Program classes. Academy-wide catalogue and user controls require Global Admin authority. Existing attendance and V106.23 Library behaviour remain.

## Release and validation

The owner authorised build and deployment when ready. Apply **only** additive migration `0014_memorisation_account_settings.sql` to the existing Development D1 database before the new Worker. It adds personal-card settings, module-area assignments, class-progress area settings and a feature flag. Existing modules default to public, personal cards to active, areas to included and limits to 20. It does not replace the 12-module/120-item seed or existing learner records.

Validation passed **140/140 backend regression files** and synthetic Chrome acceptance at all three widths. Checks use synthetic accounts/databases: full backend regression; privacy and permissions; Program/Course restrictions; exclusions and large-class slices; card settings; concurrent edits, retry and rollback; maximum-size query budgets; real website browser checks at 1440, 390 and 320 pixels; Excel/CSV imports; Worker dry-run build and diff/version checks. Live verification is read-only apart from the authorised additive migration and deployment. No real learner progress is reset.

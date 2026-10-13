# V106.44 — Zoom link notes

User-authorised Development release, 13 October 2026. Add a compact information button beside the Program Zoom column, class Zoom column and lesson Zoom field. The pop-up explains the joining order: Program, lesson, class. Program and class link changes do not require republishing; lesson-link edits require publication. The note opens by click, tap or keyboard and closes with its labelled close button, Escape or an outside click.

Joining now resolves the current single-class link even when a migrated Program has never had an explicit Program Zoom setting saved. Preserve a published Program default and lesson overrides, including explicit clearing of a Program default. Class-link clearing must not restore an old published class link. Timetable publications, dates, teachers, learner assignments and attendance records remain unchanged.

No database migration or live-data correction is needed. Release targets are the Development website, `feature/105.3.4.13` and `devrebootworker`.

Local verification: all 144 backend regression files passed, including the new D1 class-link change and clearing cases, original Program default preservation, existing link priority and immutable publication checks. Nine Chrome browser checks passed across 1440, 390 and 320 pixel widths for the three note locations, keyboard opening, labelled close, Escape, outside dismissal, focus return and viewport fit. Desktop and phone screenshots were inspected. The Development Worker dry run passed at 1715.81 KiB / 347.01 KiB gzip. Live version and static-asset checks follow publication.

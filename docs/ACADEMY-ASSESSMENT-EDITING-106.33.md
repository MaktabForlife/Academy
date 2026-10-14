# V106.33 — Edit earlier assessment schedules

Admins now see **Edit schedule** beside unpublished entries with no paper, including entries under **Earlier assessments**. This opens the saved schedule form, where subject/module, assessment title, descriptor, date, duration, total mark and assessment phase can be edited. The misleading **Attach paper** label remains available for teachers and published schedules where appropriate.

When the last earlier entry is assigned to a phase, returning to the schedule selects an available phase rather than leaving an empty earlier-entry view. Existing permission, revision, moderation and publication rules are retained.

Validation: all 16 assessment/API, Academy UI and version/routing checks passed, as did the development Worker dry-run. Chrome workflow acceptance passed, including opening an earlier entry, saving schedule fields and phase on mobile, returning to the phase, paper moderation, student submissions, marking, independent release, Arabic reports and session replacement.

No migration, automatic phase assignment, publication or live data correction is part of this release. Existing saved schedules are preserved. The assessment script cache URL advances to 106.33.

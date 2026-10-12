# V106.35 — Add dates to earlier assessment schedules

The Earlier assessments view previously offered editing for existing entries but no form for adding another date. Each earlier class timetable now includes **Add assessment date**. The form keeps that timetable's class and assessment name, starts with an empty subject and date, and creates a separate unpublished entry with no paper. Earlier timetables with different assessment names are shown separately.

Creation uses the existing authenticated D1 service, audited operations and retry protection. Its phase comes from the form itself, so dates added to an earlier schedule remain in that schedule. Existing dates, publication decisions and papers are preserved; there is no automatic reassignment or live data correction.

The timetable scroll container now anchors its hidden accessible heading, keeping horizontal scrolling inside the table instead of widening the phone page.

Validation:

- All 16 affected assessment API, Academy UI and version/routing checks passed.
- Chrome acceptance added two dates to an earlier schedule, checked the correct class/name and saved fields, refreshed the view, and confirmed the original entry was unchanged.
- An interrupted create response was retried without creating a duplicate.
- The new form fits 320, 390 and 768 pixel screens; saving was exercised at 390 pixels and on desktop. Touch controls retain a minimum height of 44 pixels.
- The existing editing, phase assignment, paper moderation, student submission, marking, separate release, Arabic report and session replacement workflow passed.
- Development Worker dry-run passed: 1691.46 KiB upload / 341.87 KiB gzip.

Assessment JavaScript and CSS cache URLs advance to 106.35. Release markers are synchronised. No migration is required. This is a correction to the previously authorised development deployment; the proposed Assessment Registry remains a separate design review.

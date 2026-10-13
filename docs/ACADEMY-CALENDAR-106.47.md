# V106.47 — Calendar editors and availability

## Screens and access

- Availability shows a compact current list, Edit and + Add. One form opens below for Available/Unavailable, weekday pills, Weekly, 24-hour From/To times, All day and date pickers. Save returns to the list. Cancel retains saved entries. Removal and unknown-outcome retry use the existing guarded transaction.
- Admin in Learn receives learner calendar data with no teacher availability or management controls. Teach permits own availability, including an Admin who is not separately designated Teacher. This grants no teaching role. Central Admin Calendar retains teacher selection and term/holiday/Hijri management; scoped Admin authority remains scoped.
- Terms, Academy Holidays and Hijri dates each have a compact list with Edit/Delete and an Add form. SA public holidays are included in the holiday list and can be moved or suppressed for an individual year.
- Custom Academy holidays can repeat their Gregorian month/day annually. An Annual Hijri checkbox retains a significant-day label for future years, with Date needed until its yearly date is entered. Saving another year creates a new dated record and retains earlier dates. Concurrent annual-label changes reject a stale editor.
- First Taraweeh is omitted from calendar delivery and the Hijri list. Its imported record is preserved. Ramadaan uses the explicitly saved First Fast date, with the existing fallback for older records.

## Lesson behaviour

Academy/Program no-teaching holidays mark projected lessons Holiday and remove joining references, including cached-link rechecks. Published lesson records are retained. Teaching hours omit those dates. SA public holidays default to no teaching. Hijri dates and derived Islamic periods are informational and do not block lessons.

## PDF comparison

The six-page user attachment Significant-Days-of-the-Islamic-Year-2025-to-2030-for-South-Africa.pdf was extracted and visually reviewed. All 36 Most Likely Date entries after excluding First Taraweeh already matched active saved calendar records: six per year for 2025–2030. No import or live date correction was needed. Predictions remain editable annually. The source was read only.

## Validation and deployment

147 regression files and 150 responsive Chrome checks cover editor CRUD, day pills, 24-hour normalization, dated/all-day entries, lost-response exact retry, context-specific Admin access, Annual behaviour, calendar history, holiday join prevention and scope guards. The Worker build is checked before release.

Recurrence flags use the existing Academy settings storage inside the calendar save transaction. No database migration, credential change or live calendar-record import is required. Functional browser tests use isolated synthetic databases.

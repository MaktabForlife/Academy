# V106.46 — Academy management and calendar refinement

## Behaviour

- Manage Users has User Details, Programs, Courses and Global Users tabs. Global designations use the existing Save all and permission checks; your own Global Admin designation remains protected.
- Filter replaces the toolbar status dropdown. Its popup applies separate user, Program and Course status filters. Cancel leaves the current filters unchanged. The defaults hide inactive users and archived/cancelled learning areas; management lists still offer all statuses.
- Vertical swipes can leave the user table and return to the heading on mobile. Desktop table containment remains unchanged.
- Cancelled and archived items are excluded from navigation, including the all-Courses list. Manage Programs and Manage Courses retain their records.
- Manage Programs has a Lesson media tab. It reuses the existing Mothers of the Ummah lesson-media editor, private PDF attachments and discussion management. Other Programs retain Coming soon until their media support is implemented. Unsaved entries and delayed responses remain guarded.
- Global Admin can view learner screens across Academy learning areas. Scoped Admin can preview only assigned areas. Learner assessment previews omit private student results, submissions and staff controls, respect publication and paper timing, and do not create Student assignments. Learn displays media without management controls; editing belongs in central management or Teach.
- Opening any existing Academy/Program calendar section displays the full monthly calendar inline, with no second Open Calendar step. Embedded calendars resize to their content and omit duplicate banners.
- Learner and teacher calendars hide the calendar/course selector. Teacher calendars also hide the teacher selector while retaining the current teacher’s availability. Standalone Admin calendars retain management selectors. Admin and Teach highlighting follows the current account’s authority.

## Validation

147 regression test files passed, including scoped learner previews, media access, global designation saving, cancelled filters and delayed account responses. Chrome acceptance covers 143 responsive checks, native mobile table gestures, calendar expansion and role-specific selectors. Full lesson media and assessment browser workflows cover private files, retries, moderation, release and Admin previews.

This release uses the existing schema and requires no live database migration or record correction. Browser acceptance writes only to isolated synthetic databases and storage. Deployment targets the Development website and matching Development Worker.

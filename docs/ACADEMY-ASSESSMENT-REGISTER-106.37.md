# V106.37 — Assessment Register and sessions

## Admin workflow

1. Open **Assessment Admin → Assessment Register**.
2. Add an assessment, such as Final 2026. Select one or more Programs/Courses and either one class or All classes.
3. Select a table cell to edit its name, areas, class selection or status. Save metadata changes. Existing dates cannot be orphaned by removing their class or learning area.
4. Select **Open → Add session** to add each dated subject/paper. Sessions retain their own class, learners, examiner, paper, submissions, marks and releases.
5. Select a tracking status, press **Validate**, resolve outstanding requirements, then press **Change status**. The same actions are available when editing the Register row. Validation is read-only; saving repeats the checks against current data.
6. Open a session and choose **Delete session** to remove it from the active schedule. A confirmation names the subject and date. Audit and private attachments are retained. Sessions with learner access, submissions or marks cannot be deleted.

The info button explains the actor, location and action for every stage. The table scrolls within its card on mobile, with only the assessment name frozen. Session forms retain matching 44-pixel controls.

## Status validation

| Tracking label | Requirements |
| --- | --- |
| Registered, Draft | Valid name, areas and class selection. |
| Scheduled | At least one session; every session has a subject, date, duration and total mark. |
| Schedule released | Every session schedule is released with an eligible learner list. |
| Awaiting moderation | All session PDFs submitted or approved; at least one awaits moderation. |
| Approved | Every session paper has moderator approval. |
| Published | All schedules released and approved papers published using release controls. |
| In progress | Publication checks and at least one session started. |
| Ready for assessment | At least one answer received. |
| Assessed | Every latest received answer assessed; returned marking must be revised. |
| Moderated, Ready for release | Every latest received answer has approved marking. |
| Released | Class marks released for every received answer. |
| Complete | Release checks, all session dates arrived and no outstanding authorised resubmission. |
| Cancelled, Archived | Valid register metadata; tracking labels retain the record. |

Later stages include the earlier publication checks. Checks cover received answers; missing submissions do not authorise anyone else's result release. Feedback and marked scripts remain independent decisions and are not required to release marks or mark completion. Tracking labels never publish content or change student access. An examiner cannot moderate her own paper or marking.

## Data and compatibility

Migration `0020_assessment_register.sql` adds register headers, area associations, session links and deletion metadata. Named phases become register entries. Earlier unphased schedules are grouped by their existing learning area, class and shared title. Original IDs, dates, revisions, files, learners and results remain intact. Cached clients retain compatible phase and session APIs.

Before deploying the Worker, back up development D1, inspect the pending migrations, apply only 0020 and compare the existing assessment fields and counts. Deploy the development Worker with dashboard variables retained, then publish the matching frontend. No live dates or marks are created by this release.

## Validation

Ten register API cases and the existing assessment API suite cover permissions, shared scope, metadata edits, exact retries, conflicting writes, transaction rollback, migration preservation, every status prerequisite, renewed validation after intervening changes, protected deletion and attachment privacy. Chrome acceptance uses isolated D1/R2 fixtures and the actual Academy page, including 320/390/768-pixel table and form layouts, filters, rename, Open/back, repeated session creation, interrupted-save retries, deletion, moderation, submissions, marking, separate releases, Arabic/custom reports and account changes.

Full regression: **143/143 files passed**. Development Worker dry-run passed (1707.73 KiB / 345.56 KiB gzip). Migration 0020 also passed against a private copy of the development backup, preserving all nine existing sessions and all 94 pre-existing table counts.

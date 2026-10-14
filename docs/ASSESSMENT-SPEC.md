# Academy assessments — agreed specification

## Authority and workflow

- Academy time is Africa/Johannesburg throughout.
- Admin publishes the assessment schedule with class, subject, title, date, duration and maximum mark.
- PDF attachments only for paper authoring, student answers and marked scripts.
- The teacher submitting a paper for moderation becomes its examiner and assesses submissions.
- Any authorised admin can moderate. An examiner who is an admin cannot moderate their own assessment, including its marking.
- Paper moderation: submit → return with comments or approve → explicit admin release.
- Batch paper release never permits access before 03:00 Johannesburg on each exam date.
- Record first successful paper access and every successful answer submission. Reopening does not reset first access. Duration never blocks access/submission or causes forced submission/automatic penalties.
- Admin authorises replacement submissions. Assess the latest successful upload; retain earlier versions. Failed uploads do not replace a successful answer. Replacement clears that learner's obsolete result releases and requires marking/moderation again.
- Examiner enters mark/feedback and attaches a marked PDF, then submits for moderation. Admin returns or approves. Approval alone releases nothing.
- Marks release is a whole-class action for an assessment. Feedback and scripts have independent whole-class or selected-student releases. Each student sees only their own records/files.
- Whole-class marks release requires every received latest submission to be moderated; non-submissions remain pending, never silently zero.
- Use current authorised classes and snapshot eligible learners when the schedule is published. Allow admin roster refresh before submissions begin. No historical attendance/progress migration is required.

## Reports and UI

- Arabic right-to-left reports with Academy logo, learner identity, Program/course, class, academic year/period, subject, assessment, mark, maximum and overall total. Pending results and partial totals are explicit.
- Admin can upload a picture or PDF report design, position dynamic fields and a repeating result table, preview, save and reuse it. Generated reports are private PDFs in R2.
- Assessment teaching/student screens replace the timetable area inside the Academy Program page, with Close returning to that Program. Dedicated admin workspace uses the same visual system.
- Every screen has an accessible ⓘ help panel explaining its role-specific process, current stage and next responsible action.
- Private R2 stores papers, answers, scripts, templates and generated reports. D1 stores workflow records, marks, release authority, versions and audit events. Never use the existing public media bucket for assessment files.
- Scope existing Global Admin/Program Admin/course authority correctly; preserve teacher/class assignments and student enrolments.

## Delivery

Build and test the eight agreed stages, maintain ASSESSMENT-PROGRESS.md, then push the completed module to the existing feature release branch with a fresh version. A push is authorised by the owner's 12 October instruction. Production deployment is outside this build request.

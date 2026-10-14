# V106.28 — Assessment schedule review

- Remove the “ASSESSMENTS · JOHANNESBURG TIME” header line. Academy time remains Africa/Johannesburg.
- Replace free-text Subject with active Subjects and Modules from the shared Academy catalogue. Module choices show their parent subject. The backend resolves and validates the selected entry, saving its label as a historical snapshot; previously entered labels can be retained when editing an existing draft.
- Show each class’s assessments in date order in a timetable on student, teacher and admin schedule screens. Students see only published assessments assigned to them, and papers stay private until authorised release and the 03:00 boundary. Teachers open timetable entries to attach PDFs for moderation.
- Examiners can set duration and total mark when uploading a paper, and revise these details separately before release. A detail change returns an approved paper to moderation, uses existing revision/retry guards, and is audited. Other teachers/students and admins who are not its examiner cannot make that change. Released papers retain their details.
- The owner is entering the schedule. No timetable data is imported and no database migration is needed. Existing schedules, papers and learner records are preserved.

## Validation

All 141 regression files pass, including 12 assessment API cases. Real Chrome acceptance covers subject selection, timetable navigation, 390-pixel mobile layout, PDF moderation/submission, result privacy and report generation. The development Worker dry-run bundle succeeds. No migration is required.

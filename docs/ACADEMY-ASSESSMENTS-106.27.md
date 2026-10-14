# V106.27 — Assessment module

## Result

Assessment administration now has Schedule, Moderation, Release and Reports & designs views. Program/Course teaching and personal assessment screens replace the timetable inside the existing Academy page. Close returns to that learning area. Each screen includes an information button explaining the process and responsible roles.

The teacher submitting a paper is its examiner. Another authorised admin moderates papers and marking; an admin examiner cannot moderate her own work. Approved papers need explicit admin release and open from 03:00 Africa/Johannesburg on the exam date. First successful paper access and every successful PDF submission are recorded. Duration is informational and never blocks access or submission. Admin-authorised replacement answers retain previous versions and make the latest successful version the marking source.

Class marks, feedback and marked scripts have separate release actions. Marks require all received latest submissions to be moderated and release to the class together. Feedback/scripts allow selected learners or the class. Students can retrieve only their own released results and files. A corrected mark or replacement answer withdraws obsolete releases for that learner; other learners' released results remain available.

Arabic A4 reports include the Academy logo, learner, Program/Course, class, period, year, subject, assessment, maximum mark and total. Pending results are explicit and excluded from the issued total. Long result lists continue across pages. Admins can upload one-page PDF/PNG/JPG backgrounds, drag fields or set their positions, preview, save scoped reusable designs and issue private learner PDFs. Generated Arabic PDFs preserve shaping by embedding rendered pages; their text is not selectable. Existing artwork is not interpreted as form fields.

## Storage and activation

This commit prepares the module and pushes it to `feature/105.3.4.13`. It does not deploy a Worker or change the live D1 database.

Before activating the module in an environment:

1. Back up the target D1 database, then apply additive migration `backend/migrations/academy/0016_assessments.sql` using the existing Academy migration process. It adds assessment tables and indexes; it does not change attendance or memorisation records. Verify the migrations ledger so existing migrations are not reapplied.
2. Create a dedicated **private** R2 bucket: `maktab-assessments-private-development` for the development Worker, or `maktab-assessments-private` for the root Worker. Bind it as `ASSESSMENT_BUCKET`, as configured in `backend/wrangler.jsonc`. Keep R2 public access/custom domains disabled. Do not reuse the public `MEDIA_BUCKET`.
3. Deploy the corresponding Worker with existing D1/session settings preserved, then publish the website assets together. The root Worker still needs its existing D1 activation settings; the new binding does not perform a cutover.
4. Check a synthetic assessment through paper upload, moderation, release, answer submission, marking, moderation, independent releases and report download. Verify a second learner cannot open those files. Check the deployed 03:00 boundary and desktop/mobile navigation before using real assessments.

All attachments have a 16 MiB limit. Paper, answer, script and generated report uploads accept PDF only. Design backgrounds additionally accept PNG/JPG. Uploads stream to R2 with a SHA-256 checksum; D1 records commit only after storage succeeds. A database failure removes the new orphan object. D1 receipts make exact retries safe, and record revisions reject stale edits. There is no public file URL or bearer token in a download URL.

R2 and D1 cannot share one distributed transaction. A Worker termination between object storage and D1 commit may leave an unreferenced private object; it never becomes a visible submission. Retain referenced versions and audit records; any later orphan cleanup must compare object keys with `assessment_files` and allow in-flight uploads to finish.

## Validation

- Full local regression: **141/141 test files pass**, including ten new assessment API cases.
- Native D1: scope/ownership, self-moderation, return/revise/approve, atomic batch paper release, exact 03:00 gate, unrestricted late submission, authorised resubmission, retained versions, independent result releases, concurrent edits, rollback, report/layout permissions and stale report withdrawal.
- Real Chrome, synthetic accounts/database/private R2: complete admin → examiner → student → examiner → moderator → student flow; desktop and 390 px mobile; same-Program Close; PDF answers/scripts; lost response and exact retry without duplicate; picture/PDF report backgrounds; multi-page Arabic export; delayed admin response discarded after switching to a student. No browser exceptions.
- Exported one-page report and the final page of a four-page Arabic report rendered with Poppler and visually reviewed for RTL text, table alignment, pending results, totals and page numbering.
- Local Workers/R2 simulator: real `FixedLengthStream` upload succeeds with the correct SHA-256 and rejects a bad checksum, using the configured 2026-06-01 compatibility date.
- Wrangler 4.136.3 development dry run succeeds (1,661.57 KiB / 335.21 KiB gzip); runtime type generation confirms `ASSESSMENT_BUCKET: R2Bucket`.
- Version markers, JavaScript syntax and diff whitespace checks pass.

The checks use synthetic records. No real exam schedule, paper, learner answer or mark was created, imported or released. The supplied Year 4 timetable remains a reference for admin entry; no year, maximum mark or duration was invented.

## Repeating checks

Run `npm run test:assessments` or `npm test` in `backend/`. Browser acceptance requires Playwright and Chrome; `ASSESSMENT_BROWSER_RUNTIME` can point to the Playwright package and `ASSESSMENT_CHROME_PATH` can choose a browser. Run `npm run test:assessments:browser` in `backend/`. Evidence goes to a temporary directory, overridable with `ASSESSMENT_ACCEPTANCE_OUTPUT`.

Run `npm run test:assessments:r2` in `backend/` with the local Wrangler/Miniflare dependencies installed. `ASSESSMENT_WORKERS_RUNTIME` can point to another dependency directory. This check uses local simulated storage only.

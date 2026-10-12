# Assessment build progress

Specification: [ASSESSMENT-SPEC.md](ASSESSMENT-SPEC.md).

| Stage | Deliverable | Status | Validation |
|---|---|---|---|
| 1 | Screens, navigation and process help | Complete | Real Chrome desktop/mobile walkthrough and same-Program Close pass |
| 2 | D1 records, permissions and private R2 | Complete | Native D1 permission, transaction, checksum and orphan cleanup tests pass |
| 3 | Schedules, papers, moderation and timed release | Complete | Return/revise/approve, atomic batch release and exact 03:00 boundary pass |
| 4 | Student submissions and authorised replacements | Complete | Failures, exact retries, ownership and retained versions pass |
| 5 | Marking and moderation | Complete | Examiner ownership, self-moderation rejection, stale revisions and held results pass |
| 6 | Independent release controls | Complete | Whole-class readiness and selected feedback/script privacy pass |
| 7 | Arabic reports and uploaded templates | Complete | PNG/PDF backgrounds, saved design, private issuance and four-page Arabic export pass |
| 8 | Acceptance and feature handoff | Complete | 141/141 regression files, ten assessment cases, browser, R2 simulator, bundle and version checks pass; delivered as V106.27 |

## Decisions and observations

- Starting checkout is clean at b77286d (V106.26). Existing Assessment buttons are placeholders.
- Reuse current Academy page/role patterns; add dedicated assessment endpoints and a private ASSESSMENT_BUCKET binding.
- Scope all downloads through authenticated endpoints; no public R2 URLs or transferable query-string bearer tokens.
- Resubmissions invalidate only the affected learner's obsolete releases; other learners keep already released results. Corrected marks return through the whole-class marks release action.
- Report templates use explicit field placement, rather than inferring fields from uploaded artwork.

## Evidence log

- Initial inspection: repository clean; current navigation, session, guarded D1 transaction and native SQLite test-fixture patterns reviewed.

- Stage 2–6: nine assessment API tests pass against the native D1 fixture, including concurrent moderation and database rollback.
- Browser walkthrough reached Arabic report issuance and student results on a 390 px screen. It exposed direct-link Close returning to home; corrected to the same Program page and rerunning acceptance.

- Stage 1/7: complete real Chrome acceptance, including PNG/PDF design uploads, multi-page report and a delayed admin response after account replacement. No browser exceptions; no mobile page overflow.
- PDF visual review: one-page export and last page of four-page Arabic report checked for joined Arabic text, RTL columns, pending result, subtotal and page numbering.
- Stage 8: 141/141 regression files pass. The only initial full-suite failure was an old configuration test assuming MEDIA_BUCKET was first in the binding list; changed it to check named bindings and distinct private development/production buckets.
- Actual local Workers/R2 smoke validates fixed-length PDF streaming and checksum rejection at the Worker’s configured compatibility date. Dry-run bundle and generated R2 binding types pass.
- Final remote/version/diff review and feature push remain. Production deployment and live migration are outside this build.

## Final handoff

V106.27 is the completed module for `feature/105.3.4.13`. The feature branch Git history is the delivery record. Remote branch was checked at b77286d immediately before this release; no intervening update was present. Release version consistency and final diff checks pass.

A tenth API case also verifies inherited Global Admin access and rejects scoped-admin, teacher and student changes outside their authority. Activation requirements and operational limits are recorded in [ACADEMY-ASSESSMENTS-106.27.md](ACADEMY-ASSESSMENTS-106.27.md). No live migration or Worker deployment was performed.

## V106.28 — Schedule review

- Owner is building the schedule; no timetable import. Requested header removal, shared Subject/Module choices, a timetable for learners/teachers and examiner editing of duration/total mark.
- Development V106.27 503 resolved separately by backing up D1 and applying only migration 0016. Eight assessment tables verified, authenticated endpoint returned 200, desktop/mobile screens passed and all 80 existing table row counts were preserved.
- V106.28: 141/141 regression files pass, including 12 assessment API cases. Real Chrome acceptance passes with the Academy selector, timetable, examiner upload, moderation, separate releases, report generation, session replacement and mobile layout. Development Worker dry-run bundle passes (1664.24 KiB / 335.77 KiB gzip). No migration is required.

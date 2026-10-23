# Academy separation final implementation brief

Authorisation updated 23 October 2026: complete Phase 4 and the Development checkpoint, then begin Phase 5 on isolated feature-split-db with fresh dev-academy-admin and dev-academy-core. Copy active/unarchived records only. Hold Phase 5 merge into feature-admin and current Development routing until the user reviews Phase 4. Keep layouts and direct manual controls.

Implementation authorised 22 October 2026. Phases 0 and 1 are complete on `feature-admin` at V107.23; Phases 2–6 follow the agreed delivery gates. See the [Phase 1 execution record](phase-1.md). Preparation is complete at the design level. This brief, the final access map, data ownership and phased plan are the active instructions. Current implementation evidence is recorded separately below. They replace the earlier expanding review proposals.

## Required checkpoint before database separation

Complete and verify the UI work in Phases 1–4, then push and deploy the compatible website and Worker to Development. Confirm that release is working and retain its recovery checkpoint before beginning Phase 5 database splitting. The current Phase 2 implementation remains on `feature-admin` and preview only. See the [required checkpoint in the phased plan](implementation-plan.md#required-checkpoint-complete-the-ui-and-release-development-before-splitting-databases).

## Scope and settled decisions

Keep the current layouts and one shared sign-in. Give Admin a separate management entry. Learn always uses the student perspective and Teach the Teacher perspective, including when the account is Admin. The server must enforce the same boundary for JSON, direct/old routes, uploads, files, exports and cached responses.

Global Admin retains Academy-wide authority and inherited area administration. Scoped Admin remains within assigned Programs/Courses. A workspace does not grant a role, enrolment, paid-media entitlement or examiner identity. An authorised preview is read-only and records no participant action.

Time zone is one app-wide setting, editable only by Global Admin. All areas and assessment deadlines inherit it; preserve already effective instants and recorded history.

## Manual assessment work

Provide direct scoped Admin controls to upload/replace answers on behalf of a learner, record or revise marking, attach a marked PDF, finalise and explicitly release results. Record the real Admin actor and the correct learner. Admin may finalise manual marking without a separate moderator; ordinary Teacher/examiner self-moderation rules stay unchanged.

Admin handles acceptance, remarking and decisions about already released work manually. Uploading an answer or saving a mark is not a release command. Reuse the ordinary assessment records, current-file references, history and explicit Admin actions. Preserve original files and existing records.

Do not build a manual-case entity, case state machine, separate manual marking lane, supplemental-release engine, automatic hold/reinstatement policy, case cancellation/correction coordinator or new typed manual-result/report subsystem. Do not automate those decisions. Ordinary identity, scope, current-record validation, file binding and retry handling remain necessary.

## Ordinary assessment rules

Question papers: Waiting for submission, Drafted, Returned, Approved, Published, Released.

Answers: Waiting → Uploaded → Checked → Ready for assessment → Assessed → Moderated → Marks released. Ready is selected manually when all expected answers are uploaded and checked, or from the next Academy day. If received papers are unchecked, warn Admin and offer Cancel / Continue anyway. Next-day Ready may have zero uploads; show true counts and never infer checks, marks or release from an empty set.

Exams retain first-access timing when timed, the Admin-adjustable 15-minute reading/printing allowance, and learner uploads only on the exam day. Later handling is manual Admin work. Previously agreed earlier-date/allowance adjustments are direct Admin edits, not a new exception-grant workflow.

Support explicit untimed assessments with no countdown and null duration. Assignments may have future due dates, such as six weeks. They stay open after due, accepted late work is flagged Late, and Admin may extend the due date or close submissions. A due date is not writing duration. For date-based Ready availability on an assignment, use the effective due date as the reference day; it never starts from publication/first access. This is the technical interpretation of the existing next-day rule, not an automatic transition.

Learner screens/JSON/exports omit configured writing duration, inline marks, maxima and percentages. Valid released reports show achieved marks only. Staff retain permitted marking information. Preserve paper approval, ordinary moderation and explicit release independently of setup publication.

## Media and other retained policies

Admin owns general lesson/video/PDF curation and publication. Teach retains ordinary authorised reading and verified own-note Post/replace/withdraw; no general editor. Preserve historical/permanent recordings and current Course entitlements. Attendance delivery rosters do not create a media entitlement.

Retain the current timetable/media icons, attachment chooser, Library links and PDF tools, including V107.20 comparison and V107.21 editable annotations/favourite colours. Include the independently committed V107.22 media names and dateless Course PDF collection: labels preserve original filenames; Course PDFs are Admin-managed, published independently and not tied to one session. No new Teacher collection-management right.

Official library editing stays Admin; existing shared Open Library curation becomes Global-Admin-only when Teacher curation is removed. Personal My links remain owner-only outside Academy D1, including continued own use after role loss as already confirmed. Keep attendance/substitute/dated-roster and memorisation decisions from the confirmed policy record. The previously confirmed development-only attendance fresh start remains a Phase 3 task when implementation is requested; no old attendance conversion is required and no reset happens now. Discussion stays retired from the target; retain history.

## Final maps and delivery

- [Access map](access-map.csv) gives the permitted reader/writer for each feature and the matching server action.
- [Screen map](screen-map.csv) covers all 24 current Academy/Program/account pages plus embedded families.
- [Data ownership](data-ownership.md) assigns masters, accepted references, live records, storage and history.
- [Phased implementation plan](implementation-plan.md) sets order, checks, migration gates and rollback.
- [API map](api-map.csv) and [field map](field-map.csv) provide the detailed contracts and source-column placement.

Use one Worker initially, with Admin/Core service boundaries before physical moves. Add the Admin database only when the selected family is ready to move; keep attendance/memorisation/identity in Core. The existing Open Library metadata store and R2 homes remain. A third Academy learning-record database is deferred.

The [decision trace](decision-trace.csv) links the settled choices to access families, delivery phases and future acceptance checks. The [technical contracts](technical-contracts.md) supplies the current publication, file, operational and compatibility rules; archived proposals are not additional requirements.

## Design baseline and original readiness record

Source captured initially at V107.20, d9848a7cdb60a13bd4f78439131e9146c57acaa6, with independent media changes already in progress. During preparation, other work was committed as V107.21 (426ce09c, editable PDF annotations/favourite colours) and V107.22 (82cf5e8cd7d9cecb8d02650431b4de2cf51658d3, media names/Course PDFs). Final maps align to those committed additions. Assessment business handlers are unchanged from the reviewed baseline. The schema reference is 108 tables / 748 columns through source migration 0031; no live schema/application was inspected. Latest deployment confirmed by the user remains V107.17. This preparation did not edit, commit or deploy application files.

Source alignment, executable validators, tests, performance measurements, backups and migration rehearsal are phase deliverables during implementation; they are not additional policy-design tasks. Implementation has been requested. Phase 0 baseline checks are reported separately; the 118 separation acceptance scenarios remain NOT RUN until their relevant changes exist.



The Phase 0 execution record is [phase-0.md](phase-0.md). Development is paused by the user while separation proceeds. Preserve existing layouts and direct manual Admin handling.

## Current execution records

[Phase 1](phase-1.md), [Phase 2](phase-2.md), [Phase 3](phase-3.md) and [Phase 4](phase-4.md) record implemented changes and actual verification. [Implementation evidence](implementation-evidence.csv) distinguishes isolated checks from live verification and future physical-cutover work. The original 118-scenario matrix and baseline counts above are historical planning evidence. Use the [new field delta](field-map-phases-2-4.csv) with the original maps.

Preview V107.27 is verified and shared migrations 0033–0035 are approved/applied with original data preserved. V107.28 prepares the matching Development release. The [UI/Development checkpoint](ui-development-checkpoint.md) and its final deployment attestation must be complete before Phase 5 starts.

The current [database use and legacy notes](database-carryover-notes.md) and [carry-over register](database-carryover-register.csv) record active dependencies, retired workflows and default exclusions for the future database. Use these with the field/settings maps; legacy names and empty tables alone are not exclusion evidence.

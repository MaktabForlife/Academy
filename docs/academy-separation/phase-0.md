# Phase 0 execution record

Completed 22 October 2026. The user authorised staged implementation and paused unrelated development. Phase 0 establishes the source/deployment baseline and reusable isolated checks. Phase 1 is next. No layout, application permission, live data or storage ownership is changed in this phase.

## Confirmed baseline

- Local `development`, remote `development`, website and API agree at V107.22. Source commit: `82cf5e8cd7d9cecb8d02650431b4de2cf51658d3`.
- Live schema metadata matches saved source: 108 business tables, 748 columns, 45 explicit indexes and 39 triggers. Table columns, foreign keys and normalised table/index/trigger definitions match. Infrastructure tables `_cf_KV` and `d1_migrations` are separate.
- Migration 0031 is already applied. The ledger records 0024–0031; the earlier schema came through the Core import/activation. Do not replay 0001–0023 because their ledger names are absent.
- The deployed `ACADEMY_DB`, three R2 bindings and existing `ProgramTimetableCoordinator` class match current configuration. Retain their current homes. Secret values and business records were not exported.
- V107.20 PDF comparison, V107.21 editable annotations/favourite colours and V107.22 named media/dateless Course PDFs are included in the baseline.

[Baseline summary](phase-0-baseline.json) records the non-sensitive execution facts. Full hashes, schema comparison, test logs and synthetic screenshots remain in the local task's Phase 0 evidence directory, outside the shipped application.

## Executable preparation

[The baseline tool](../../backend/tools/academy-separation-baseline.mjs) captures saved source hashes, migration/schema facts, existing binding names, route references and writer candidates. It never connects to cloud services or loads local secret files. It refuses to overwrite an earlier evidence file. Its preservation check compares the original tracked files.

From `backend/`:

```sh
node tools/academy-separation-baseline.mjs --out /private/tmp/academy-separation-baseline.json
node tools/academy-separation-baseline.mjs --verify /private/tmp/academy-separation-baseline.json
node --test tests/academy-separation-phase0.test.mjs
```

[The shared fixture](../../backend/tests/fixtures/academy-separation-fixture.mjs) uses memory-only SQLite and a separate R2 map per instance. It includes the full current schema, disjoint Program/Course scopes, Global/scoped Admin, Teacher, student, combined-role, disabled and unassigned identities. Course PDF examples retain original filenames and immutable bytes. All credentials and records are synthetic; Hifz delivery is disabled. The fixture reuses ordinary application operations and introduces no business-case model.

[Eight Phase 0 checks](../../backend/tests/academy-separation-phase0.test.mjs) verify schema coverage, independent roles/scopes, invalid context denial, Global inheritance, direct command scope, current file entitlement, byte preservation, fixture isolation, blocked network use and critical route/writer/tool availability. Existing regression discovery includes the new test file automatically. No dependency or package-script change is needed.

## Writer coverage

Use the [40 reviewed authority families](authority-map.csv), [API map](api-map.csv), [field map](field-map.csv) and [table ownership](table-placement.csv) together with the generated candidate inventory. The static scan records 783 candidate sites across 101 files: 328 runtime, 168 offline/maintenance and 287 schema-upgrade candidates. It includes 22 dispatch patterns and literal routes/guards, raw upload handlers, SQL builders/batches, object/coordinator writes, both scheduled entry layers and SQL triggers. Candidate counts are source-navigation evidence, not a permission allowlist or a count of independent business writers.

All 13 dynamic SQL candidates were classified: four runtime builders use server-selected schema targets; nine are offline import/recovery/staging builders. [The dynamic writer review](phase-0-dynamic-writers.csv) records their treatment. A later extraction must update the callers and their owner, rather than only moving a shared SQL helper.

| Entry family | Source and boundary to retain |
| --- | --- |
| Account/session/profile/roles | `worker.js`, `repository.js`, `session.js`, `profiles.js`, `enrolment.js`, `course-subscriptions.js`; Core credentials/current rights and actual actor |
| Program setup/copy/curriculum | `programs.js`, `program-copy.js`, `curriculum-removal.js`, `subjects.js`, `learning-catalogue.js`, `module-catalogue.js`; definitions versus current membership/Teacher assignment |
| Course setup/copy/lifecycle | `course-management.js`, `course-calendar.js`, `management-store.js`; drafts/definitions versus effective Core relationships/lifecycle |
| Timetable/publication/joins | `learning.js`, `public-timetable.js`, `lesson-join.js`, `program-workspace.js`; accepted facts and current joining policy |
| Calendar/availability | `academic-calendar.js`, `teacher-availability.js`; scoped/global setup, Global-only app clock |
| Plans and feedback | `lesson-planning.js`; live plans/revisions/comments/deadlines in Core, default requirements in Admin |
| Attendance | `learning.js` and the attendance models; ordinary dated authority, approved native fresh-start/roster plan later, no reset now |
| Assessments and raw files | `assessments.js`, `assessment-register.js`, `assessment-files.js`, `assessment-reports.js`, `assessment-store.js`; current ordinary answer/mark/release records, exact kind/learner/actor |
| Memorisation | `memorisation.js`; Admin catalogue, Core live progress/current enablement |
| Media and library | `lesson-media.js`, `library-boundary.js`, `library-metadata.js`, `library-storage.js`, `pdf-bookmarks.js`, `pdf-tools.js`, announcements; current storage/file/audience gates and narrow own-note contribution |
| Background/coordinator | `worker.js` scheduled entry, `cache-refresh.js`, `refresh-state.js`, `hifz-profile-sync.js`, `library-storage.js`; 15-minute cron configured in source, queued Hifz/cache work, Open Library coordinator writes |
| Imports/repair/schema | `backend/tools/academy-migration/`, related command tools and migrations; offline owner-aware preparation only, no old writer fallback after a future move |

File names in the table are under `backend/src/academy/d1/` unless otherwise specified. The existing cron configuration was not changed; the user's development pause is not an operational/data freeze. No import, recovery, reset, migration or background job was triggered on live data during Phase 0.

## Validation and preserved behaviour

- Full regression: **82/82 test files passed**, including the eight new Phase 0 checks. The initial restricted run's Hifz failure was local-port permission; the isolated runtime recheck and final full run passed with local-port access and a mocked outbound service.
- Existing browser acceptance: six check groups passed. Student Learn, Teacher Teach and Admin Learn/Teach cards fit nine widths; Course and scoped Program/Course views passed. Seventeen synthetic screenshots were retained, including phone/desktop examples. No browser errors were reported.
- The original 1,308 tracked files match their captured hashes; no runtime source, HTML, CSS, version marker, binding or migration was edited. New files are the baseline tool, shared fixture, Phase 0 tests and repository copies of the approved contracts/execution record.
- The 118 future separation acceptance scenarios remain unexecuted. F01/F02/F10/F14 have a Phase 0 foundation; their full future cases are not claimed executed. Existing mixed Admin views/general Teacher media editing are known later-phase work, not rights that this baseline freezes as desired behaviour.

## Phase 1 handoff

Implement the separate Admin entry and server-enforced Learn/student versus Teach/Teacher context on the existing screens. Keep one sign-in, genuine personal participation and read-only authorised preview distinct. Apply the same boundary to direct/legacy routes, JSON/errors/retries, raw uploads, exports and file bytes. Keep Global Admin inheritance and scoped limits. Preserve the captured layouts and PDF tools.

Manual acceptance, replacement, remarking and already-released corrections remain direct Admin work through ordinary assessment records. Do not add a case entity, separate lane/result/release engine or automatic hold/reinstatement workflow. Phase 0 performed no deployment, live database change or attendance reset.

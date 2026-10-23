# Database use and future carry-over notes

Recorded 23 October 2026 from source checkpoint c70619a5, applied migrations through 0035, the private verified post-migration snapshot and current reader/writer/view references. This is a migration planning record. The source database remains intact and no new database is created here.

The [carry-over register](database-carryover-register.csv) covers all **134 application tables, the deployment ledger and three SQL views**. It records current use, aggregate row count at this checkpoint, planned owner, default treatment for a new Admin database, observed consumers/foreign keys and the condition for retiring a dependency. Counts contain no account details or record contents. Cloudflare internal objects are excluded; target indexes/triggers/constraints must come from its deliberate schema, not a blind source-schema dump.

## Updated destination scope — 23 October 2026

The user subsequently requested fresh **dev-academy-admin** and **dev-academy-core**, carrying only active, unarchived records. These are intended to become the new Development databases after review. The old database becomes a retained legacy/recovery source before any later separately executed deletion. The register’s new-Admin default still prevents accidental Core duplication; its fresh-Core column adds the new selection boundary. No old-history table is copied simply because it exists. Any active record that requires a retired/archived reference must be identified and resolved explicitly in the copy manifest rather than silently omitted or bringing over all history.

## What carries forward

| Current family | Future treatment |
| --- | --- |
| Current Admin definitions, media masters and active editing drafts | Carry only the selected Admin-owned fields, stable IDs, dependency closure and required history. A draft is active work, not legacy merely because it is unpublished. |
| Core identity, roles, subscriptions, membership, learning work, native attendance, assessments, released results, Teacher notes and issued reports | Place selected active, unarchived records in the fresh Core database. Do not copy this family into Admin. Preserve actual actors, current access and every referenced immutable version. |
| Accepted setup components/heads | Keep only accepted references needed by the selected active records; separate Admin candidates from accepted immutable versions. One editable master per fact. Do not discard a version while work still references it. |
| Operational counters, revisions, receipts and audit | Partition by the operation's owner and initialise target-local controls deliberately. Preserve unresolved/recent exact retries and historical audit; never copy a global Core counter and treat it as the target's own version. |
| R2 files, private My links and shared Open Library metadata | Keep their existing storage homes. Carry authorised metadata references where required; do not duplicate files or put owner-private links into official Academy tables. |

## Legacy that still matters

`legacy_access_evidence`, `role_import_reviews`, `role_mapping_decisions`, `activity_policy_imports` and `program_legacy_teachers` still have current runtime consumers. Effective subscriptions/roles, scope checks and reviewed Program access can depend on them. They remain in Core until canonical facts are reconciled, every relevant fallback/view is replaced and permission equivalence is verified. A legacy name is not proof of redundant data.

`migration_runs`, `migration_checks`, `learning_imports`, `course_workflow_imports` and `data_ownership` are still used by readiness/activation and ownership checks. Preserve the active evidence. Replacing these gates is separate work; dropping the tables now would prevent the application from becoming ready. The source migration ledger is release evidence, not a target migration recipe: a new database's ledger must describe the schema actually applied to that database. Do not replay the entire historical import or copy its ledger to a different schema.

## Retained history and exclusion candidates

Old `attendance_registers` and `attendance_marks` belong to the replaced attendance workflow. New attendance is `NATIVE_V1`; old development records are not converted into it. Keep the original evidence in the source/recovery history. Legacy timetable/removal adapters still read old registers, so record and replace those dependencies before any later omission. `lesson_media_comments` is retired from the active media UI/API under media separation, with history retained. These three tables are excluded from the proposed new active Admin schema.

`academy_import_schema`, `activity_source_bindings`, `source_record_map` and `legacy_identity_links` have offline provenance/import consumers, with no direct runtime/view reference found in this scan. Their default is preserve source/archive and exclude from the new Admin database, subject to the register's offline reconciliation checks.

`academy_admissions`, `library_access_policies`, `library_exclusions` and `program_library_destinations` have no direct current runtime/view reference found. They are dormant/old-import candidates, not automatically approved for deletion. At this checkpoint three are empty and the old Library destination has one row. Confirm intended feature, dynamic/external consumers and recovery requirements before final exclusion. New attendance/assessment/media tables can also be empty before first use, so emptiness alone never means legacy.

## Mixed columns and settings

Use the [baseline field map](field-map.csv), [0032–0035 delta](field-map-phases-2-4.csv) and [settings map](settings-map.csv) with the register. `activities`, `assessments`, `assessment_registers`, `course_settings`, `course_run_state`, `memorisation_activity_settings` and `academy_settings` are mixed records: a whole-row copy would bring Core policy/workflow along with Admin definitions.

Examples of retained active fields include `course_settings.legacy_access_model` (current access policy), assessment exam dates/duration (still used by timed exams), and captured time-zone/source fields (historical provenance). They are not obsolete merely because assignments are untimed or Time zone is now a Global-Admin-only setting. New date resolution uses the accepted app-wide master; preserve existing effective instants.

`LessonMediaPilot` is an old key; current readiness uses `LessonMediaEnabled`. `AcademyWrite:*` and `AcademyRefresh:*` are operational versions/delivery acknowledgements rather than Admin master configuration. Old Drive folder/root values are not R2 keys. Inventory keys by purpose and preserve any still-used provenance without copying the settings table wholesale. Do not copy meeting links, personal data or credentials into this planning document.

## Maintaining this record

Update the register when a route, flag, writer, view, field or setting is retired or replaced. Before the separately authorised physical move, refresh counts and actual dependencies, classify newly added objects, select the exact column/row allowlist, and verify the target does not include excluded history/provenance by default. A table may be excluded from a new target while still being preserved in the original store or private recovery archive. A later cleanup/deletion decision is separate from carrying only the necessary schema and data forward.

Static literal references are navigation evidence, not proof that dynamic/external consumers do not exist. The register records that limitation explicitly. No automatic cleanup or deletion policy is introduced.

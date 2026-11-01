# Scoped lesson-editor reads — local follow-up, 1 November 2026

This separate follow-up starts at reviewed editor `ad1401ee3ca34f49aff8dcda08b3cd4da92e7ac5`. The original `feature/academic-lesson-corrections` branch and its receipts remain unchanged. This branch is `feature/academic-lesson-editor-read-budget`; no release, push, live reads/data changes or recording attachments are authorised.

The change narrows only the recorded-context editor's schema/enablement, lesson-to-area, activity, selected lesson/class, optional monthly policy and retry receipt reads. Seven exact server-authored SQL templates carry internal metadata through the existing private coordinator. Missing, mixed, changed SQL/parameters or extra metadata is rejected. Current scoped Admin authority is checked by the existing actor/epoch verification before and after capture; Teach/Learn/preview denials remain. No client SQL or arbitrary table/predicate hint is accepted.

The unknown lesson-to-area lookup reads only its exact ID and area, then checks both owners against the actor's current Admin scopes before returning anything. Selected lesson reads capture that one row once per owner, then only the union of its class keys. This retains Core live flags when an unpublished Admin definition references a different class. Standard owner merging and all existing stale-write, idempotency, actor/session/epoch and atomic save checks remain. The Admin-only internal lesson query omits learner population audience calculation; ordinary media readers and their class/publication gates keep their existing queries.

The generic write planner, coordinator commit/recovery, actor proof implementation and direct-binding boundaries are unchanged. There is no new schema, index, migration, binding, cache, polling or dependency change. `backend/node_modules` in this local checkout links to the already installed dependency tree; nothing was installed or upgraded.

## Measured comparison

`backend/tools/academy-lesson-context-read-budget.mjs` builds the same disposable synthetic fixtures against the frozen reviewed editor and this checkout without editing either. Growth adds 250 unrelated accounts, lessons, subjects/modules, activities, classes, settings and retry receipts. This is broader than the original editor's growth qualification.

The following are coordinator SQL statements and transferred/materialized source rows. They are not billed D1 `rows_read`, bytes read, full HTTP statement counts or complete frontend interaction costs.

| Action | Old / new statements | Old read rows, small / grown | New read rows, small / grown | Unchanged write-plan rows, small / grown |
| --- | ---: | ---: | ---: | ---: |
| Cold options | 53 / 52 | 89 / 2839 | 33 / 33 | 0 / 0 |
| Repeat options | 52 / 51 | 89 / 2839 | 33 / 33 | 0 / 0 |
| Draft context save | 132 / 130 | 127 / 4627 | 38 / 38 | 93 / 1593 |
| Exact retry | 40 / 39 | 65 / 3065 | 8 / 8 | 0 / 0 |

The original curriculum/teacher option recipe remains 19 statements and 26 transferred rows in these fixtures. The new surrounding scoped reads add seven rows for options and eight for exact retries, without unrelated population growth. Schema validation transfers no media records. Query-plan evidence shows existing lesson/activity/settings/receipt/class/policy indexes. The original teacher designation registry still scans its own small registry, as documented by the reviewed editor.

The whole editor is not constant cost. Draft saves still use the unchanged owner write plan and grow to 1593 captured rows in this expanded fixture; a save totals 1631 captured rows including its 38 read rows. Published-change preparation/acceptance, ordinary `get`/feed refreshes, authentication/readiness reads outside coordinator instrumentation and other UI requests remain outside this optimisation. No production billing estimate is claimed.

## Local validation

165 relevant regression checks pass, including the original 18 feature checks, five new read checks and the real local Workers/private-Durable-Object RPC flow. Eight native browser flows pass. The new checks cover:

- Exact results versus the previous owner-merge path for every recipe, including unpublished class definitions and current monthly policy.
- Missing/mixed/altered SQL or metadata, mismatched bound keys, wrong owner, Teacher and out-of-scope Admin denials.
- Session revocation during every recipe, credential epoch and scoped-role changes, with no stale projection returned or cached.
- Concurrent lesson revision retry, stale saves, current feature disablement and unchanged foreign keys.
- Indexed exact-key predicates and zero-record schema checks; growth tests separate read cost from remaining write-plan cost.

Reproduce the comparison from the repository root with `LESSON_CONTEXT_BUDGET_OUTPUT=<local output directory> node backend/tools/academy-lesson-context-read-budget.mjs`. `LESSON_CONTEXT_BASELINE_ROOT` can point at the preserved reviewed-editor checkout. Test logs, raw comparison, read budgets and index plans are saved in parent `outputs/academy-lesson-editor-read-budget-20261101/`.

## Composition and holds

The live paired V109.3 separation release is Source `078bcc8b` / Studio `f4e2f3ed`. This isolated optimisation is based on the reviewed editor's older baseline; it is not a release candidate and does not replace the deployed separation code. Later compose V109.3, editor `ad1401ee`, this optimisation and separately reviewed retention `547345ca` as authorised. Preserve retention's original note/PDF creation/upload anchor, asset filtering and storage-generation checks in `lesson-media.js`; this follow-up changes only context-editor read selection, not assets or retention.

The next approved release needs matching Source API and external split-coordinator code, with Academy and Studio published as a same-version pair under parent `work/AGENTS.md`. No release/version/asset-cache reference was stamped here. All actual academic/MOU attachments, publication, the separate MOU repair and production data changes remain held. Native IDs and original upload evidence for the two intended academic recordings remain pending supported confirmation.

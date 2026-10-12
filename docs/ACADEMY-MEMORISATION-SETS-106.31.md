# V106.31 — Independent memorisation set catalogue

Surahs and Duas use memorisation **sets**, separate from Academy curriculum subjects/modules. Progress Admin keeps the existing set editor, list uploads, item moves, personal-card controls, Program/Course restrictions and class-card settings. Personal cards and class grids now say set throughout; the approved card design is retained.

## Storage and compatibility

Migration `0019_memorisation_sets.sql` copies set names, subjects, levels, ordering and visibility into `memorisation_sets`, and restrictions into `memorisation_set_activities`. Item IDs, item names/order, every learner progress field and both independent confirmations remain unchanged. Personal-card settings, class exclusions and learners-per-card settings remain unchanged.

The migration rebuilds the item/progress tables together so foreign keys remain valid. It removes tracker-only curriculum entries, preserving any entry genuinely used by a curriculum module or Course category. Only empty tracker-created subject records are removed. Assessment schedule labels, publications, reports and lesson media remain untouched. Catalogue/write revisions advance so stale forms require refresh.

Set edits and imports no longer read or write curriculum catalogue records. New set IDs use `MS-` identifiers. The API exposes `sets`, `set` and `setId`; historical `modules`, `module`, `moduleId` and `module-save` aliases remain for cached clients and exact retry recovery. `set-save` is the new editor endpoint. Uploads accept `SetName`/`TaskName` columns, with existing `ModuleName` lists still supported. Explicit Replace imports retain their existing reset behaviour; this migration does not use Replace or reset progress.

## Progress log and validation

- [x] Inspect V106.30 and live tracker links: 12 sets, 120 items, 16 learner marks and 9 teacher confirmations; no linked curriculum uses for the 12 set entries.
- [x] Build independent set storage, conservative catalogue cleanup and rolling-upgrade read compatibility.
- [x] Adapt personal/class/admin terminology and upload headers without changing access rules.
- [x] Add migration preservation, inactive visibility, retained curriculum use, rollback, independent edit/import and old retry compatibility checks. Assessment choices exclude tracker-only entries.
- [x] All 142 backend regression test files pass, including 32 targeted memorisation/assessment tests.
- [x] Chrome desktop (1440px) and mobile (390px): visitor temporary selections; learner save; independent teacher confirmation/two badges; class set pills; same-page close; admin search/edit; lost-save response and retry; restricted Program set; new SetName CSV and legacy ModuleName parsing; no page overflow or browser errors.
- [x] Rehearse against a private live D1 export: 88 unaffected tables remain identical; 12 sets/120 items/16 learner marks/9 teacher confirmations preserved; no foreign-key errors; integrity check passes.
- [x] Worker dry-run build, active version/cache markers and diff checks.
- [x] Apply only migration 0019 to Development D1 after a fresh private backup; verify all saved items/progress, restrictions, personal/class settings and existing receipts/audit rows. Concurrently added receipt/audit rows remain intact. No foreign-key errors; no tracker entries remain in the curriculum catalogue.
- [x] Deploy Development Worker; health returns V106.31. The live public set preview is identical before and after the migration.

Worker version: `cc3e6c7e-f3b6-4390-b9ec-aaa5e31a1483`. The feature release targets `feature/105.3.4.13`; its existing Pages pipeline publishes the website. The post-push website check is reported in the completion message.

Private database backups and browser evidence remain outside the repository. The root/production Worker is outside this release.

# Phase 2 — Admin setup and accepted publication

Release V107.25 on `feature-admin`. Preparation and implementation authorised through Phase 4 on 22 October 2026. The required UI/Development checkpoint remains before any physical database split.

## Boundary

The existing definition tables remain the editable source. Migration 0032 adds immutable setup components, frozen batches, accepted heads and a single head pointer in the existing D1 database. It neither moves nor overwrites source rows. Reader projections use an accepted vector, not editor JSON. Related browser requests and timetable caches share that head. An absent head or failed complete publication fails closed.

Review records the exact source version, parent head, format, scope closure, row counts and content hashes. Accept validates components/references and current source again, checks current account/session and every affected Admin scope within the write transaction, then advances one pointer. A competing publication or changed source requires a fresh review. Retries return the original accepted outcome. Source drafts and historical snapshots remain intact.

Global catalogue name changes include affected accepted module/timetable labels; unrelated area drafts are preserved. Local IDs remain unchanged. New shared dependencies require the corresponding Global Admin authority. Current account status, roles, roster, lifecycle, media suppression and memorisation disabling remain Core decisions and cannot be restored by an older accepted publication.

Program/Course Publish and assessment schedule release retain their existing review and save paths, then open the complete setup review in a separate request. This keeps the original Program publish within its 50-query limit. Media publication collects only its media family. Admin can also open Review setup from the existing management action row. Other existing form layouts are retained.

## Family schema and index plan

| Family | Definition/reference scope | Preserved keys and constraints | Phase 2 index/read plan |
| --- | --- | --- | --- |
| Curriculum | Subject/module catalogue, Program subjects/levels/modules/tasks/classes and class setup | Existing IDs, case collations, unique keys, activity/class/module relationships | Component table + scope index; accepted head/table/scope primary key; validate combined reference closure |
| Presentation | Program/Course names/cards, enrolment options, announcements and approved app settings | Activity IDs and current lifecycle/visibility suppression; settings allowlist excludes operational counters | Same accepted vector; source account/role/current-policy indexes remain authoritative |
| Calendar | Scoped events, global exclusions and shared availability | Event IDs/date constraints and actual affected Admin scopes | Shared global selection includes availability; accepted calendar readers and timetable snapshots use the same head |
| Timetable | Immutable publications, published sessions/classes/teachers and accepted publication selection | Existing publication/lesson anchors and source history; current cancellation/completion still wins | Accepted selection vector; original published-table indexes remain for source management/history |
| Assessment | Schedule/group/register/report setup; workflow remains Core | Existing assessment/register/class IDs; paper/marking/release state remains current | Accepted definitions plus current workflow; Phase 3 supplies the authorised timing/due-date/direct-control changes |
| Memorisation | Set/task/group defaults and area configuration | Stable task IDs and retained progress; current per-account/area disables stay immediate | Accepted set definitions; original progress indexes remain; unpublished display defaults never override current disables |
| Media | Parent/session metadata, official asset references and associations | Stable lesson/asset IDs, filenames and existing R2 homes; hidden/withdrawn associations remain suppressed | Accepted metadata and file service use the same vector/current policy; Phase 4 completes verified own-note and library UI work |
| Planning | Default policies and requirements | Existing scope keys; live plans, deadlines and feedback stay Core | Accepted default reads; live operational indexes and audit/receipt tables retained |

Physical Admin schemas, target database copying and writer cutover are Phase 5 work after the required UI/Development checkpoint. The field and ownership maps remain the specification for that later move.

## Verification

Synthetic checks cover private drafts, complete acceptance, unrelated draft/history preservation, source changes, competing accepts, missing components, immutable vectors, current disable/role checks, reader workspace/scoped Admin rules, shared name closure, ordinary Program publication/retry and per-invocation query limits. The real frontend/Worker browser check verifies desktop/mobile review, cancellation, explicit publication and the reader cache changing with the accepted head. Existing regression checks and deployment evidence are recorded below when completed.

This phase does not claim that Phases 3 or 4 are complete. Their attendance/assessment controls and remaining media/library work continue under the existing approval. No manual-case or replacement/release coordinator is introduced.

## Current release evidence

- Full backend regression: 85/86 files passed under the workspace sandbox; the sole listener-permission failure passed when rerun with local-listener permission (86/86 in combination).
- Focused separation checks: Phases 0/1/2 plus workspace client checks pass. Additional Phase 2 checks cover all-area availability authority and immediate new memorisation disables.
- Synthetic real-browser setup review: passed at 1440px and 390px with no page errors; cancellation retains the old head and successful publication refreshes the previously cached Learn view.
- Worker dry run and feature asset/package checks pass. Original Program Publish and the separate accepted-publication request each remain within 50 queries in the synthetic end-to-end check.
- Private recovery snapshot verified by reconstructing the database in memory: 109 application/migration tables, 4,041 rows, integrity OK, zero foreign-key errors. No source rows changed. Snapshot and recovery hash are outside shipped assets.
- Cloudflare's export endpoint rejected the current OAuth scope. The working read-only SQL connection supplied the consistent recovery snapshot instead.
- The user explicitly approved shared migration 0032. It is applied and ledgered; the guarded bootstrap accepted 158 components. The remote preview transport failed before reaching the handler, so the documented D1 batch API ran the same initializer through the existing connection. The capture uses VALUES to fit D1’s compound SELECT limit.
- Recovery comparison after bootstrap confirms all 108 original source tables unchanged (migration ledger excluded), with zero foreign-key errors. General Teacher media curation is disabled in the accepted-setup mode; narrow own-note contribution remains Phase 4 work.
- Phase 2 preview deployment follows the verified schema/head. Development code remains V107.22.

# Academy separation final data ownership

Prepared 22 October 2026. Ownership describes the authoritative writer. An Admin screen may issue a Core operation; that does not require copying live records into the Admin database.

## Store responsibilities

| Data family | Authoritative owner | Learn and Teach consumption | Admin action |
| --- | --- | --- | --- |
| Accounts, contacts, PINs, sessions, roles, subscriptions, current access and Hifz delivery | Core | Current authenticated context and permitted minimal identity | Authorised identity/access operation; Global/scoped limits retained |
| Classes, curriculum, Program/Course definitions, calendar, teacher availability and timetables being edited | Admin setup | Accepted versioned references, never private drafts | Edit/review/publish familiar existing screens |
| Current class membership, effective Teacher assignment, Course attendance roster | Core operational relationships | Current permitted eligibility and sealed historical register context | Direct scoped roster/assignment operation; proposed timetable authoring remains Admin |
| Published lessons, release pointers, effective cancellation/completion, current enable/disable policy | Core | Accepted content plus current policy | Deliberate publication/current-policy operation |
| Assessment setup/register definitions, report templates | Admin setup | Accepted assessment/template references; staff-only fields restricted | Edit/publish setup; publication releases no paper/result |
| Assessment recipients, access, files, submissions, checks, marking, release, reports and events | Core | Own learner work or authorised Teacher work; current permitted output | Direct on-behalf upload/replacement, marking/finalisation and explicit release; no case subsystem |
| Teacher plans, submissions, revisions/preferences and live Admin feedback/deadline decisions | Core | Own or authorised review projection tied to exact plan revision | Direct feedback/deadline operation |
| Plan requirements/default policies, memorisation definitions/catalogue | Admin setup | Accepted definitions | Existing authorised setup/publication controls |
| Memorisation progress/confirmation and current learner/area enable state; attendance registers/absences/history | Core | Ordinary own/assigned work | Existing authorised controls; no records extraction now |
| Session recordings/links/PDF-note definitions, verified contributor and private candidates | Admin media | Core accepted material refs and current visibility/control; bytes stay in R2 | General curation; Teacher gets only agreed own-note contribution |
| Course-wide PDF collection and display labels in source migration 0031 | Admin media | Published Course collection, separate from session/day; approved display label | Existing Course/Global Admin curation; V107.22 additions preserved |
| Official Academy library catalogue and publication | Admin | Accepted catalogue and current entitlement/file access | Applicable existing scope; no Teacher general curation |
| Public Open Library metadata | Existing separate metadata store, administered through Admin | Public/approved reader | Global Admin; do not move/merge this store incidentally |
| Personal external My links/positions | Existing planned private owner R2 namespace | Owner only | No inspection of another person's collection |
| App-wide Time zone and shared presentation/configuration masters | Admin, Global Admin edit for Time zone | Accepted versioned Core configuration | One app-wide control; no area override |
| Operational settings/counters, receipts, audit and writer state | Store that performs the operation; current access remains Core | Minimal permitted status | No shared editable counter or cloned authority table |
| Migration/import/legacy access evidence and retained discussion | Current Core/history owner until dependencies retired | No new discussion/live entitlement | Preserve compatibility/evidence; no deletion in this project |

## Boundary rules

Admin drafts have one master. Core keeps accepted immutable references needed by its queries and local constraints, not another editable Admin copy. Credentials and authoritative roles remain exclusively Core. Effective roster/role/access changes and live feedback are Core operations even when entered from Admin.

Publish setup as a reviewed complete change set. Prepare inactive accepted versions, then activate coherently. Saving a draft alone changes no learner content. Current disabling/revocation and live workflow actions do not wait for curriculum publication; publication cannot restore a later revoked permission.

Mixed assessment records split by purpose/column, not by copying the entire row twice. Definition fields and staff duration/maximum go to Admin/accepted definitions; current paper/answer/mark/release facts stay together in Core. Templates are Admin masters, while issued reports and their source references are Core.

Manual Admin work uses those same operational assessment records with correct learner, actual recorder and ordinary history. No manual-case tables, duplicate result ledger, per-case readiness or automatic released-result policy are required.

## Field and table coverage

The [field map](field-map.csv) contains one row per inspected source column, including the two explicitly noted migration-0031 fields. The [table map](table-placement.csv) covers every one of the 108 Academy tables. [Settings](settings-map.csv) are split per key, rather than copying academy_settings.

Current membership/effective assignment, live plan feedback/deadlines and live memorisation enablement are explicitly Core-owned in the final maps. Their Admin management permission is unchanged. The optional future Records column in older placement maps means no current extraction.

Source references are not live sizes or proof of deployed schema. Migration 0031 was independently in progress at capture and then committed in V107.22 during this review; its display_name and media_scope fields preserve filenames, storage keys, existing IDs and session history. Final maps include the committed source. Live application is not verified; later schema/authority changes must be reconciled in Phase 0.

## Files history and recovery

Keep assessment, lesson, announcement and library R2 objects in their existing homes. Change authorised metadata/reference ownership, not file bytes or public URLs. Preserve immutable versions, accepted history, IDs, enrolment evidence, report sources and original actor/times. Never infer physical deletion from an upload timeout or view removal.

Each writing store owns its transaction, revision, audit and retry outcome. Cross-store setup publication uses the existing durable acceptance/recovery design; a single database transaction does not span stores. Do not build a separate business workflow around manual assessment exceptions.

History referenced by accepted work remains accessible only under existing permitted current or administrative history access. No cleanup, reset or destruction is executed during preparation. The previously confirmed development-only attendance fresh start is the explicit Phase 3 exception to historical conversion: old development attendance need not be migrated. Keep all unrelated data/files/identity and new native attendance history. No automatic cleanup or old-database destruction follows from separation.

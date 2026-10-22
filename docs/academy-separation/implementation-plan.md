# Academy separation phased implementation plan

Prepared 22 October 2026. The user authorised staged implementation on 22 October 2026 and paused unrelated development. Phases 0 and 1 are complete on `feature-admin` at V107.23; Phase 2 follows the exit gates below. [Phase 1 evidence](phase-1.md). Preparation choices and ownership are final for the current scope; exact code, SQL and measured limits are implementation work.

## Phase 0 source alignment and baseline

Capture the actual checkout, deployed version evidence, schema/migration list, route map and existing data/file bindings. Reconcile independent V107.20 comparison, V107.21 editable PDF annotation/favourite-colour and V107.22 media-name/Course-PDF work without resetting or overwriting it. Use the final access and field maps. Identify all writers for each family, including legacy aliases, raw uploads, imports, scheduled work and maintenance tools.

Create isolated synthetic fixtures and baseline preservation checks. Runtime source changes, credentials, data exports and deployment remain untouched until implementation is requested. During implementation keep backups private/outside shipped assets.

Exit: compatible working baseline and accepted preservation expectations. No new product-policy or manual-edge-case workflow design is required.

## Phase 1 workspace and server access boundary

Separate the Admin entry/host while retaining existing Learn/Teach hashes and layouts. Keep one sign-in and real actor. Implement explicit audience/context allowlists for readers, ordinary Teacher actions and Admin commands. Apply them to nested/error/retry responses, raw uploads, PDFs/exports and old routes. Preserve genuine own participation; preview creates no participant event.

Global Admin inherits area administration; scoped Admin stays scoped. Time zone is Global-Admin-only. Remove Admin controls/data from Learn/Teach. Clear incompatible cached state and delayed responses on context changes; preserve unsaved work and PDF pane state.

Exit: Global/scoped/Teacher/student/dual-role comparisons pass for navigation, direct API and files. No physical database move.

## Phase 2 Admin setup and accepted publication

Separate editable curriculum/class/Program/Course/calendar/availability, assessment/memorisation setup and media/catalogue services from read projections, still using existing storage while needed. Remove Teacher availability/general catalogue/media editing as directed, retaining narrow own-note contribution.

Replace runtime draft reads with accepted content. Establish versioned setup inputs, preserve stable lesson/class/subject IDs and collected publication. Shared name changes include affected timetables. Direct identity/roster/lifecycle/disable commands remain Core and do not wait for publication.

Exit: draft edits stay private; accepted whole-change publication works, preserves unrelated drafts/history and cannot reopen revoked access. Complete per-family schema/constraint/index plans from field map.

## Phase 3 learning operations and direct Admin controls

Connect attendance, plans, memorisation and assessment readers/actions to accepted inputs and current Core permissions. Preserve the confirmed sparse attendance, historical FIRST, substitute windows and reviewed per-delivery roster rules. During authorised implementation, carry out the previously confirmed attendance-only development fresh start: no conversion/import of old development registers/statuses, fence old writer/retry generations, keep all unrelated data, and begin reporting with new native recorded days. This preparation performs no reset.

Implement direct scoped Admin assessment actions in the existing assessment area: correct-learner upload/replacement, marking/revision, optional marked PDF, finalisation and explicit release. Admin handles already released work manually. Keep ordinary Teacher examiner/moderation rules, actual actor/history and explicit result release. Do not introduce case entities, special lanes, automatic holds, supplemental-release engines or case coordinators.

Include explicit timed/untimed mode, future assignment due dates and open-after-due Late flag with Admin extend/close controls. Ready uses the confirmed manual eligibility/warning/zero-upload rules. Learner outputs omit configured duration/inline marks/maxima; released reports show achieved-only results.

Exit: normal and direct Admin actions pass permissions/file/source checks and preserve history. Saving/uploading alone cannot release results. No automated replacement policy is required.

## Phase 4 media library and reader preservation

Apply consistent student/Teacher audiences to main timetable/weekly media, file/playback requests and Course-wide PDFs. Keep original filenames, display names, stable asset/session identity, chooser behaviour and accessible old/permanent material. Teach may Post/replace/withdraw verified own notes while eligible; Admin curates generally. Retire discussion UI/API while retaining history.

Preserve existing official library store boundaries and reader entitlement. Add the confirmed owner-only My links behaviour through its private namespace. Preserve PDF/Whiteboard/comparison tools, mobile/desktop state and contextual return links.

Exit: protected metadata and bytes agree; own-note and general Admin permissions remain distinct; no new media entitlement from attendance or Admin reader perspective.

## Phase 5 move coherent Admin data families

Only after owner-aware paths are verified, prepare the Admin database/schema and read-only Core reference relationships. Rehearse each selected coherent family on isolated data: copy, dependency/hash/count checks, current permission/retry tests and resource measurements. Identify all source/target writers before switching.

Keep identity, roles, current memberships/assignments, live plans/feedback, attendance, memorisation progress and assessment workflow in Core. Keep existing R2 homes and Open Library metadata store. No third Academy Records database now.

For each family, stage an inactive complete copy, fence/drain the old writer, reconcile final changes, validate references/history, then switch authoritative ownership once. Keep one writer; no live dual editing or guessed automatic fallback. A failed pre-switch rehearsal keeps the old owner.

Exit: measured selected-family transactions fit current limits; counts/hashes/keys/history/retry evidence match; owner routing and forward/recovery paths verified. Take and verify private backups before a real move.

## Phase 6 release cutover and retire compatibility

Run the full in-scope acceptance plan and existing affected application checks in isolation/development. Confirm all current source changes and migration versions, current deployments, API/byte permissions, reader layouts, no duplicate/omitted records and operational health.

Follow the repository release/version instructions as implementation proceeds. Database/Worker/frontend compatibility order is explicit for each release; frontend may not depend on absent backend/schema. Expose only the complete verified state.

Keep rollback copies/history until verified stable. Retire old aliases/joins only after proving no active writer/client depends on them. Do not automatically delete old data, files, credentials, history or shared worktrees.

Exit: release and rollback evidence recorded; obsolete writes cannot bypass the new owner/permission boundary.

## Rollback rules

| Point of failure | Required action |
| --- | --- |
| UI/service change before storage move | Restore a compatible application version against the same authoritative store, preserving accepted work |
| Inactive copy/rehearsal fails | Discard or repair only the inactive preparation; keep original owner and active reader state |
| Ownership switch not yet accepted | Preserve the fenced original owner; resolve its admitted writes before abandoning a candidate |
| Target ownership accepted but no later writes | Use the verified planned ownership reversal under writer fencing |
| Target has accepted later writes | Stop and reconcile using recorded target work/backups; never point an old deployment at a stale source copy |
| R2 upload outcome unknown | Recover the original operation; retain the object while acceptance/reference status is uncertain |

## Acceptance and deliverables

The [active acceptance matrix](acceptance-matrix.csv) and matching [evidence map](rehearsal-evidence.csv) define required checks; none has run. Measure actual selected-family cost during implementation, rather than treating earlier provisional budgets as tested capacity.

Each phase records the code/schema/map revision, role/context coverage, data/file preservation, actual test results and recovery evidence. Advance on verified deliverables, not a hidden button or a successful HTTP response alone. Routine checks are part of implementation and need no repeated policy-design approval. Implementation has been requested; advance on verified phase exit gates.

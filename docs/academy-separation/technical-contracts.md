# Academy separation active technical contracts

Prepared 22 October 2026. Read with the [final implementation brief](README.md), [access map](access-map.csv), [data ownership](data-ownership.md) and [phased plan](implementation-plan.md). These are design requirements. Completed runtime work and validation are recorded in [Phase 0](phase-0.md) and [Phase 1](phase-1.md); later publication/storage requirements remain assigned to their implementation phases.

## Identity audience and requests

Keep existing public sign-in/PIN/session contracts and one Core credential authority. For authenticated learning services resolve real actor, actual current scope, workspace Learn/Teach/Admin, and genuine participation versus authorised read-only preview separately. Caller-supplied workspace/learner ID is not permission. Learn always uses student fields; Teach always ordinary Teacher fields/actions; Admin management is explicit. Apply the same selection to nested data, errors, retries, raw uploads, exports and bytes. Preview creates no timer, attendance, receipt check, Ready, marking or release event.

Use action-specific validated payloads and opaque stable Program/Course/class/session IDs; retain original case/collation semantics. Unknown fields/context cannot select a broader action. Preserve current revisions, actual actor/time, current-source checks, local atomic changes, audit and original operation recovery. Read/preview is non-mutating. A stale conflict retains edits and requests refresh; an uncertain write is recovered under the original identity before a second logical action.

## Definitions and publication

Admin owns editable setup; Core uses accepted, versioned references. A draft save changes no accepted reader content. A reviewed publish contains the full intended change set, including affected timetable names/references, with stable lesson identities and unrelated drafts preserved. Prepare inactive components, verify all dependencies and activate the accepted set coherently. Keep the previous accepted set until activation succeeds. Retain referenced history.

Current access/role/roster/lifecycle and disable actions are Core operations even from Admin. They take effect under current authority, without waiting for setup publication. A later publication/retry cannot reinstate revoked permission. Publication is not assessment paper/result release or attendance confirmation.

Start with service boundaries inside one Worker/current storage. Before moving any family, enumerate every writer and introduce durable owner/version routing. Never hold one SQL transaction across stores or R2. Any later cross-store publication/command must have a stable request identity, checked source revisions/current authority, destination acceptance and recoverable outcome. One store owns each business write; no live dual editing or fallback to stale originals. Detailed SQL and measured transaction envelopes are implementation deliverables, not new product workflows.

## Operational records

Core retains accounts/roles/access, effective memberships/Teacher assignments, live plans/submissions/feedback/deadlines, attendance, memorisation progress/current enablement and assessment workflow. Admin definitions reference these by stable IDs; they do not clone credentials/current authority. Grouping/default policies may be accepted Admin setup separately from live enablement.

Attendance accepts FIRST for any otherwise permitted current/past session and CORRECTION for an existing register. No late-first permit. Future FIRST is unavailable. Keep sparse absences plus explicit register/day/roster evidence so zero absences is a real submission and daily totals count the session date once. Use reliable dated eligibility for missing historical registers; an accepted register keeps its sealed roster. Admin can correct dated source data through ordinary roster tools. A Course delivery roster is separately reviewed by Admin and grants attendance membership only.

Native attendance families are attendance_days (unique activity/date), reusable sealed attendance_roster_versions/members, attendance_day_contexts (required dated sessions), stable attendance_series/aliases, append-only attendance_register_versions and sparse attendance_absences. Absence rows prove membership in the sealed register roster; counts match real absence/member rows. Corrections append a complete replacement absence set and update the latest series pointer; reports count the latest register and each date once, not correction history. Three of four sessions is 0.75 day; show no percentage for a zero denominator. Course delivery enrolments and scoped substitute assignments remain Core relationships.

The user previously confirmed that existing development attendance need not be retained. Phase 3 may therefore start the native format cleanly during authorised implementation, with no legacy status/history conversion. Fence/drain old writers and reject old-format/pre-reset retries. Preserve identity, roles, accepted curriculum and unrelated operations; new native dates/rosters/register evidence must support subsequent reports. No reset happens during this preparation.

Substitute capability remains Link/Attendance only: FIRST through the session Academy day, correction through the next day, Admin correction-only reopening up to 24 elapsed hours. A separate ordinary Teacher/Admin right is evaluated independently. No broad Teacher, assessment, library or media role is inferred.

## Assessment actions

Use the ordinary Core assessment/submission/mark/release/report records. Admin can upload/replace on behalf of the named learner, record/revise a mark, attach a marked PDF, finalise manual marking and explicitly release. Record the true actor and learner separately; do not fabricate learner first access or examiner/moderator identity. Admin manual finalisation requires no second moderator. Ordinary examiner self-moderation constraints remain. Scope and latest-answer/file/definition validation still apply.

No manual-case table/state machine, separate marking lane, supplemental-release engine, typed manual-result/report subsystem, automatic hold/reinstatement or cancellation/correction coordinator is required. Handling a replacement or already released result is a manual Admin decision. Preserve original evidence/history. Saving/uploading alone never releases. Implement direct controls through the existing operational actions, with a server-verified Admin action purpose where needed; a purpose flag alone grants nothing.

Preserve ordinary class-wide marks release and selected/class feedback/scripts. An explicit Admin correction/release targets the intended ordinary record; it must not accidentally release classmates or another category. Keep categories explicit, reject ambiguous empty selections and validate the current affected records. No fabricated checks, zero-answer results or empty-set completion. The agreed Ready rule and untimed/assignment timing apply independently of releases.

## Files reports and media

Retain current R2 homes, immutable file IDs/versions and original bytes. Metadata ownership changes do not require moving files. Validate file kind, correct owner/learner, activity/class, current permission, exact source/definition/version and content identity. Binding a marked PDF to a replaced answer requires actual current review; fetching a newer revision does not rebind old work. A lesson PDF cannot be retagged as an assessment answer/script. Uploading a report does not issue it.

Learn receives approved learner bytes or own permitted original answer, never a staff-original fallback. Report listing and file delivery enforce the same owner/release/current-source rules. Learner reports show achieved marks only, with a genuine zero distinct from Pending; omit maxima, out-of totals, percentages, staff notes and configured duration on every page. Admin can review all report pages and issue the same reviewed output with its source/template/layout/background references. Keep report/history identities through explicit correction/reissue.

Admin curates general media. Teacher contribution is restricted to verified own PDF-note Post/replace/withdraw while eligible, with exact dated-session/current control/version checks. Preserve other notes, parent publication, unchanged videos and historical/permanent recordings. Never infer authorship from a current Teacher name. At the existing ten-PDF cap replacement uses the same current slot; retained history does not count as a new visible attachment. Revoked/hidden access must agree at lists, timetable popup, PDF and playback.

Migration 0031, independently committed in V107.22, adds display_name and SESSION/COURSE media_scope plus one Course-collection uniqueness index. These source additions are now committed in V107.22; no claim they are applied live. Course-wide PDFs have their own publication/visibility and existing Course entitlement, not a session-day or attendance-roster gate. General names/collection controls are Admin-only; a verified own-note label may accompany that narrow contribution. Name-only video edits retain existing asset IDs. Use original filename/Video fallback when a label is empty. The independent media implementation is preserved; this preparation makes no application change. Preserve V107.21 in-place text/editable PDF annotation saving/reopening and favourite colours as browser/file tools, without making them official Academy media writes.

## Personal content navigation and compatibility

Own My links stay in a private owner namespace outside Academy D1/official catalogues. Server derives owner; no Admin access to another collection. Current Teacher/Admin may first create; an active established owner continues own use/edit/export after role loss, including an empty established collection. Preserve conflict/unsaved work, original save recovery and privacy across devices/account changes. Open external providers under their own permission; no credential ingestion, server copying or official proxy expansion.

Preserve existing layouts, tab/hash/deep-link context, mobile attendance/media controls, Library routing, PDF split/fullscreen/Whiteboard/comparison and annotation/unsaved guards. Context changes reject delayed data from another actor/workspace. An old route is an alias to the same new permission/owner gate, never a way to reopen a draft editor or bypass audience restrictions. Retired discussion endpoints remain unavailable; history is retained. Compatibility retirement and physical cleanup are separate from the access cutover.

## Validation and recovery

Use the active acceptance/evidence maps. The full matrix remains phase-scoped; Phase 0 fixtures and Phase 1 checks are recorded separately without claiming later scenarios have passed. During implementation verify current platform limits and measure full operation costs, including guards, indexes, triggers, audit, copies and retries. Earlier provisional budgets are not tested capacity. Rehearse isolated data, verify private backups, fence/drain the old writer and reconcile history before a family switch. After new target writes, rollback requires reconciliation; pointing an old version at a stale source is invalid. An unknown upload is not proof that bytes are safe to delete.

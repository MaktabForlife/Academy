# Academy one-day recorded context — local feature, 1 November 2026

This feature continues the preserved `feature/academic-lesson-corrections` work at base `6a1399dab26cb42f29117007352b1fb6208bf44b`. It adds past-date session selection and Admin corrections of a single recording's subject/module and displayed teacher. It is locally tested, not deployed. Release labels, asset cache references and dependencies are unchanged.

The next approved composition must include matching Source API and external split-coordinator code from this feature. The new recipe crosses their private RPC boundary. There is no schema migration or new binding.

## Native API contract

All calls use the existing authenticated POST routes, selected workspace and account/session checks. `context-options` and `context-save` require current Global Admin or scoped Program Admin in the actual `ADMIN` workspace. Teach, Learn, Admin-Teach, Admin-Learn and explicit learner preview are denied. A signed token or a browser permission flag is insufficient.

- `lesson-media/feed`: existing body plus optional `sessionDate: "YYYY-MM-DD"`. It is permitted only for a Programme staff view and selects one dated native timetable range. Omit it for the existing current week. Saved media remains paginated; selected-day saved rows are also included even beyond the recent 30-row page. The returned `sessionDate`, date range and conditional revision identify the selection. No date browsing writes data.
- `lesson-media/create`: unchanged. Use the selected native `sessionKey`, `sessionVersion`, exact date range and retry `operationId`. Creation remains a draft and uses the original published session's class, cohort, teacher, publication, run and attachment identities.
- `lesson-media/context-options`: body `{lessonId}`. Returns `lessonId`, current `revision`, `subjects: [{key,moduleId,programSubjectId,name}]`, `teachers: [{id,name}]`, `selectedSubject`, `selectedTeacherIds`, `scheduled: {subject,teacher}`, `reason` and `corrected`. Subject keys are exactly `SCHEDULED`, `SUBJECT:<native program subject ID>` or `MODULE:<native programme module ID>`. Never construct IDs from labels. Active programme curriculum includes unpublished Admin definitions, with Core's live active flags. Teacher candidates come from current scoped teacher roles or the Academy teacher registry; original historical teacher IDs remain selectable. Global Admin alone is not a teacher designation.
- `lesson-media/context-save`: body `{lessonId,operationId,revision,subjectKey,teacherIds,reason}`. Use one to ten unique native teacher IDs and a nonblank reason of at most 500 characters. The server reloads current choices and rejects foreign, inactive or fabricated selections. `{lessonId,operationId,revision,reset:true,reason}` restores the scheduled context. Reset needs no selected subject/teacher. Exact retries reuse the entire original payload and operation ID; changed payloads cannot reuse that ID. Stale revisions return `ROW_CHANGED` without overwriting the winning edit.

The save returns `{lessonId,revision}` and, for an accepted-setup published lesson, `acceptedChange`. Preserve the existing `m4l-academy-workspace.js` fetch wrapper: it completes `/api/academy/changes/accept`, updates the publication head and invalidates read caches before presenting success. Do not ignore the returned acceptance reference or publish a draft implicitly. Exact retry and acceptance are idempotent. In split storage, unaccepted corrected definitions remain private and accepted reader heads retain their former labels until acceptance. Hidden/class/account/session withdrawal still overrides an accepted definition immediately.

A supported correction requires a Programme session with one original native source snapshot. Legacy unsourced, historical freeform, multi-source and Course records are rejected. Native session/mapping uncertainty is a hold, not a reason to manufacture a session.

## Display and permission boundaries

Lesson DTOs add `canCorrectContext` and `contextCorrected`. `teacher` and `recordingGroup` describe recorded content. `recordingGroup.teacherIds` is never media-management authority. Continue using `canManage` and the existing server access gates.

The correction is stored only under `source_lessons_json[0].recordedContext` with schema `RECORDED_LESSON_CONTEXT_V1`. Original snapshot fields, permission-bearing teacher columns, session/publication/class/cohort/run identities and the recurring timetable remain unchanged. The lesson title follows the recorded subject only when it still matches the scheduled or previous recorded label; a custom title remains intact. Audit events retain reason, before/after context and unchanged-anchor evidence. Assets, byte/object identity, original successful upload time, recording expiry and independent companion expiry are unchanged.

## Circles UI integration

Reuse the native editor/API contract rather than duplicating a second editor. The management area offers a date picker, Show date and Current week. The selected date must be part of a feed request/revision; keep selected-date responses out of the regular current-week browser cache.

Show the correction action only when `canCorrectContext` is true. Keep the lesson/attachment form and correction form independently guarded: opening a correction requires other unfinished entries to be saved or cancelled; saving either form must not discard changes in the other. Cancel correction discards only correction input after confirmation. PDF/MP4 cancellation must retain correction dirty state. A stale/error save retains entered text and an uncertain failure retains the exact retry payload. Restoring scheduled context remains usable if the corrected subject has become inactive. Clear editors, selected date, private metadata and delayed responses on account/workspace/session changes.

`js/m4l-lesson-media.js` implements these behaviours and uses the existing media cache/workspace boundaries. The browser acceptance tool exercises the native module and production Worker through an isolated local transport. It does not claim live authenticated acceptance or native mappings for the owner's future recordings.

## Local validation and cost limits

The full relevant regression suite passes 160 checks, including 18 focused feature checks and a real local Workers/private-Durable-Object RPC run that exercises correction options/save/exact retry. Eight browser flows pass, including widths 320/390/768, unsaved form cancellation, stale text, lost acknowledgement, unavailable-subject reset and delayed account switching. Eighteen changed JS/MJS files pass syntax checks. Foreign-key checks and transaction guard cleanup pass.

The exact three-query option recipe is server-authored and validates SQL shape, bound programme, metadata completeness, Admin owner and current scoped proof. The existing coordinator verifies current authority before and after capture. Mixed/missing metadata, out-of-scope authority, mid-capture session revocation and oversize capture fail without a partial projection. Each store captures at most 400 programme subjects/modules/levels or linked catalogue rows; the 401st sentinel fails, including inactive same-programme rows. Eligible teacher capture fails at 201. Original historical teacher choices are appended from the existing session snapshot. Split teachers use `effective_activity_roles`, which includes current mapped roles; this recipe does not reconstruct global legacy mappings.

Local synthetic measurements with 0 versus 250 unrelated accounts, media entries, subjects and modules:

| Request | Coordinator SQL statements | New option materialized/transferred rows | Inherited captures, small / grown |
| --- | ---: | ---: | ---: |
| Cold options | 53 | 26 | 63 / 1563 |
| Repeat options | 52 | 26 | 63 / 1563 |
| Draft correction save | 132 | 26 | 194 / 3444 |
| Exact retry | 40 | 0 | 65 / 1565 |

The new option recipe accounts for 19 coordinator SQL statements in this fixture. These are coordinator statements and transferred/materialized result rows, not D1 billed `rows_read` estimates or full HTTP statement totals. Local SQLite query plans show indexed programme, account and linked-catalogue lookup. The teacher designation registry scans its own registry. There is no new population/catalogue scan in the option recipe, no idle polling and no added settings catalogue read.

Inherited readiness, lesson, receipt and owner-write-plan federation captures still grow with unrelated data. The complete editor request is not constant cost. General federation optimisation remains a separate follow-up; this patch neither bypasses coordination using raw bindings nor changes the generic write planner. The measured budgets, exact query plans and test logs are in the parent output handoff directory.

## Composition and holds

The separate `feature/academy-note-retention` owner may also change `lesson-media.js`. Compose its retention imports, asset DTO/filtering, save checks and worker enrichment with this feature's context imports, context actions, accepted-change/audit additions and dated feed logic. Preserve both sets of tests. Do not copy work into or edit that branch. Academy-only notes/PDF retention (three calendar months by default, Global Admin managed, one seven-day warning) is separately owned. Recording and companion expiry remain independent; Studio is excluded from that policy.

No deployment, push, hosted SQL, live login/read, notice, deletion, upload, attachment, publication, recording processing or DNS change was performed. The two academic recordings and four MOU attachments remain held for the next separately approved update. The separate MOU publication-order repair remains held.

Confirmed intended future labels are 27 October 2026 at 09:30, Mishkaat, Muallimah Madlin; and 28 October 2026 at 07:45, Usulul Hadith, Ml AR Cader, replacing that day's normal Mishkaat slot only. The synthetic date tests do not confirm their native class/module/teacher/session IDs or original successful upload evidence. Those mappings remain pending supported confirmation. Do not attach or publish them from this receipt.

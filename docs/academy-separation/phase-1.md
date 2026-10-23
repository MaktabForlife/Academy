# Phase 1 — workspace and server access boundary

Update at V107.32: the user clarified that Admins are actual Teachers throughout their scope, while Learn is student class viewing. The read-only Teach preview rules below describe the earlier Phase 1 checkpoint and are superseded by [Admin inheritance](admin-inheritance.md).

V107.23, 22 October 2026, branch `feature-admin`. Built on the verified V107.22 Phase 0 baseline. This phase uses the existing Core database, R2 buckets and Open Library coordinator. It introduces no schema migration, data move, attendance reset or manual exception workflow.

## Delivered boundary

- `/academy/admin/` hosts the existing management screens. Previous Admin hashes hand off with their selected area intact. Learn and Teach retain their existing hashes, tabs, timetable cards and styling.
- `X-Academy-Workspace: LEARN | TEACH | ADMIN` selects the audience. Every request still verifies the real account, current session, credential epoch and current roles. A caller cannot acquire authority by choosing Admin. Headerless shared readers use Learn; an existing `/api/admin/` path explicitly selects Admin for compatibility.
- Shared assessment, planning, progress, calendar and media actions have workspace allowlists. Existing resource, class, assignment, examiner and owner checks remain necessary. Management aliases, raw uploads and protected downloads use the same boundary. Reader conflicts omit management records.
- Learn omits assessment duration, maximum marks, inline marks, registers and private event details. Teach omits Admin capabilities. Genuine own enrolment and assigned teaching work remain available. An authorised Admin preview cannot start a learner paper, upload an answer, record attendance, confirm an answer or memorisation, set Ready, mark, moderate or release on another identity.
- Published media metadata and file delivery retain their publication, scope and current entitlement checks. Student and Teacher views do not gain management through Global or scoped Admin authority. General media contribution refinements remain in the later media phase.
- Sign-in/session responses keep actual authority for workspace navigation. Feature responses use the selected audience. Actor IDs are retained; no Student/Teacher role, membership or recipient is created for preview.
- Browser requests carry the selected audience. Workspace changes clear incompatible feature/timetable caches and reject delayed JSON, errors and file blobs from the previous workspace/account. Existing unsaved guards run before switching. Local teaching drafts and PDF tools remain available.
- Global Admin alone can edit the existing app-wide `PlatformTimezone` setting under Admin → App settings. Scoped Admin cannot edit it. Ordinary setup writers reject local time-zone edits; new copies inherit the app setting. Existing stored publication times/history remain intact. Further assessment timing work belongs to Phase 3.
- Teacher availability editing and shared Open Library curation are available through authorised Admin actions. Teach receives read-only calendar/availability fields; selecting Admin does not grant a Teacher management authority.

## Data ownership and compatibility

Identity, roles, sessions and operational records remain in Core. `PlatformTimezone`, its ordinary retry receipt and audit event use existing Core settings/transaction facilities. No new case table, manual lane, correction coordinator, release engine or separate report subsystem is introduced. The prepared ownership map still governs later publication and storage work.

Frontend and Worker must be released together: the frontend sends the new workspace header and the Worker permits it in CORS. Old read requests fail safely to the Learn audience; existing explicit Admin paths retain their permission checks. Public sign-in, public timetable/date/announcements and public Library contracts remain usable. Phase 1 is prepared on its feature branch; it does not change the live Development deployment.

## Verification

The implementation is checked with synthetic accounts, isolated SQLite and in-memory R2. No live business records or files are used.

- Full regression: **84/84 test files passed**, including Phase 0 fixtures, direct Admin/scoped/Teacher/Student/dual-role boundaries and browser request fencing.
- New server checks cover headerless/invalid contexts, old Admin aliases, successful-operation retries in a forbidden workspace, nested learner fields, correct-owner files, raw upload denial, event-free preview, genuine own access, class assignments, revoked roles, disabled accounts and Global-only settings.
- Real frontend/Worker browser checks cover five roles across Learn/Teach, the old Admin handoff, app settings, workspace switching and cancelling/recovering an unsaved teaching plan. Seventeen screenshots cover nine widths from 320 to 1440 pixels; no page errors or document overflow.
- Existing PDF browser acceptance passed: split/fullscreen panes, Whiteboard, annotations, bookmarks, original retry handling, local PDFs, mobile switching, unsaved replacement guards and pane state.
- Program publication retains its existing **50-query** budget; the separate snapshot follow-up uses **33 queries**.
- Worker dry-run bundle succeeds. Release/version and source-boundary checks pass. Schema, binding and styling preservation evidence is retained with this chat's Phase 1 outputs.

These checks establish the Phase 1 boundary. The original 118-scenario matrix also contains later publication, operational, media and physical migration scenarios; this record does not mark that entire matrix complete.

## Next phase

Phase 2 separates Admin setup from accepted reader publication. Phase 3 implements the settled timing/Ready rules and direct manual Admin assessment controls. Phase 4 completes media contribution and reader refinements. Storage moves and release cutover remain Phases 5 and 6. The existing layouts and the instruction against manual edge-case systems continue to apply.

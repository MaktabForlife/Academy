# Academy browser messaging — V107.69

Branch: `feature/academy-messaging`.

Base: `feature/academy-session-videos` at `c62c901274881c191163586c33d55e2d8720a9ee`, plus a snapshot of its then-current tracked and untracked local changes (`d2580f62`). The source checkout was left untouched. On 26 October 2026 the user explicitly requested deployment after V107.68. The messaging branch incorporates deployed V107.68 (`e3acc1ee`) and is prepared as V107.69.

## Preview

From `backend`, run `npm run preview:messaging`, then open `http://127.0.0.1:8768/`. Choose Student, Teacher, Program Admin or Global Admin. The complete Academy dashboards run against synthetic accounts and disposable, in-memory Core/Admin databases. The preview never forwards requests to Development or production. Stopping it discards the sample messages and Class Notes. `MESSAGING_PREVIEW_PORT` changes the port.

The preview includes a sample Class Note, an acknowledgement request and a class with exactly 200 eligible recipients. The local recovery tick dispatches due schedules and resumes interrupted deliveries. No email or phone alerts are generated.

## Behaviour

- Students send to one of their own classes, including its responsible teachers.
- Teachers select their assigned classes or dated sessions.
- Program/Course Admins select multiple classes/sessions or everyone in their assigned learning areas.
- Global Admin selects multiple Programs/Courses and audiences, or All Academy active accounts.
- Recipient resolution uses current roles, accepted timetable assignments and genuine membership. Course students need both delivery membership and learning access. Overlapping selections produce one recipient record per account.
- Dashboard previews and inbox lists do not create opened receipts. Opening a full notice does; acknowledgement is a separate explicit action. Personal archiving retains the notice and receipts. Archived notices that require acknowledgement stay in To acknowledge until acknowledged.
- One personal inbox works across workspaces. Drafts show the workspace in which they were created; editing/sending them requires that workspace. Admin-Learn class preview cannot send as a student.
- Review includes the actual sender, unique recipient count, paginated names, content, links, acknowledgement and delivery time. Confirmation checks the saved revision, accepted timetable and current recipients. Changed audiences require another review.
- Schedules save the Academy local time, time zone and UTC instant. Dispatch rechecks current sender authority and eligible membership without using an expired browser token. Permission/link changes hold the schedule for review; transient failures back off and retry.
- Issuance creates a durable outbox and frozen recipient list. Delivery uses bounded 100-recipient chunks and unique notice/account keys. A notice becomes visible in recipient inboxes only when all chunks have committed. Accepted confirmation retries return the same notice.
- Sent notices retain original content. Corrections are separate notices linked to their predecessor; withdrawal hides the recipient body while retaining the original in authorised reports. Reports include delivery, opening and acknowledgement, paginated recipients/audit events and a CSV recipient export.
- Class Note links retain their note/version identity. Instructions stay in the canonical lesson record. Linked Class Notes are rechecked at review and dispatch.

## Integration and storage

The existing Learn/Teach/Admin dashboard Messages card and navigation open the messaging dialog. FMA/FYA, assessments, Coming up next, calendar and the swipeable timetable retain their existing behaviour. Existing browser-local read markers are not treated as messaging evidence.

Messaging operational tables, schedules, outbox, receipts, drafts and audit records belong to Core and are protected by the physical split write fence and read epoch. They do not publish or alter curriculum setup. All audience and report permissions are checked server-side. Messages do not grant access to linked lessons/resources.

The additive migrations are:

- `backend/migrations/academy/0038_messaging.sql` for a disposable unsplit database.
- `backend/migrations/academy-core/0003_messaging.sql` for the existing split Core database. No Admin schema change is required.

Both paths are exercised locally. Do not apply both paths to the same database. Only the split Core upgrade is required by the existing deployment; activation evidence is recorded below after verification.

`ACADEMY_MESSAGING=1` enables the API. The prepared Worker configuration includes a dedicated minute cron; that tick runs messaging only. Cache and Hifz recovery retain their existing cadence. The dedicated minute tick is part of the V107.69 release configuration.

FMA integration, private conversations/replies, PWA/push, email and learning-event automation are outside this implementation. Existing Class Note posting does not automatically issue a messaging notice.

## Verification

- `npm run test:messaging`: permissions, 200-recipient send, independent receipts, review changes, retries, interrupted delivery, scheduling without a browser session, cancellation, corrections, withdrawal, Class Note links, scoped reports, Course membership, physical Core/Admin ownership and minute tick isolation.
- `node --test tests/academy-messaging-runtime.test.mjs`: bundled code running in the local Workers runtime with physical Core/Admin D1 bindings.
- `npm run test:messaging:browser`: real Academy dashboards with synthetic HTTP handlers; desktop, 390px and 320px phone layouts; send/review/report, source Class Notes, scheduling/cancellation and account clearing.
- Existing Class Notes, session video, workspace, private snapshot and split-store regression tests are included in the local verification.

The browser acceptance tool writes screenshots and `verification.json` to `/private/tmp/academy-messaging-acceptance`.

The user authorised this release on 26 October 2026. Future releases still require user authorisation. Keep live checks small under `../AGENTS.md`; the 200-recipient check uses local fixtures, never a real-account broadcast.


## V107.69 release — 26 October 2026

- Incorporated deployed V107.68 (`e3acc1ee`) and removed superseded standalone video-preview pages from the release artifact. Retain session uploads, fourteen-day expiry, read optimisations and the existing timetable.
- Local regression covered all 114 test files. The initial full run passed 112; the two release-invariant files were updated to expect the dedicated messaging minute timer alongside the original quarter-hour timer, then all six tests in those files passed. Messaging separately verifies that the minute tick does not run cache/Hifz recovery.
- Browser acceptance passed six workflows with synthetic split stores: dashboard inbox, 200-recipient send/review/report, independent receipts and personal archive, 390px/320px full-screen layouts, canonical Class Note links, scheduled cancellation and account clearing. No hosted test broadcast is performed.
- API dry-run build passes (1,521.67 KiB / 326.38 KiB compressed). Website build passes (752 assets). Boundary check passes for 136 modules, with no legacy Google backend client. Active release markers agree on V107.69.
- Recorded a Core Time Travel bookmark, then applied only `academy-core/0003_messaging.sql`. One targeted query confirms seven tables, 21 write fences, 21 read-epoch triggers and eight retention triggers, initially zero notices and recipients. Existing learning tables and the Admin schema are unchanged. Private schema/bookmark evidence is under ignored `.academy-migration/messaging-10769/`.
- Website, API and private coordinator activation evidence is recorded in the release output after deployment. Future deployments still require user authorisation.

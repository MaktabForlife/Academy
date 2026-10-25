# Academy browser messaging — local feature

Branch: `feature/academy-messaging`.

Base: `feature/academy-session-videos` at `c62c901274881c191163586c33d55e2d8720a9ee`, plus a snapshot of its then-current tracked and untracked local changes (`d2580f62`). The source checkout was left untouched. Existing V107.66 release labels are inherited; this local feature does not reserve a new release version.

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

Both paths are exercised locally. Do not apply both paths to the same database. Neither has been applied to a hosted database.

`ACADEMY_MESSAGING=1` enables the API. The prepared Worker configuration includes a dedicated minute cron; that tick runs messaging only. Cache and Hifz recovery retain their existing cadence. These configuration edits remain local.

FMA integration, private conversations/replies, PWA/push, email and learning-event automation are outside this implementation. Existing Class Note posting does not automatically issue a messaging notice.

## Verification

- `npm run test:messaging`: permissions, 200-recipient send, independent receipts, review changes, retries, interrupted delivery, scheduling without a browser session, cancellation, corrections, withdrawal, Class Note links, scoped reports, Course membership, physical Core/Admin ownership and minute tick isolation.
- `node --test tests/academy-messaging-runtime.test.mjs`: bundled code running in the local Workers runtime with physical Core/Admin D1 bindings.
- `npm run test:messaging:browser`: real Academy dashboards with synthetic HTTP handlers; desktop, 390px and 320px phone layouts; send/review/report, source Class Notes, scheduling/cancellation and account clearing.
- Existing Class Notes, session video, workspace, private snapshot and split-store regression tests are included in the local verification.

The browser acceptance tool writes screenshots and `verification.json` to `/private/tmp/academy-messaging-acceptance`.

Before any future release, reconcile with the then-current local base, allocate a release version, apply the reviewed Core upgrade and release matching website/Worker assets. Publishing remains subject to a new explicit user instruction. Nothing in this document authorises deployment.

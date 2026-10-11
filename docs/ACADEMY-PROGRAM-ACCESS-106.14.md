# V106.14 — Program settings and management navigation

The owner authorised pushing this complete batch on 11 October 2026 once all raised issues are resolved and tested. Deployment branch: `feature/105.3.4.13`. The development website and `devrebootworker` remain the application, with D1 authoritative. No schema migration, live data correction or change to the legacy production-named Worker is required.

## Program settings in one place

Remove the duplicate Program name / Save Program / Zoom row from the Timetable tab. Edit the name, Free/Paid and lifecycle in the Program list. The selected Program panel contains its ID, **Open Program management**, its optional Program Zoom link, **Save Program**, and the public timetable card editor. The card's entered time, title and short description remain one JSON object with the existing 12 / 80 / 240 character limits, escaped text and optional bold; no values are inferred from lessons. Unsaved settings are retained after a failed save and warn before leaving or refreshing. Discard restores saved settings.

Program Zoom previously belonged only to the timetable draft, which becomes locked after publication. Explicit Program-level decisions now use the existing `academy_settings` table under `ProgramZoom:PROGRAM:<id>`, with the current actor and timestamp. Older draft links remain the starting value until an explicit Program decision is saved; a saved empty value clears that older link rather than resurrecting it. Program settings save through the normal revision, authority/session, audit and operation-receipt transaction, independently of timetable publication.

The saved Program link takes priority over session links, then class links. Validation and future publication use the current setting. Joining a currently published lesson also resolves the current Program destination, with the existing permissions, effective-date, cancellation and joining-window checks. Clearing the Program link restores the session link or single-class link; combined classes still need one shared meeting. Published dates, labels, teachers, audiences and stored snapshots are unchanged. Meeting URLs remain excluded from homepage snapshots and cached personal timetable responses.

## Free/Paid

The Program list's compact **Free / Paid** selector edits the current setting displayed in User profiles. Existing imported values remain the starting value; an unknown or unconfigured value stays closed to public joining until explicitly selected. Unrelated name/card/status/Zoom saves preserve the setting.

Free permits public timetable joining only for eligible published lessons, from five minutes before start until lesson end. Paid Programs remain visible without a public joining reference. Every Join click rechecks the current setting, so changing to Paid blocks an older cached Free link immediately. Use **Academy administration → Refresh public timetable** as Global Admin to update the cached homepage buttons; otherwise the next daily snapshot picks up the change. Course access and its existing editor remain unchanged.

Global Admin can edit every Program; Program Admin can edit only their own Programs. Teachers and students cannot save Program settings. The change creates no enrolments, scoped roles, subscriptions or private media access.

Explicit Program access decisions use the existing `academy_settings` table under `ProgramAccess:PROGRAM:<id>`. Original `activity_policy_imports` evidence is preserved. Registry/workspace reads, User profiles and public joining share the current effective policy. Failed late writes roll back settings and the Program revision together; retries do not duplicate changes and stale forms cannot revert newer decisions. Existing D1 batches and indexed settings joins are reused, with no new visitor polling or hosted test load.

## Management navigation

The header has four tabs: Timetable, People & classes, Library and Attendance. Highlight the correct tab for both canonical extensionless addresses and `.html` addresses, including the deployed Pages routes. User profiles is a button inside People & classes, available only to Global Admin; remove its duplicate top tab. People & classes opens directly to enrolled students and their class assignments. Remove the legacy Overview / Modules / Subjects / Tasks / Classes / User profiles row from this current D1 view. Pre-upgrade unfinished entries remain recoverable until saved or discarded; student class changes survive reloads.

Replace the header's back arrow with **Back to Program management**, returning to the Program list with the same Program selected. The Home icon remains. The labelled button and settings editor fit on mobile.

Library and Attendance tabs show only **Coming soon** below the shared header. Their prior backend implementations and regression coverage are preserved for future work; the old attendance page markup is retained only as a local test fixture and its script is no longer loaded by the public tab.

## Verification and remaining work

All **138/138 local regression test files pass**. Expanded synthetic tests cover Free/Paid and Program Zoom scoping, persistence, public/profile consistency, immediate joining checks, old-draft fallback and explicit clearing, post-publication saves, safe new-Program settings, exact retries, stale revisions, late-audit rollback and unchanged source evidence/roles/publications. Navigation tests cover canonical and `.html` routes, the retired tabs, User profiles authority and Coming soon content. The development Worker dry-run build passes.

Synthetic desktop/mobile Chrome checks pass for the moved settings and JSON card editor, Zoom saving while the timetable is locked after publication, reload persistence, invalid-link correction and Discard, matching User profiles labels, scoped Program Admin saves, correct tab highlighting, selected-Program return and mobile width. No live accounts or database records were altered for testing.

Library and Attendance in Program management are intentionally deferred. Protected Course media, Program Module subscriptions/permanent completion entitlements, Progress, Assessment, Planning, Announcements and remaining Module-to-Subject classification remain unfinished as recorded in the V106.11 handoff. These are not completed or enabled by this batch.

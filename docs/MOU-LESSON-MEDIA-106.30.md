# V106.30 — Mothers of the Ummah lesson media demo

The MOU Program page has a horizontal ribbon for the owner-supplied 6–8 October 2026 recordings. Cards show the lesson title, date, 24-hour times, class, teacher, optional staff summary, recording, private PDFs and discussion. Cards stretch to the same height; the ribbon can be swiped or moved with its arrow buttons.

## Access and editing

- Recording players require an active Academy account with the **current MOU Student role**, checked on the server each time a recording opens. Metadata returned for student cards contains no recording URL or R2 object key. Removing that role prevents subsequent media requests.
- MOU Program Admins and Global Admins manage all three lessons. MOU Teachers manage lessons assigned to their account. Being in the Global Teacher directory alone does not grant management access. Management authority does not automatically grant the student recording player.
- Staff select **Manage** on a card to edit its title, summary, YouTube source, visibility and discussion setting, or upload/remove PDF attachments. The original timetable remains the source of date/time, class and teacher metadata.
- PDFs are served by the authenticated Worker from a separate private R2 bucket, `maktab-lesson-media-private-development`. They are never added to the public Library. Uploads have a 16 MB limit, signature and checksum checks, streamed storage and revision protection. Exact retries use a permanent operation receipt; failed writes remove newly uploaded orphan files.
- A labelled sample guide demonstrates PDF access. It is not a transcription or lesson handout. Staff may replace it with actual lesson notes.
- Student comments await staff approval. Students see their own pending entries; peers see approved entries. Assigned staff can approve, hide, remove, pin and reply. Editing an approved student comment sends it back for approval. Staff can close discussion. Comments are rendered as text.

The ribbon fetches bounded metadata once when opened. The refresh icon requests fresh metadata. It has no timer, focus polling or persistent browser media cache. Leaving the area, changing account or signing out clears open players and PDF object URLs. Previously displayed content cannot be remotely recalled from a viewer; later openings require current access.

This is a Program-specific pilot, separate from the public Archive.org/website-link Library and from the planned permanent Module media entitlement system. There are no lifetime grants in this release.

## Historical lessons and release setup

`0017_lesson_media.sql` adds separate lesson, asset, link, comment and bounded-history tables. The existing V106.29 assessment phase migration remains intact.

`backend/tools/academy-migration/mou-media-demo.sql` checks the verified MOU publication/class/teacher before seeding three recordings and an audited historical extension for **6–7 October only**. A read-time projection has lower priority than real publications. It does not change the original 8 October publication, later lessons, enrolments, credentials or attendance. Run this file only after the new schema is installed; repeat execution preserves the same records.

Initial lesson titles follow the verified timetable:

| Date | Lesson | Time |
| --- | --- | --- |
| 6 October | Tarteel & Tadabbur | 09:30–10:30 |
| 7 October | Duas & Akhlaaq | 09:30–10:30 |
| 8 October | Tazkiyah & Tarikh | 09:30–10:30 |

September recordings are excluded. The supplied YouTube IDs are used without inventing lesson summaries.

## Validation

`npm run test:lesson-media` exercises student/staff permissions, current-role revocation, account/session/credential changes, moderation, revision conflicts, exact retries, upload failure cleanup, private downloads, YouTube URL validation and the historical date boundary.

`npm run test:lesson-media:browser` opens the real Academy page against isolated fixture D1/R2. It verifies desktop/mobile ribbon layout, player opening, student comment approval, staff editing, PDF access, a lost upload response followed by an exact retry, no focus polling, and discarding delayed responses after account changes. Set `MEDIA_BROWSER_RUNTIME` to the installed Playwright package if necessary; `MEDIA_DEMO_PDF` optionally supplies a real PDF for the attachment exercise. Screenshots and acceptance results are written to the system temporary directory.

Release checks completed: all 142 regression test files pass; the lesson-media and existing assessment browser acceptance suites pass; Worker dry-run, Pages Functions build and generated binding types pass. The supplied recordings return matching date/title metadata and permit embedding. Live setup contains three lessons, three recordings, one labelled sample PDF linked to all three lessons, and a two-day historical extension. The original MOU publication matches the pre-release backup; the database foreign-key check is clean. Public R2 access is disabled.

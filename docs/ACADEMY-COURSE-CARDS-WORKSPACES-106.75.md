# V106.75 — Course cards, workspaces and reader return

## Course public timetable cards

Open Manage Courses, select a Course, then choose **Public card**. Enter a display time (12 characters), title (80) and description (240); `**bold**` is supported. The preview and independent Save public card button are available for existing draft and published Courses. Cards apply to the Course across deliveries. All three fields must be filled, or all three empty to hide the card. A saved card appears once per scheduled day after publication. Existing Courses keep their previous session summaries until configured. Personal schedules and published sessions are unchanged.

The existing `academy_settings` table stores one small marketing JSON record per Course under `AcademyCoursePublicCard:COURSE:<ID>`. No schema migration is needed. Course get reads the record from its existing settings batch; entrance projects it using an indexed scalar lookup in its existing activity query, without another statement. The guarded Course-management transaction rechecks Global Admin or assigned Course Program Admin authority, uses a separate card revision, protects same-record concurrency and records idempotent receipts. Saving requests the existing durable public snapshot refresh and recovery mechanism. Anonymous snapshots retain only the three marketing fields, with no private curriculum, account, class, teacher or meeting-link data.

## Layout and navigation

LEARN and TEACH show their role title beside assigned Program/Course pills. Scoped pages retain those pills, highlight the current area and preserve existing permissions and tools. Desktop timetables fit seven days; smaller screens wrap visible rows. Admin's existing timetable placement and layout remain. Three pixels of space protect highlighted Sunday and Saturday outlines at the scroll boundaries. Coloured Quick Links appear only on the main Academy homepage; Home and Calendar are removed from those blocks, with existing header/workspace navigation still available.

## PDF close

The top-right × is a 44-pixel accessible link that returns to the originating public or personal Library. Reader links carry a fixed `library=public` or `library=personal` flag because new-tab links omit browser referrers. The reader accepts only those two destinations, retains the flag when changing volume/page, and otherwise uses a same-origin Library referrer or account-based fallback. Existing unsaved-change protection remains, including the second PDF pane.

## Validation

- 60 affected Node test cases passed, including Course card validation, inherited/scoped authority, revoked authority, stale saves, idempotent retries, unchanged publications, public-field filtering, zero additional entrance statements, duplicate public cards, cache recovery and release version agreement.
- 40 local homepage/workspace checks passed at 320–1440 pixels, covering role/scoped layouts, all seven weekdays, Quick Links, Admin placement, public card editor persistence and cached week browsing.
- 11 local PDF browser checks passed for volume selection, account bookmarks, split panes, responsive close controls, unsaved second-pane changes and originating Library return.
- Browser fixtures use disposable local SQLite and generated PDFs with outbound network blocked. Hosted verification is limited to release/static health reads and normal read-only viewing; no hosted test writes or content edits.

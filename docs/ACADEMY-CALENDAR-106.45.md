# V106.45 — Academic Calendar

13 October 2026. Implements the agreed Academy calendar using Hifzhelper as a design reference. Hifzhelper remains independent. The visitor timetable snapshot, existing published lessons, legacy Reboot screens and Sheets records are unchanged.

## Calendar and permissions

`/academy/calendar/` is available to signed-in Academy accounts through the shared menu and Program Calendar tool. Browse months with arrows or a horizontal swipe; tap a date for full details. Current term dates remain visible while browsing other months or years. Show existing Academy reference events and significant Islamic dates, standard South African public holidays with persistent administrator overrides, explicit Academy holidays and derived gaps between configured terms. Do not assume term holidays for a year with no configured terms.

Global Admin manages Academy terms, holidays and every active Program calendar. Program Admin manages their assigned Program terms and Academy holidays. Programs inherit Academy terms for a year until they have their own configured terms. Learners receive no teacher directory or availability data. Server-side scope checks and transaction guards enforce these boundaries.

## Availability and teaching hours

No entry means available. Support multiple weekly exceptions with multiple weekdays, optional date bounds and an all-day or time range; also support dated ranges. Dated exceptions override weekly exceptions. Within each type, the last matching entry wins. Calendar chips and day details show the resolved time blocks.

Teachers edit only their own availability. Program Admin edits teachers assigned to their learning areas; Global Admin edits any eligible teacher. Existing recurring teaching-hour restrictions remain effective and are converted into equivalent exception rules only when the person saves them in the new editor. Older availability clients cannot overwrite exception rules.

Teaching hours per week are read only, calculated from published assigned lessons. Overlapping classes count once, cancelled Course sessions and archived/cancelled Program publications are excluded. These totals do not change when availability exceptions are saved. Program validation rechecks recurring restrictions; dated exceptions produce warnings for the relevant initial week. Course validation warns about holiday and teacher-availability conflicts and invalidates an earlier validation when availability changes. None of these changes rewrite published sessions.

## Phone layout and resilience

The phone layout uses stacked selectors and forms, full-width save buttons, 44-pixel control targets, a seven-day month grid and full day details in a dialog. Wider screens expand controls and form fields side by side. Timezone names are not displayed. Calendar data uses a two-minute, account-scoped memory cache; refresh and saves invalidate it. Account changes and sign-out clear private content. Slow responses cannot mix account views. Uncertain saves keep the exact request and operation ID for safe retries; row revisions detect concurrent changes, including older D1 calendar editors.

## Database and release

Additive migration `0022_academic_calendar.sql` adds calendar scope, classification, revision, an index and a compatibility revision trigger. It preserves all existing reference fields and rows. The new service reports an explicit upgrade-required response before this migration is present. Apply only this reviewed migration; do not batch unrelated pending migrations.

Release targets: `feature/105.3.4.13`, Development website and matching Development Worker. Main/legacy production deployments are outside this release.

## Verification

All 146 backend regression files pass. New checks cover authenticated/scoped reads and writes, learner privacy, inherited Program terms, current term display across years, holiday suppression, revision conflicts and idempotent retries, availability precedence and validation, teacher edit boundaries, teaching-hour deduplication and cancelled Course sessions. Client checks cover month paging/swipe/cache, multi-day range saves, read-only hours, uncertain retries and session changes.

Native browser checks use synthetic local data: learner and teacher views, a weekly multi-day exception, a dated override, holiday management, month browsing and full day details at phone sizes. The 320-, 390- and 1280-pixel layouts have no horizontal page overflow. Worker dry-run build passed at 1738.89 KiB / 352.60 KiB gzip. A mobile screenshot is retained locally outside the release commit.

Deployment remains pending explicit owner approval for the new live schema change. Automatic approval review rejected migration 0022 because implementation/feature-branch authorisation did not include this new shared Development D1 schema change. A local export of calendar records was also rejected; no records were exported. A D1 restore bookmark was recorded instead. The existing 48 calendar entries and 2 suppression entries are unchanged; no live schema or record mutation, Worker deployment or website deployment was performed in this release preparation. Apply migration 0022 and deploy the matching Development Worker and website only after approval.

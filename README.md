# Umm Abbad Academy — V106.96

The `development` branch in `MaktabForlife/Academy` contains the Cloudflare D1 Academy application. Legacy Reboot remains in the separate `MaktabForlife/Rebootyourmaktab` repository.

- Website: https://maktab4life.org/academy/
- Pages: `academy-maktab4life`, connected to `MaktabForlife/Academy` → `development`.
- API: https://devrebootworker.maktab4life.workers.dev/
- Database: existing `maktab-academy`; no data copy or reimport in this release.
- Independent HifzHelper links remain. The cancelled shared-login integration is not part of Academy.

## V106.96 — Contact Admin and cleaner Learn/Teach pages

The homepage button now reads **Contact Admin**. It continues to open WhatsApp with the existing editable message. LEARN and TEACH no longer show the bottom shortcut-pill row below My Timetable. [Release details](docs/ACADEMY-HOME-WORKSPACE-106.96.md).

## V106.95 — Academy-branded Hifz address

Academy's Hifz links use `https://hifz.maktab4life.org/` with the current account login ID. Hifz remains hosted independently and continues to use its development Worker and D1. [Hosting details](docs/HIFZ-DOMAIN-106.95.md).

## V106.94 — Account navigation on every Academy screen

Enroll now, the PDF reader and the older Program Library pages now use the same second header as the rest of Academy. Home, Refresh, Sign out and the authorised LEARN/TEACH/ADMIN workspaces remain available across standalone pages. The reader keeps its PDF controls and fills the remaining viewport. [Release details](docs/ACADEMY-SHARED-HEADER-106.94.md).

## V106.93 — Enrolment tabs, visible Course actions and alphabetical Library

Manage Academy has an **Enrolments** pill opening **Manage Enrolments**. Manage Programs and Manage Courses include a selected-area **Enrolment requests** tab after **Review & publish**. Course lifecycle actions appear as individual buttons and keep their confirmations. Both Library views sort by subject, then displayed card title, irrespective of source or module. [Release details](docs/ACADEMY-MANAGEMENT-LIBRARY-106.93.md).

## V106.92 — Enable deployed Hifz profile delivery

Use the redirect mode supported by the Cloudflare runtime so Academy can deliver updates to Hifz. Pending profile updates remain queued and are delivered after the fix. [Verification](docs/HIFZ-DELIVERY-106.92.md).

## V106.91 — Durable Hifz profile and PIN-reset delivery

Development queues linked Hifz profile changes in the same D1 transaction, then sends authenticated updates after saving. Failures remain queued for retry. PIN resets clear Hifz credentials without sharing hashes. [Schema and rollout](docs/HIFZ-PROFILE-SYNC-106.91.md).

## V106.90 — Academy repository and development domain

Cloudflare website and existing Worker builds use the Academy repository’s `development` branch. `maktab4life.org` and `www.maktab4life.org` use the existing development API and test database. Future production will use a fresh database and separate deployment. [Deployment details](docs/ACADEMY-DOMAIN-106.90.md).

## V106.89 — Contact Admin to join, existing-user enrolment

**Contact Admin to Join Academy** opens WhatsApp directly with an editable generic message. Phone and email are available if WhatsApp cannot be used. Signed-in **Enroll now** offers website requests or WhatsApp, using the existing profile without name/number fields. Anonymous website submissions are blocked. [Release details](docs/ACADEMY-JOIN-ENROL-106.89.md).

## V106.88 — Enrolment feedback and picture announcements

Learners use **Enroll now** and a country selector (South Africa by default). The compact request form shows larger instructions, phone-format guidance, errors beside Send request, and a confirmed-send popup with OK/Cancel. Admin edits catalogue rows inline and prepares editable WhatsApp welcome messages after manual registration. Homepage announcements fill their block as picture bricks, opening the complete poster, text and links. [Release details](docs/ACADEMY-ENROLMENT-BRICKS-106.88.md).

## V106.87 — Editable copied enrolments and full announcements

Program and Course copies can include existing learners as an editable draft roster. Program class memberships and Course dates/sessions are copied with fresh local IDs; learner access stays closed until activation/publication. Clicking an announcement picture opens its full image, complete message and clickable links/PDF in one pop-up. [Release details](docs/ACADEMY-DRAFT-COPIES-ANNOUNCEMENTS-106.87.md).

## V106.86 — Copy an existing Program or Course

**New Program** and **New Course** can start blank or copy an existing learning area into a separate editable draft. Schedule settings are optional; Course dates and sessions are cleared and Programs require a new effective date at publication. Copies retain reusable structure and public cards, with fresh local IDs and no learners, access grants, enrolment catalogue/requests, attendance or progress. [Release details](docs/ACADEMY-LEARNING-COPY-106.86.md).

## V106.85 — Join the Academy and manual enrolment requests

The homepage **Join the Academy** button and Learn **Open for Enrolment** button open a shared catalogue and request form. Admin controls each Program/Course enrolment year, cost text and visibility. The editable inbox supports the Paid filter, linking or manually registering users and opening the existing enrolment tools. Payment advice goes directly to WhatsApp. Requests do not grant access or change subscriptions. [Release details](docs/ACADEMY-ENROLMENT-106.85.md).

## V106.84 — Learn and Teach layout

Programs and Courses use wider panels on desktop. The Academy label and LEARN/TEACH title match the timetable heading typography, and the marked helper sentence is hidden in these two views. Phone layouts retain stacked blocks. [Implementation and verification](docs/ACADEMY-WORKSPACE-LAYOUT-106.84.md).

## V106.83 — Teaching overview and upcoming Courses

Teach and Learn show separate Programs and Courses blocks. Global Admin navigation includes unpublished active learning areas; assigned teachers can see their own upcoming Courses. The Teach overview lists future Course dates with shortcuts to the starting timetable week and the correct planning offering. Draft details remain private to authorised staff; published sessions and live records are unchanged.

[Implementation and verification](docs/ACADEMY-UPCOMING-COURSES-106.83.md).

## Development and deployment

Install the pinned backend dependencies with `npm --prefix backend ci`. Run `npm --prefix backend test` and `npm --prefix backend run check:academy-boundary` before release.

Cloudflare Pages uses `npm --prefix backend ci && node backend/tools/academy-pages-build.mjs`, output `.academy-pages`, repository root, branch `development`. The website calls the existing Development API on stable and preview addresses.

Deploy the matching API with `npm --prefix backend run deploy:development`. The default deploy command also selects Development. This branch contains no deployment configuration for the legacy production Worker.

Changing a website or Worker Git branch selects code only. The Development database, uploaded files, sessions and Open Library metadata retain their existing storage identities. Test edits therefore affect this shared Development data.

## Storage and recovery

Keep the existing D1, assessment and lesson-media buckets, shared public-media bucket, login rate limiter and `PROGRAM_TIMETABLE_COORDINATOR` binding. Its deployed class name remains stable to preserve Open Library metadata. `ACADEMY_OPEN_LIBRARY_STORAGE_KEY` stores the complete existing Cloudflare object name and has no Google dependency.

Offline snapshot validation, import verification, provenance and recovery tools remain under `backend/tools/academy-migration/`. They read saved snapshots; the online Google capture client has been retired. No database migration runs during ordinary deployment.

[Cleanup scope, checks and infrastructure inventory](docs/ACADEMY-DEVELOPMENT-CLEANUP-106.82.md). Earlier implementation history is retained in `docs/` and [the archived README](docs/archive/README-through-10681.md); historical instructions are not current deployment guidance.

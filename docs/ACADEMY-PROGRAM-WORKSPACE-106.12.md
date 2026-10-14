# V106.12 Program workspace

The owner authorised this batch for feature release on 11 October 2026. Target: `feature/105.3.4.13`, deploying the development website and `devrebootworker`. The production-named Worker remains legacy. D1 remains authoritative.

## Program Admin

Open Programs → Open Program Admin. Program name, default/optional classes, class teachers, shared Academy curriculum, Program Zoom and recurring timetable are available from one compact workspace. Scoped Program Admin may change its name/public card and scoped records; Global Admin retains inherited authority everywhere. Only Global Admin edits the shared catalogue. People and Library tools retain their existing scopes.

New Programs create one class named `[Program] Class [Academy year]` atomically with registration. Existing classes and historical duration data are retained. No Program dates are added. Sessions require one or more active classes and at least one active authorised teacher for validation/publication. Drafts may remain incomplete and shareable with the unvalidated stamp. Program Zoom takes precedence over session Zoom, then class Zoom. Combined classes with one teacher need one shared link.

## Availability and timetables

Teaching calendar → Edit availability records recurring weekday teaching hours in Africa/Johannesburg. No record or an empty list means available without restrictions. Once ranges are entered, a session must fit entirely inside a range on that weekday. A teacher may edit only their own ranges; mutation guards recheck the current teaching designation/assignment and session atomically. Change history and notices are saved in the same guarded batch. Relevant Program/Course scoped administrators and all active confirmed Global Admins receive in-app notices. There is no email or background polling.

Validation fingerprints saved draft, current catalogue and teacher availability. Later changes remove stale Valid presentation, including history exports. Publication rechecks all requirements and requires an effective date after today; the editor defaults to tomorrow. Copying a current/history timetable creates a new stable ID and editable draft. Published snapshots remain immutable. Archive/cancel adds a lifecycle overlay; it never deletes lessons or revives an older publication. New-ID copies preserve source provenance. Existing attendance and learner access continue to use the established projection.

Program, teacher and class previews use the existing image/PDF renderer. States are Draft (not validated), Valid (ready), Published, Archived and Cancelled; PDF stays on one page. Live joining always performs a fresh access/time/publication check, independent of cached metadata.

## Public card JSON

Each Program has one `public_card_json` value in D1:

```json
{"time":"7am","title":"Ladies Alimiyah","description":"4 yr structured scholarship of **Quran, Sunnah, and Islamic law**"}
```

Limits: time 12, title 80, description 240 characters. The compact editor previews the card and saves all fields together with the Program. All three fields are required together, or all may be empty to hide the card. Program name, session start times, teachers and curriculum never supply fallback card text. The daily public JSON file copies only these whitelisted public fields; escaped text supports paired `**bold**`. Other/private JSON keys and all meeting URLs are excluded. Course cards retain their established flow. Public card edits appear with the next shared daily snapshot.

## Schema and verification

Migration `0012_program_workspace.sql` adds the public JSON field, teacher availability/change/notice tables, timetable records and publication lifecycle overlays. It changes no existing accounts, credentials, roles, subscriptions, classes or publication snapshots. Main D1 was privately backed up on 11 October, then received only migration 0012. All six schema probes and foreign-key checks passed; 73 accounts, 101 role records and 12 publications were retained. No public card content or teacher availability was inferred/imported. For future installations, apply only this migration after checking schema and backing up D1; historical migrations in the directory are already installed through controlled upgrades and must not be replayed.

Local verification: **138/138 regression files pass**; the seven new Program cases cover guarded retries, scope/privacy, availability, stale validation, copies, immutable cancellation, draft sharing, rollback and public JSON cards independent of actual 10:00 lessons. Browser acceptance covers class/curriculum/card saves, validation, tomorrow publication, new-ID copy, teacher notices and availability clashes, unrestricted clearing, desktop/mobile layout and PNG/one-page PDF. Worker build verified with `deploy --env development --dry-run`; no hosted load tests. Synthetic preview disabled all outbound service fetches.

Keep the [V106.11 handoff](WEBSITE-DEVELOPMENT-HANDOFF-106.11.md) for the remaining Course, media/subscription, teaching-tool and role agreements. This release implements Program availability and lifecycle work; it does not finish protected media or the placeholder teaching tools.

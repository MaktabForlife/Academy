# V107.96 — Live joining and session card controls

The user requested deployment of the live-only course header join action and session card refinements. Preserve V107.95 on `feature/surah-kahf-course-companion`. The phone title row and desktop course header show Join now only for a scheduled session with an authorised opaque join reference between its published start and end instants. The session card join window still begins five minutes early. One local timer advances these states without repeated feed reads; account changes cancel it and hide both header actions. Clicks use the existing fresh join endpoint, preserving subscription, account and time gates.

Recording controls have a common 56px height and a responsive width capped at 160px, with plum highlighting and two visible label lines. The full label stays in accessible text. Visible dates omit years while machine-readable dates remain complete. Finished session times are hidden, with a timezone-aware fallback for older media without timetable instants. The shared header Refresh reuses the course refresh action; its duplicate content control is hidden by the existing shared shell rule. No migration, data/settings change or coordinator deployment.

Validation: all 137 regression test files passed, including synthetic clock checks before the early-join window, at the lesson start and after the end, header join delivery through the existing endpoint, account-switch timer cleanup and course-timezone handling for older media. The Academy boundary check passed (150 modules, zero Google backend clients), as did the matching API dry build and the normal Pages build (783 public files). Active release markers agree on 107.96 and the public package excludes protected readings/PDFs and synthetic preview entrypoints. These timing checks use local fixtures; no live timetable or account data was changed to simulate a lesson.

# V107.95 — Course layout refinements

The user explicitly requested deployment of the combined session cards, home page simplification and Contents typography changes. Release from `feature/surah-kahf-course-companion`, preserving V107.94. Each session card holds its timetable details, joining action and matching published recordings/notes. Older published media stays accessible, and local tests verify the action mapping after sorting. The home page omits its schedule strip, breadcrumb and repeated bootcamp heading; the course title carries a small BOOTCAMP label instead. Contents uses larger headings and lesson titles, less spacing and flexible rows with a 44px minimum touch target. Two phone columns, existing login, publication gates and Course materials downloads remain. No schema, live data or coordinator change.

Validation: all 137 regression files passed (the five runtime files needed local server permissions), the Academy boundary check passed with 150 modules and zero Google backend clients, and both the Development API dry build and normal 783-file Pages build passed. Release markers agree on 107.95; the public package excludes protected course readings, the course PDF and synthetic preview entrypoints. Live playback and the PDF download were confirmed by the user before this refinement; they were not repeated with a live account for this release.

# V107.94 — Surah Al Kahf course follow-up

The user authorised deployment after reviewing V107.93. Branch `feature/surah-kahf-course-companion` incorporates `6774854c` and preserves its mobile Learn/Teach changes.

- Learn, Teach, Admin-Learn, Admin-Teach and Admin dashboards show the course website card to their existing authorised course audiences. Teach and Admin retain separate Teaching tools / Manage course links.
- The Surah Al Kahf Teach Contents menu includes Course website. Its normal Timetable, Attendance, Planning, Assessment, Lesson media and Library tools retain their existing destinations.
- The course uses the shared Academy identity/dates, account switching, Home/Refresh/Sign out and workspace controls. Verified Admin authority appears as the shared compact badge with Curriculum access and read-only preview context.
- Course sessions and Lesson media use two columns on phones. The four published sessions appear together, without week controls. Additional published media stays available. Empty material cards show that attachments are not published yet.
- The authorised course feed resolves its bounded date span from the selected course's accepted publications. It reuses the existing account/class timetable projection and returns session references without meeting URLs. Joining is freshly authorised at click time; video expiry and attachment permissions are preserved.
- PDF and reflection downloads appear only under Course materials. Duplicate download shortcuts and course print controls/instructions are removed.
- The dashboard card occupies one grid column instead of expanding across an empty row. Other courses retain their layout and current availability rules.

No database migration, private coordinator deployment, timetable publication, live material upload or live data/settings correction is included. Local synthetic fixtures cover the course feed, all dashboard realms, Teach menu, headers, account changes and publication gates. Full regression and build results are recorded below before release. Hosted verification uses static/version metadata and one API readiness call; no live student acceptance run is required.

V107.94 local validation passed: all 137 regression test files, the Academy boundary check (150 modules, zero Google backend clients), the normal Pages build (783 public files) and the Development API dry build. Tests include all five dashboard realms, the Teach Contents link, the four-date published course feed, account/class boundaries and download placement. Public build checks exclude the course PDF, backend lesson source and synthetic preview entrypoints. Signed-in playback has not been checked with a live account.

## V107.89 — historical implementation and initial release

Branch: `feature/surah-kahf-course-companion`. The preparation was based on V107.85; the authorised release incorporates deployed V107.88 (`f569350d`). The user confirmed V107.88 was live and explicitly authorised deployment as the next release, V107.89. No live data/settings/schema changes are included.

## Student experience

The Surah Al Kahf dashboard course card opens the new cream/plum mobile-first course website. Existing learner course links for timetable, lesson media, Library and assessments also lead to the relevant website section. Teacher workspace links retain their original course screens so dated/recurring note uploads, material editing and other teaching tools remain available. Course management, attendance and planning destinations remain in their existing tools; Admin management navigation is retained. Explicit Teach links from a Learn page also retain their teaching destination.

The supplied course text is arranged into eleven lessons with selectable English and Arabic text, Qur’an/hadith source attributions, word studies, six journaling prompts, reflection exports and lesson progress. The readings contain no PDF page references, original-source prompts or “from the booklet” narration. Separate PDF download/print controls and print-current-lesson remain available. Progress/reflections stay in the current browser, scoped to a server-derived account/course key; they do not sync.

The Sessions section uses the current authorised media feed and the published timetable, with manual week navigation and refresh. It displays published recordings, session PDFs and Teacher note attachments. Playback and PDF opening reuse the existing media reader. Join is freshly authorised at click time. Additional course PDFs appear under Materials. Assessments embed the existing learner/teacher component and preserve its approval and release controls. No communications are sent.

## Access and delivery

- Course identity is obtained from the existing dashboard activity. A name match chooses presentation only; it grants no access.
- The opt-in `includeCourseCompanion: true` flag on the existing media feed returns static lesson content only after its usual account, role/subscription, activity, feature and publication checks. Normal feed output/cache identity is unchanged.
- A published Course PDF collection must be available. The selected PDF prefers the Nurturing System/Surah Kahf title or filename; a single PDF is accepted. Ambiguous unmatched collections do not release the edition.
- Public website assets contain no lesson content module, verse module, source PDF or verse JSON. The private API module retains all lesson text. PDF bytes are obtained from the existing protected streaming download endpoint.
- The approved course reader retains its own phone contents/navigation and dashboard return link instead of adding the general workspace banners. It loads the shared read-cache/refresh helper before course features. Its account-switch and revocation fences are covered by the course client tests.
- The current Academy bearer session and workspace/accepted-setup wrapper are reused. Tokens are never put in URLs. No separate account or login service is added.
- Account/session changes clear the mounted text, dialogs and pending requests. Delayed responses are discarded. Browser back/forward restoration reloads authorization. Visibility return refreshes the authorised feed without polling.
- No new database schema, private coordinator change, SQL migration, live upload or publication is needed. Existing published PDF availability is checked at runtime.

## Source and validation

The supplied PDF has 18 pages: cover plus teaching pages 2–18. Its teaching material was extracted, visually compared with rendered pages and arranged as eleven readings. Duplicate overlaid PDF text was removed. Qur’anic Arabic was checked against Quran.com; the mirage quotation reference is 24:39, correcting the printed 24:3. The supplied translations and narrative attributions were retained; this work does not re-grade narrations.

Local checks:

```
node --test backend/tests/academy-course-companion.test.mjs backend/tests/academy-course-companion-client.test.mjs backend/tests/academy-lesson-media.test.mjs backend/tests/academy-workspace-client.test.mjs backend/tests/academy-entrance-ui.test.mjs
```

Tests cover the authenticated full edition, unrelated/signed-out access denial, revoked roles/sessions, hidden/unpublished collections, distinct owner scopes, account changes during delayed responses, no static text/PDF leakage, standalone reading content and dashboard destinations. Existing media and workspace suites cover protected download/playback, publication scopes and delayed parsed response guards. Additional local source/asset checks cover every page and download integrity.

Mobile visual verification completed on 27 October 2026 using the existing signed-in private review tab, without retrying the blocked local preview. The checked review source is `d3a7c64d74b5840abcf8ed723ce9cbeb3b0f7692`; the Academy reading markup, reader script, fonts and styles match it.

- All eleven lessons checked at 320 px (18 px and maximum 24 px reading text), 390 px (maximum 24 px), and 430 px (18 px): 44 page/size combinations, with no horizontal overflow.
- Visually inspected Arabic vowel marks and wrapping, the long closing title, all six journaling fields, phone contents and bottom navigation, home, theme cards, session cards and download controls. Landscape at 844 × 390 retained a scrollable contents dialog and reachable close control.
- The browser-downloaded PDF matched the supplied original byte for byte. Download/print controls fit the phone layout; no physical printing was performed.
- No browser console warnings or errors were reported. Temporary viewport and text-size changes were restored. These are browser viewport checks, not physical iOS/Android device tests.
- [Lesson list screenshot](qa/surah-kahf/lesson-library-390.png), [Arabic ayah](qa/surah-kahf/arabic-ayah-320.png), [journaling](qa/surah-kahf/journaling-390.png), and [layout measurements](qa/surah-kahf/layout-audit.json) are retained for review.

The authenticated portal shell and live session/assessment connections were checked with disposable local fixtures and the Academy asset/API build, not with live student accounts or live database-backed acceptance runs. No new portal code has been deployed. The first post-release check should therefore verify one authorised course opening using the existing login and one session/material view, with minimal live reads.

V107.89 release validation passed: all 133 regression test files, the Academy boundary check (149 modules, no Google backend clients), the Development API dry build, and the normal Academy Pages build (781 public files, including 21 course files). The 41 targeted course/media/workspace checks are included in this coverage. The resulting website artifact contains neither the lesson source module nor the course PDF. Build output is ignored. Current release/version/cache labels are V107.89 and the built source includes V107.88.

## Release workflow

The user lifted the branch hold after V107.88 completed. V107.89 incorporates that release and uses matching API/website versions and asset cache labels. Run the required local regression/boundary checks and normal API/Pages builds; verify that public assets exclude the backend lesson text and course PDF. Publish the matching Development API and website, keeping live verification to release/static metadata and one readiness check. No database or coordinator update is needed.

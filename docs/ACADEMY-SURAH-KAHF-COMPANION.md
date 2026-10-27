# V107.89 — Surah Al Kahf course website

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

# V106.55 — Academy announcements and planning refinements

Based on Features V106.54 (`e4acf98e`). The user lifted the release hold on 13 October 2026 and authorised continuing and deploying.

## Announcements

- Admin → Announcements is available to Global Admin, since these announcements appear Academy-wide to visitors. Program/Course admins retain their scoped tools.
- Heading, plain-text message, optional JPEG/PNG/WebP image up to 5 MB, image description, Active switch and display order. New announcements start inactive.
- The current-list table supports Edit, Delete and adding more announcements. Up to 200 current entries; deleted entries are removed from the current list and public delivery, with audit history retained.
- The home panel is wider toward the left on desktop and full-width on phones. All active messages cycle every 12 seconds with Previous/Next and Pause/Play controls; focus, hover, hidden tabs and reduced-motion preferences pause automatic cycling. Posters are contained without cropping and open in a full-size dialog.
- Metadata is stored in D1; images use the existing private Development lesson-media R2 bucket under a separate announcement prefix. Only active linked images are public. Global Admin can preview inactive images through authenticated requests.
- Saves use bounded multipart bodies, image-type/signature checks, revision conflicts, exact retry receipts, audit and transaction-time authority checks. A pending save retains its form and image in the open page; navigation/refresh is guarded. Image keys include their content digest so concurrent retry payloads cannot overwrite each other. Replaced/deleted linked images are cleaned up after commit. A failed database write may leave an inaccessible unreferenced object, avoiding deletion races with simultaneous retries.
- The supplied poster was a reference; no announcement content is seeded into the live database.

## Planning and menu

- Admin selects a Program or Course in Planning and opens “Planning requirements and deadlines” to switch Plans required off/on. This applies to the whole selected Program/Course, including its offerings.
- Optional areas produce no missing-plan expectations. Existing submissions remain readable, and teachers can submit optional plans while the area remains open.
- Required missing cells display only “Not submitted”. Extensions remain available on submitted plans.
- Each subject/class section has one teaching-plan box. Older objectives and resources are combined into that editable box without altering historical submitted snapshots. A4 exports and admin feedback remain available.
- Surahs in my Heart, Kaaba puzzle and the existing Voice Recorder entry follow 2026 Prospectus. Recorder access retains its existing rules.
- V106.54 already applied the requested “Surahs and Duas Tracker” wording; this release retains it.

## Storage and release

`0024_announcements_and_plan_requirements.sql` adds an announcement table and a separate default-on planning requirement table, preserving compatibility with the previous Worker during rollout. No existing plan content or learner records are corrected. Back up Development D1 before applying this additive upgrade, then push the matching versioned website and Worker to Features and verify hosted versions and public/authenticated route behaviour.

## Verification

- 75 affected automated tests pass, including authentication, scoped permissions, inactive image privacy, invalid/oversized images, stale revisions, exact retries, rollback, transaction-time revocation, optional plans, Course lifecycle, assessments and release versions.
- 17 announcement browser checks pass, covering 320/390/768/1440 px layouts, portrait image upload/preview, inactive entries, lost acknowledgements, multiple active entries, automatic cycling, controls, full posters, deletion and unsaved navigation.
- 26 planner browser checks pass, including legacy objectives/resources in the one-box editor, optional requirements preserving submissions, missing-cell wording, A4 exports, feedback and permissions.
- Worker dry-run build, JavaScript syntax and whitespace checks pass. Development D1 was backed up privately before the additive migration. No real announcement was inserted by acceptance checks.

# Tafseer monthly subscriptions — local implementation — 27 October 2026

- Add a per-student whole-year checkbox for all 12 months, while keeping individual months editable. Whole-year and individual edits use the existing bulk Save changes flow. Keep this local on the feature branch; do not push or deploy.

- The user requested a simpler checkbox grid: Tafseer students in the first column, expandable year groups 2024/2025/2026 that reveal month columns, and student search. Replace the month-by-month cards with this grid, support saving edited cells across months atomically, and preserve lesson-month access, recording retention and historical media entry. Keep the feature local; do not push or deploy.
- The user now authorizes implementing the reviewed plan locally on this feature branch, including retaining Tafseer recordings beyond 14 days. Support dated historical lesson/media entries for lessons before the app, explicitly including 2024 and 2025, and explicit historical student/month subscriptions. This supersedes the planning-only hold below for local implementation.
- Do not push, deploy, apply hosted migrations, change live data or bucket lifecycle rules. Use disposable synthetic local databases/objects, preserve other Programs' access/retention and current release markers. No other-chat communication or delegation was requested.

# Tafseer monthly subscriptions — local planning — 27 October 2026

- The user requested a new feature branch and a local plan for a Tafseer Monthly subscriptions tab. Work on `feature/academy-tafseer-monthly-subscriptions`, based on the local V107.100 Development commit `0e767b892e7cb69c6b6447576aef8ad61c15ac1b`.
- The paid month follows the parent lesson's month, not the upload date. A recording added later to an October lesson belongs to October access. Students retain access to every month they paid for when they stop renewing; monthly classes are unnecessary.
- This stage is planning only. Save the implementation plan in `docs/ACADEMY-TAFSEER-MONTHLY-SUBSCRIPTIONS-PLAN.md`. Do not implement runtime changes, apply migrations, alter live data/settings/storage, push, deploy or contact other chats. Earlier release approvals below apply to their completed releases only.
- Plan against the existing Program identity, scoped Admin authority, historical lesson audiences, private media delivery and split-store permission checks. Address archive navigation and the existing 14-day MP4 retention explicitly. Preserve unrelated work and use disposable local fixtures for a later implementation.

# Compact course reading release — 27 October 2026

- The user explicitly requested deployment of the reviewed compact headers and full-screen reading option. Release V107.100 from `feature/academy-course-website-builder`, preserving deployed V107.99 (`965d7c51`). This supersedes the local-only hold below for this release.
- Deploy the matching Development API and Academy website. No database migration, coordinator update, live course content publication or settings change is required. Preserve login, current permissions, existing recordings/PDFs, draft safeguards and normal Admin Curriculum access.
- Use the tested local reading/account fixtures, release integrity and public asset checks. Hosted verification stays limited to matching release/static assets and one readiness call under ../AGENTS.md. Do not contact other chats. Future deployments require fresh authorisation.

# Compact course reading follow-up — 27 October 2026

- The user requested the account ID and action icons on one compact row, removal of the menu attached to the Admin role, smaller reading-page headings, and an optional full-screen reading view without app headers.
- Apply the fixes to the current Surah Al Kahf reader and reusable course website reader on `feature/academy-course-website-builder`. Preserve login, account switching, course permissions, native session/media and reading controls. Curriculum remains accessible through the Admin tools menu.
- V107.99 deployment is complete. Keep this follow-up local; do not push or deploy until requested. Use local functional fixtures and source/build checks. The previously recorded browser local-URL restriction remains in effect; do not work around it.

# Course website builder connection and release — 27 October 2026

- The user explicitly requested connecting and deploying the desktop Admin Website builder, with Course websites in the Admin menu opening a list of websites to edit. Work on `feature/academy-course-website-builder`, incorporating deployed V107.98 (`8e502ba4`), and release as V107.99.
- This authorises implementing guarded course-scoped drafts/uploads, explicit publication, editing the existing Surah Al Kahf website and additive split-store schema changes required by this feature, followed by the matching coordinator/API/website release. Preserve all existing course/session/media/login/assessment permissions and V107.97 behaviour. Do not publish course content or change timetables on the user's behalf; the deployment exposes the editor, and Admins explicitly publish their later edits.
- Use disposable local fixtures and minimal hosted schema/version/static/readiness checks under ../AGENTS.md. Keep existing database IDs, accepted heads, records, secrets and storage. Do not bootstrap, reseed or export live databases. This supersedes the earlier design-only release hold for this implementation and deployment only.

# Course website editor design — 27 October 2026

- The user requested reusable templates using all Surah Al Kahf components, direct web-lesson entry and arranged Canva PDF/image uploads, then explicitly requested a feature branch. Work on `feature/academy-course-website-builder`, based on deployed V107.96 (`168a4698`).
- The user clarified that course authoring is a desktop function. Prioritise a desktop Admin workspace with a persistent outline, editor and adjacent student preview; keep published student pages mobile first. Mobile authoring is not a release requirement.
- The current deliverable is the working local editor design in `designs/course-website-studio/`, with browser-local drafts and student previews. Production course storage, login integration, publishing and migrations are a separate implementation stage described in `docs/ACADEMY-COURSE-WEBSITE-BUILDER.md`.
- Keep the current portal and release markers unchanged. Do not push, deploy, export source to external hosting, apply SQL or alter live data/settings without fresh authorisation. Previous release approvals apply to their completed releases only.
- Use synthetic local fixtures. The managed browser rejected local HTML URLs, and automatic approval review rejected external private-preview source export as beyond feature-branch authorisation; do not work around either denial. A self-contained local HTML file is available for the user to open manually. Browser visual checks remain pending.

# Header, Menu and Imtehaan release — 27 October 2026

- The user explicitly authorised deployment of the reviewed local changes. Release V107.98 to the existing Development API and Academy website. This supersedes the local-only hold below for this release.
- Include the reference header with username-only highlight, standard Menu and separate X, four Admin upcoming cards in a 2×2 grid, two-column published Imtehaan cards including assignment windows, and Global Admin daily timetable grouping in Admin-Learn/Admin-Teach. Exclude draft/registered, complete, cancelled and archived Imtehaan; preserve access and publication gates.
- No migration, live data correction, settings/binding change, timetable publication or private coordinator deployment is required. Keep hosted verification small, using versions/static assets and one API readiness check. Do not contact other chats. Future deployments require new authorisation.

# Header, Menu and dashboard review — 27 October 2026

- The user explicitly said **do not deploy**. Keep all follow-ups after V107.97 local, including Global Admin daily timetable grouping. Do not push or contact other chats.
- Rebuild the shared header to the supplied reference: Academy/version and dates above; welcome, highlighted username only and highest role on the left, actions on the right. No extra Admin text inside the yellow name highlight. Retain account/PIN safeguards, workspace navigation and Curriculum access.
- Use the supplied white Menu/hamburger button throughout navigation; replace visible Contents labels. Give Close a separate column so it cannot overlap Menu.
- Admin Coming up next shows up to four permitted Course cards in a 2×2 grid on phone and desktop, with the open arrow at each card's top right.
- Rename dashboard Assessments to Imtehaan and show two columns: small Program/Course name, Imtehaan name, date window and open arrow. Include published dated exams and assignment-based Imtehaan regardless of dates; exclude REGISTERED/DRAFT, COMPLETE, CANCELLED and ARCHIVED. Preserve role/class/publication boundaries.
- Reboot's missing card was confirmed with two bounded read-only Development metadata queries: its 16 published papers are ASSIGNMENT/UNTIMED with no exam_date, using available_from/due_at. Fix the safe dashboard metadata and date-window rendering; do not modify live records or assessment types.
- The user cancelled the full screenshot/PDF review-pack request. Local synthetic phone/desktop screenshots for verification remain appropriate; do not create that PDF pack.

# Global Admin reader timetable grouping — 27 October 2026

- After V107.97, the user requested one daily timetable card per Program or Course, explicitly including Global Admin's Admin-Learn and Admin-Teach views. Extend the dashboard grouping to those readers and their Program/Course timetable pages, with all permitted lessons/classes and actions retained in the information dialog.
- Use the verified real-account `workspaceAccess.globalAdmin` value; keep projected reader permissions, class filtering, fresh join checks and ordinary/scoped Admin grouping unchanged. No backend, schema or data changes are required.
- Verify with disposable local fixtures. Keep this follow-up local pending a new deployment request; the V107.97 deployment authorisation below was completed. Do not contact other chats.

# Dashboard and Program mobile refinement release — 27 October 2026

- The user confirmed V107.96 was deployed and explicitly requested deployment of the accumulated dashboard and mobile refinements. Incorporate V107.96 and release V107.97 through the existing Development API and Academy website workflow.
- Include compact Admin identity/navigation, dashboard and Program slide-in menus, management/upcoming grids and icons, highest-role labels, two-day Today-focused timetables and empty-day cards, Notes icons without + Note, phone assessment cards and course-scoped This course Library selection. Preserve V107.96 Surah Kahf joining, recording controls and course access.
- Keep this chat independent. Use disposable local fixtures and small hosted version/static/readiness checks under ../AGENTS.md. No schema, live data/settings, private coordinator or timetable publication changes are required. Future deployments require fresh authorisation.

# Surah Kahf live joining release — 27 October 2026

- The user requested deployment of the prepared recording-button/date/finished-time refinements and removal of the duplicate visible Refresh control, and reiterated that a Join lesson action should appear in the course header only while the link is live. Release V107.96 from `feature/surah-kahf-course-companion`, preserving V107.95.
- Deploy the matching Development API and Academy website through the existing workflow. Preserve fresh join permission/time checks, current login/account boundaries, publication gates, two phone columns and downloads only through Course materials. No migration, live material upload, timetable publication, data/settings change or private coordinator deployment is required.
- Use disposable local fixtures for checks, including live-only header timing and account cleanup. Keep hosted verification to release/static metadata and one readiness check under ../AGENTS.md. Future deployments require fresh user authorisation.

# Surah Kahf course refinement release — 27 October 2026

- The user explicitly requested deployment after reviewing the combined session cards, removal of home page schedule/duplicate heading rows, small BOOTCAMP course label and more readable, compact Contents menu. Release V107.95 from `feature/surah-kahf-course-companion`, preserving V107.94.
- Deploy the matching Development API and Academy website through the existing workflow. Preserve login, account boundaries, permissions, publication gates and downloads only through Course materials. No migration, live material upload, timetable publication, data/settings change or private coordinator deployment is required.
- Use synthetic local regression fixtures and keep hosted verification to release/static metadata and one readiness check under ../AGENTS.md. Future deployments require fresh user authorisation.

# Surah Kahf follow-up release — 27 October 2026

- The user explicitly requested deployment after confirming V107.93 and clarifying that the course is visible in Learn. Release the reviewed follow-ups as V107.94 from `feature/surah-kahf-course-companion`, incorporating deployed V107.93 (`6774854c`). This authorisation lifts the review-only hold for this release.
- Add the course website card on all authorised dashboards and a Course website link to Surah Al Kahf Teach Contents. Preserve existing teaching/management tools, login, permissions, class preview and publication gates. Use shared compact headers/Admin badge, a narrow dashboard card, all published course sessions and Lesson media in two phone columns, and downloads only through Course materials. Remove print controls and duplicate download shortcuts.
- No migration, private coordinator deployment, live material upload, timetable publication or live data/settings change is required. Use synthetic local fixtures for full checks; keep hosted verification to release/static metadata and one readiness call. Future deployments require fresh user authorisation.

# Mobile Learn/Teach Development release — 27 October 2026

- The user checked the isolated mobile preview, then explicitly requested building and deploying the tested Learn/Teach changes to Development, confirming V107.89 was deployed. Merge `819ab547` into the tested mobile branch and release V107.93 through the existing Development API and Academy website workflow. This supersedes the preview-only holds below for this release.
- Preserve V107.85–89 remembered account/PIN switching, PDF toolbar/zoom/colour updates, Library rows and the Surah Kahf course website. Include the shared reading layout, Contents, compact headers/Admin badge, phone planner dates/icon actions, standard X Close and clearer Refresh icon.
- Keep sample preview entrypoints, accounts, credentials and isolated storage out of Development deployment. Do not reseed or modify either database. No migration, private coordinator deployment, timetable publication or live data correction is required.
- Keep this chat independent. Use disposable synthetic fixtures for full checks; keep hosted verification to release metadata, one API readiness call and targeted static asset checks. Future deployments require fresh user authorisation.

# Clearer Refresh icon preview — 27 October 2026

- The user requested a more intuitive Refresh icon, using their open circular-arrow example. Replace the shared Academy header icon while retaining its labels, touch target and refresh/draft-guard handlers. Release V107.92 only to the existing isolated preview.
- Preserve preview storage, credentials and sample plans. Do not reseed, run hosted SQL, push, deploy Development/live or contact other chats. Verify the icon visually at phone and desktop sizes; this change needs no new behavioural tests.

# Sample Admin preview entry — 27 October 2026

- The user explicitly requested an Admin option on the mobile preview to test the Admin badge on their phone. Add Open Admin using the existing synthetic Global Admin account and open Admin-Teach directly. Release only the isolated preview as V107.91.
- Keep the fixed sample-account allowlist and preview-origin/synthetic-only guards. Preserve existing credentials, D1/R2 bindings, saved plans and other test data. Do not reseed, run hosted SQL, push, deploy Development/live or communicate with other chats.
- Verify the real preview login flow with disposable local fixtures and a small hosted phone check. Retain the V107.90 compact headers, badge and standard X controls.

# Compact headers and Admin badge preview — 27 October 2026

- The user requested shorter Learn/Teach headers on mobile, standard top-right X Close controls on mobile/desktop, and replacing the extra Admin banner with an account badge. Keep this on the existing isolated preview as V107.90.
- Retain dates, identity, workspace authority, accessible action names, Curriculum access and 44px touch targets. Preserve unsaved-entry safeguards and existing handlers.
- Deploy only academy-mobile-first-preview, retaining its sample D1/R2 bindings, secrets and drafts. Do not push, deploy Development/live, apply SQL or communicate with other chats.
- Verify locally in Chrome/WebKit and at enlarged text sizes; keep hosted smoke checks small.

# Mobile planner phone correction — 27 October 2026

- The user reported iPhone date controls extending past the screen and requested compact icons for Save, Submit, Download and Share in one row. Update the existing isolated preview as V107.89.
- Keep date inputs native, put the revert icon immediately left of Load a plan, retain accessible full action names and short visible captions, and maintain at least 44px touch targets. Preserve save, submit, export, share and draft safeguards.
- Deploy only academy-mobile-first-preview with its existing sample D1/R2 bindings and secrets. Preserve phone-test drafts. Do not deploy Development/live, push a Git branch, apply SQL or contact other chats.
- Verify in Chrome and WebKit at phone/tablet/desktop sizes, including 200% text. Keep hosted checks targeted to the preview.

# Isolated mobile preview release — 27 October 2026

- The user explicitly requested deploying this feature branch to a preview link for phone testing. Release the V107.84-based mobile feature as preview V107.88, after checking that remote Development is V107.87.
- This authorises creating a dedicated preview Worker with new synthetic-only D1/R2 resources and its own secrets. It supersedes the local deployment hold only for this preview. Do not update the live Development API, coordinator, website, databases or settings.
- Keep this chat independent; do not communicate with other chats. Provide Learn/Teach sample-account links. Use local fixtures for full verification and a small targeted hosted smoke check.

# Local mobile-first Learn/Teach development — 27 October 2026

- The user explicitly requested starting the proposed mobile-first development on a new feature branch from V107.84. Work on `feature/academy-mobile-first`, based exactly on `5a1731c0` (V107.84).
- Implement the shared Learn/Teach reading structure, compact Contents navigation, comfortable text and touch controls; add wider layouts on that same structure. Preserve the swipeable timetable, current permissions, saved drafts, accepted publications and assessment release gates. Admin management and the public website retain their current layout.
- Keep work in this chat. Do not contact other chats, push, deploy, run live SQL or alter hosted settings. Assign a new release version only when preparing an authorised release. Cache labels may identify this local feature build.
- Verify with synthetic local fixtures and phone/tablet/desktop checks under ../AGENTS.md. No live database checks are needed.
# Surah Al Kahf student course release — 27 October 2026

- The user confirmed V107.88 was deployed and explicitly instructed deploying the prepared Surah Kahf course package. Incorporate V107.88 into `feature/surah-kahf-course-companion` and release V107.89 through the existing Development API and Academy website workflow. This supersedes the earlier local branch hold for this course release only.
- Use existing Academy login, course permissions and publication gates. Keep the eleven web lessons, mobile layout, protected recordings/materials, PDF download and print. Preserve Teacher editing tools, Admin navigation, V107.88 PDF controls, Library rows and remembered account switching.
- No migration, private coordinator deployment, live material upload or timetable publication is required. Keep live checks small under ../AGENTS.md: local disposable fixtures, release metadata, static checks and one API readiness check. Future deployments require fresh user authorisation.

# PDF toolbar update — 27 October 2026

- The user requested the annotated PDF reader changes: two header rows with PDF workspace controls on the lower row; compact AUTO/ACTUAL zoom labels without grey shading; favourite colours inside Border/ink and a matching Fill palette. Follow the user's latest instruction to deploy completed work to Development.
- Work on `feature/academy-pdf-toolbar-layout`, incorporating deployed V107.87, and release V107.88. Preserve the Library row correction, account switching, editable annotations, scrolling after Edit is off, bookmarks, fullscreen recovery and current permissions.
- No database migration, live record correction, PDF.js engine upgrade or private coordinator change is required. Keep live checks small under ../AGENTS.md, using synthetic PDFs/accounts locally and targeted deployment/static/version verification.

# Library display correction — 27 October 2026

- The user reported clipped Public Library subject headings and changed screen headers, and explicitly requested a correction deployed to Development, followed by a review of the live site.
- Work from current Development V107.86 on feature/academy-library-display-fix. Release the verified correction as V107.87. Preserve remembered account IDs, PIN switching and all existing permissions.
- The mobile-first feature remains on its separate V107.84-based branch. It is not part of this Development correction. Do not communicate with other chats.
- The confirmed Library defect comes from shrinking automatic grid rows when bookmarks and subjects exceed the drawer height. Preserve natural row heights and scroll the list. Verify headers against deployed assets before making unrelated layout changes.
- Deploy the matching Development API and Academy website with no schema, data or coordinator change. Keep live checks small; use synthetic local fixtures for full display checks.

# Remember-ID default follow-up release — 27 October 2026

- The user requested Remember my ID selected by default, then explicitly asked to deploy the completed follow-up to Development. Release V107.86 from `feature/academy-account-switching`, incorporating deployed V107.85.
- Apply the selected default to Login, personal-link login/PIN setup and Switch account. Respect an explicit untick and Remove/Forget all. Preserve fresh PIN checks, session revocation, private cache cleanup and unsaved-work guards. No database or coordinator change.
- Keep live checks small under ../AGENTS.md. Use disposable local accounts and targeted release/version/static verification. Future deployments require fresh user authorisation.

# Remembered-ID account switching release — 27 October 2026

- The user explicitly requested building and deploying the approved remembered-ID / fresh-PIN account switcher on a new feature branch. Work on `feature/academy-account-switching`, incorporating deployed V107.84, and release V107.85 through the existing Academy Development website and API workflow.
- Remember IDs and optional names only after successful opt-in login. Every switch requires server PIN verification. Preserve current permissions, scoped caches, pending-work guards, existing rate limits and revocations. No database migration or private coordinator change is required.
- Keep live checks small under ../AGENTS.md. Use disposable local accounts and targeted deployment/readiness/static checks. Future deployments require fresh user authorisation.

# Permission and timetable/calendar optimisation release — 27 October 2026

- The user explicitly approved deploying the tested permission and timetable/calendar optimisations. Release feature/academy-permission-timetable-reads as V107.84, incorporating deployed V107.83. This supersedes the local deployment hold below for this release only.
- Deploy the backward-compatible private split coordinator first, then the matching Development API and Academy website. No database migration, backfill, timetable republishing or live data correction is required.
- Preserve current permissions, sessions, revocations, time-based grants, write guards, accepted publication boundaries and all V107.83 features. Keep live checks small to limit database usage: use local regression/runtime tests, management deployment metadata, one API readiness check and targeted static/version verification.
- Future deployments require fresh user authorisation.

# Local permission and timetable/calendar read optimisation — 27 October 2026

- Work on local `feature/academy-permission-timetable-reads`, based on deployed V107.83. Reduce repeated permission proofs and published timetable/calendar reads without changing behaviour or permissions.
- **Do not push, deploy, apply live SQL or change live settings until the user approves.** Previous deployment permissions applied only to their completed releases. Assign a release number only when preparing an authorised release.
- Keep live checks small to limit database usage. Reuse saved analytics and measure with disposable local fixtures. Keep live session validity, revocations, scoped roles, subscriptions and time-based grants current. Preserve publication and release gates.

# Shared lesson PDF release — 27 October 2026

- The user confirmed V107.82 was deployed and explicitly authorised deployment of the prepared PDF reuse change. Incorporate V107.82 and release V107.83 from `feature/academy-shared-pdfs` through the existing Development API and Academy website workflow. This supersedes the local deployment hold below for this PDF release only.
- Keep each lesson attachment and Teacher note version independent, with current permissions, audience, immutable history and the 16 MB limit. No database migration or private coordinator change is required. Preserve all V107.82 planner/dashboard changes.
- The user confirmed timetable cards are no longer an issue. No timetable-card behaviour changes are included. After deployment review yesterday's Cloudflare read/write analytics using management metadata only. Keep live checks small; no live SQL, publication or backfill. Future deployments need fresh authorisation.

# Local PDF reuse and timetable-card investigation — 27 October 2026

- Work on local `feature/academy-shared-pdfs`, based on V107.81. Reuse identical lesson PDF bytes while preserving each attachment, immutable note history and all current permissions. Investigate stale teacher names on Admin/Teach Class notes and Lesson media cards after a timetable publication.
- The user explicitly instructed **dont deploy**. Do not push, deploy, apply live SQL, republish live timetables or change live data/settings. Prior deployment permissions apply to their completed releases only.
- Keep live checks small to limit database usage; use local fixtures. Preserve other unfinished planner work in the original checkout. Assign a release number only when preparing an authorised release.

# Planner and Admin dashboard release — 27 October 2026

- The user confirmed V107.81 was deployed and explicitly requested “pls build and deploy” for the pending planner and Admin dashboard follow-ups in this chat. This supersedes the investigation-only hold for PLAN-02/03 and DASH-01–05. Release V107.82 from the verified V107.81 baseline through the existing Development API and website workflow.
- Keep work in this chat; do not communicate with other chats. Preserve current permissions, saved plans, publication/release gates and V107.81 features. No database migration or coordinator update is required.
- Keep live checks small under ../AGENTS.md. Use disposable local fixtures for behavioural checks and targeted release metadata/static checks after deployment.

# Curriculum and workspace correction release — 27 October 2026

- Complete the authorised NAV-01 follow-up from “UI and lesson updates” and the user's direct instructions in this chat: remove the extra Curriculum chooser; rename the previous subjects screen Curriculum management; add Programs/Courses navigation tabs; make subject status editable; restrict the Global Admin dashboard workspace menu to exactly the nine supplied items without changing its formatting; add a Public Library source option when attaching lesson PDFs.
- Work on local `feature/academy-curriculum-navigation`, based on deployed V107.80, and complete this active correction release as V107.81 through the existing Development API/website workflow. Preserve the other V107.80 features, current permissions, automatic homepage refresh and Update timetable fallback.
- No database migration or private coordinator update is required. Keep live checks small to limit database usage. Use disposable local fixtures and targeted version/static release checks. Future deployments require new authorisation.

# UI and session update release — 27 October 2026

- The human user explicitly requested “pls pass to optimisation for deployment” in “UI and lesson updates”; the verified handoff authorises implementing, testing and deploying SPDF-01, PLAN-01, NAV-01, SETUP-01 and QUICK-01. Release the complete batch as V107.80 from `feature/academy-ui-session-updates`, incorporating deployed V107.79.
- Deploy the backward-compatible private split coordinator first, then the matching Development API and Academy website. Preserve the automatic homepage snapshot refresh and Update timetable fallback already authorised in this chat.
- Keep current permissions, immutable accepted snapshots, unrelated drafts, explicit timetable publication, assessment approval and learner release gates. No database migration or live data correction is required.
- Keep live checks small to limit database usage: use disposable local fixtures, release metadata, one API readiness check and targeted static asset verification. Future deployments require new authorisation.

# Homepage refresh page-coverage correction — 26 October 2026

- Complete the user's authorised automatic-refresh deployment as V107.79, loading the shared helper on every Academy workspace page. Preserve V107.78 and its planning-image follow-up. Test actual Program publication locally before deploying the matching Development API and website.
- No database migration or private coordinator change. Keep live checks small to limit database usage. The separately authorised UI/session batch follows this correction.

# Homepage refresh release — 26 October 2026

- The user explicitly requested restoring automatic homepage snapshot refresh after publishing, retaining Update timetable as a fallback, local testing and deployment. Release as V107.78 to the existing Development API and Academy website.
- Include the planning-image follow-up directly authorised by the user in “v107.71 assessment”: preserve PDF text size and allow a single image up to two page heights. No database migration, live data correction or private coordinator change is required for this release.
- Keep live checks small to limit database usage. Use disposable local fixtures, one targeted API readiness check and static release verification.
- The five-category UI and lesson update batch was separately handed over with direct user deployment authorisation from “UI and lesson updates”. Implement and test that following this release; preserve this automatic refresh and its fallback when replacing the extra setup-publication workflow. Other future deployments require new authorisation.

# Sign-in handover release — 26 October 2026

- The user explicitly requested deploying the sign-in transition when ready. Incorporate V107.74 (`473a12ea`) and release as V107.75 to the existing Academy website and matching Development API.
- Show a neutral dashboard loading screen and use verified session contexts to choose the destination before timetable loading. Preserve workspace authority, revocations, explicit website visits and deep links. No database migration or private coordinator change is required.
- Keep live checks small to limit database usage. Use disposable local fixtures and minimal version/readiness and static asset checks. Future deployments require new approval.

# Header and Admin dashboard release — 26 October 2026

- The user explicitly requested deploying the reviewed header recovery and daily Admin timetable cards. Release `feature/academy-header-dashboard-fixes` as V107.73 to the existing Academy website and matching Development API.
- This authorisation supersedes the local-only hold below for this release. No database migration, live data correction or private coordinator change is required.
- Preserve one card per Program or Course per day for Admin, current scoped permissions and joining windows. Keep live checks small to limit database usage; use local fixtures and minimal version/readiness verification.
- Future deployments require new user approval.

# Local header and dashboard fixes — 26 October 2026

- Work on `feature/academy-header-dashboard-fixes`, starting from deployed V107.72 (`29293ea2`). Implement automatic Hijri-date recovery and one daily card for each Program or Course on the Admin dashboard, with an explicit class choice for joining.
- Keep this work local. Do not push, deploy, apply SQL or change live settings without a new user deployment approval. Earlier release approvals apply only to those releases.
- Preserve current permissions and joining windows. Use local fixtures for validation and keep live checks small to limit database usage.

# Read optimisation release — 26 October 2026

- The user confirmed V107.71 is deployed and explicitly requested deploying the reviewed read optimisations. Incorporate V107.71 and release as V107.72 to the existing Development API, private split coordinator and Academy website at `https://academy-maktab4life.pages.dev`.
- This approval supersedes the local-only hold below for this release. No database migration or live data correction is required.
- Preserve V107.71 assessment tables, learner submissions and permissions. Keep live verification small: reuse release metadata, run local disposable fixtures, and perform only targeted version/readiness checks.
- Future deployments still require user approval.

# Local read optimisation follow-up — 26 October 2026

- Work on `feature/academy-read-optimisation-2`, based on V107.70, to reduce remaining reads and assess reusable published assessment snapshots for learners.
- Do not push, deploy, apply hosted SQL or change live settings until the user approves. This overrides earlier release authorisations below.
- Preserve app behaviour and permissions. Keep sessions, revocations, learner ownership, release gates and time-based access current.
- Keep live checks small: reuse saved analytics and use local disposable fixtures for implementation and measurements.

# Messaging release — 26 October 2026

- The user explicitly requested deploying messaging after confirming V107.68 was deployed. Release V107.69 from `feature/academy-messaging` to the existing Development API and website, including only the additive Core messaging schema upgrade.
- Incorporate deployed V107.68 first. Preserve its read optimisations, session videos, fourteen-day expiry and scoped permissions.
- Keep FMA integration, PWA/push, transactional email and learning-event automation deferred. Preserve the swipeable timetable.
- Follow `../AGENTS.md`: keep live verification small; use disposable local fixtures for the 200-recipient check. Do not send test broadcasts to real accounts.
- This request supersedes earlier local-only deployment holds for this release. Future deployments require user authorisation.

# Session video release — 26 October 2026

- The user explicitly requested deployment of the session video feature after confirming V107.67 was deployed. Release this work as V107.68 to the existing Development website and API targets, including the required split-store attachment schema upgrade and the native fourteen-day recording expiry rule.
- Work on `feature/academy-session-videos`, originally created from `c62c901274881c191163586c33d55e2d8720a9ee`, incorporating deployed V107.67 (`385b1675`). This supersedes earlier branch/deployment holds for this release only.
- Recordings inherit existing session permissions. Automatic Zoom imports remain deferred. Apply expiry only to `dev-split-v1/session-recordings/`, preserving other bucket rules and media.
- Follow the shared `../AGENTS.md` live-usage rule. Keep hosted checks targeted and small; use disposable local fixtures for regression coverage. Future deployments still require user authorisation.

# Academy read optimisation release — 26 October 2026

- The user explicitly authorised completing this deployment on 26 October 2026, after the daily reset. Deploy verified V107.67 from `feature/academy-read-optimisation` to the existing Development targets, including the additive Core snapshot upgrade, private split coordinator, API Worker and matching website.
- This authorisation supersedes the 25 October deployment/database hold for this release. Future deployments still require the user's authorisation.
- **Keep live checks small to limit database usage.** Prefer local disposable fixtures; batch targeted metadata/version/schema checks, avoid broad live scans or acceptance runs, and do not repeatedly poll database-backed endpoints. Follow the shared `../AGENTS.md` rule across project work.

# Current Development workflow — 24 October 2026

- Work directly on `development` until the user changes this instruction; do not create feature branches.
- The user authorises deploying verified updates to Development immediately until further notice, without a separate deployment request. Deploy the matching website and Development Worker together.
- Prefer local tests and disposable fixtures. Keep live verification minimal because D1 row reads and Worker requests have usage limits.

# Feature branch version rule

- Every update pushed to a `feature/*` branch must include a new release version in that same push. This applies to code, assets, tests, documentation and project-rule updates. Do not push a feature-branch update with the previous release number.
- Use the version requested by the user. Otherwise increment the last numeric component of the current version, and check the remote branch first so the number is not reused.
- Keep the active version markers in sync: root `version.json`, `js/version.json`, `backend/package.json`, `backend/package-lock.json`, the Worker health response, current page version labels, and tests that assert the current version. Change cache query strings for assets updated in the release.
- Add a concise entry to the current release documentation and README. Keep older version references when they describe historical behaviour or earlier acceptance work.
- Before pushing, verify that the active version markers agree, run the affected tests, and check the diff for accidental changes to historical notes.

# Release authorisation — 13 October 2026

- The user lifted this release hold on 13 October 2026 and explicitly authorised building and deploying all reviewed UI changes. Deploy the Development website and matching Development Worker when verified. This UI release requires no live database corrections.
- Show `None` for an account with no assigned role or Course subscription.
- Global Admin is an Academy-wide authority, independent of Program roles and Course subscriptions. Show inherited authority clearly and retain access to every Academy management area when implementing new features.
- Global Admins automatically inherit Program Admin in every Program and Course, including newly created learning areas. Scoped edits must not revoke that inherited role.
- Courses support the same Student, Teacher and Program Admin roles as Programs. Course Program Admin authority is scoped to assigned Courses; only Global Admin has Academy-wide authority. Module media subscriptions remain separate.

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

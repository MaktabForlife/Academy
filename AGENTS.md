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

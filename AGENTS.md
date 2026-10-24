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

# Circles Admin Curriculum continuation — local only

The owner requested a single “Manage Curriculum” dashboard action instead of a management list of programmes/courses. The matching Target view removes only that Admin list. Learn and Teach retain their activity panels.

The existing signed, one-use Academy continuation now accepts `dashboard:{mode:'admin',tool:'curriculum'}`. It returns `/academy/admin/#administration/curriculum`, whose existing native controller chooses the authorised Global Admin Subjects & Modules page or scoped Program/Course management. This avoids duplicating those role-based destinations in Circles.

The tool is unavailable in Learn and Teach; existing current-session/Admin-context checks and one-use handoff remain. No role/purchase/schema/media changes, hosted queries, push or deployment.

Validation: paired Target `tests/circles-dashboard.test.mjs`, with `ACADEMY_SOURCE=../Academy-circles-curriculum-link`, passes. It exchanges the real local synthetic bridge, verifies native Global Admin context and Admin return ownership, and rejects learner access and the tool in Learn/Teach perspectives. Existing cache and forged-workspace checks also pass. Target view checks pass separately.

UI follow-up: the existing native Curriculum page already includes the shared Circles theme, while its page-specific layout, heading and stale version label still need the owner's requested UI review. Keep that work in the UI list. This contract patch does not claim that review is complete.

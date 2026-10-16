# V106.83 — Programs, Courses and upcoming teaching

- The Teach/Learn header and individual activity headers separate Programs and Courses into labelled blocks. Role labels and independent HifzHelper links are retained.
- Global Admin navigation includes every active Program and Course, including unpublished Courses. Teachers and scoped administrators can see unpublished learning areas only where they hold a verified staff assignment. Public and student publication rules remain intact.
- Teach includes an Upcoming Courses block, independent of the selected timetable week. It shows future published offerings and authorised draft metadata, ordered by start date. A name-only draft remains in navigation until dates are entered.
- Published offerings include **Show starting week** and **Planning**. Planning opens the selected offering and normalises its first lesson date to the planner's teaching week. Drafts show their dates and stage; the planning shortcut becomes available after publication creates an offering.
- Surah Al Kahf's existing published dates are **18 October–8 November 2026**. It was absent from the screenshot's 11–17 October timetable because that week precedes its first lesson. Its saved schedule is not changed.
- A new daily cache key prevents old saved home responses from hiding the added planning metadata after deployment.

No database migration, data correction, new branch or new Cloudflare resource is required. The Development site and existing `devrebootworker` deploy from `development`; the legacy `main` branch remains separate.

Validation covers scoped upcoming Course metadata, private draft visibility, revoked roles, immutable published timetables, and upcoming lesson planning. Packaged browser checks cover Global Admin, assigned teacher, student and unrelated teacher views at 390px and 1440px, including navigation to the starting week and the correct Course offering.

Staff home requests reuse the safe Course catalogue and add four read statements in two database calls. The synthetic peak test checks this explicit budget (35 statements across check/login/session/staff home) and separately verifies that learner home requests retain their original three-call budget. Anonymous and learner requests do not load the planning catalogue.

Release checks: all 69 backend test files passed after updating the explicit staff query budget; eight packaged browser role/viewport checks passed with no page errors or failed API requests. The source boundary check reports zero Google backend clients. Both the Development Worker and Pages bundles compile successfully.

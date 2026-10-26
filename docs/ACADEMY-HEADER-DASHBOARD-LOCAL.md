# Header recovery and Admin dashboard — local only

Branch: `feature/academy-header-dashboard-fixes`, based on deployed V107.72 (`29293ea2`). The app version remains V107.72 until a new release is approved. This work is not pushed or deployed and requires no database migration.

## Hijri date recovery

The browser retries unavailable, failed, malformed or stale date responses after one minute while the page is visible. Focus and visibility events reuse any pending lookup and respect the retry interval. Returning online may attempt recovery immediately. A stalled request aborts after twenty seconds, then follows the same retry schedule.

Today's last valid cached date stays visible while an expired cache is refreshed, even when that refresh fails. Yesterday's value is never displayed as today's. Fresh cache entries retain the existing fifteen-minute reuse policy. Once a lookup succeeds, the page needs no further date requests until the South African midnight boundary. Late responses crossing midnight cannot replace the new day's date.

The source and date rules are unchanged. The original live failure's cause remains unconfirmed. The existing public header-date route bypasses D1; this fix adds no database reads. Hidden tabs suspend repeat attempts. No live source checks were performed during implementation.

## Admin timetable

The existing weekly Admin dashboard shows **one card per Program or Course per day**. Each card combines that area's lessons across classes, meeting rooms and personal teaching/learner assignments. Global Admin sees every authorised area; scoped Admin sees only its assigned areas. Learn, Teach, Admin-Learn/Teach previews and individual Program timetables keep their existing behaviour.

Opening the card lists each Program, lesson, class, teacher and time. **Join class** appears for currently open lessons, with attachment and Class Note actions available in the picker. A picker button stays bound to the lesson the user selected even if a background refresh rebuilds the timetable grid.

Joining uses the existing server endpoint and current authority/publication checks. The five-minute opening window and lesson end remain enforced. Meeting URLs are resolved at join time, rather than put into cards or storage. Revoking Global Admin access rejects joins from an already-open picker. The rollup adds no timetable queries; it groups rows already loaded for the dashboard.

## Verification

- Fourteen header-date checks cover automatic recovery without a focus event, unsuccessful HTTP/JSON/network/stale/empty replies, retained current-day cache, midnight, overlapping events, timeouts, blocked storage and the existing D1-free route.
- Thirty-two focused regression cases pass, including header recovery, timetable roles, teacher labels, scoped permissions, navigation, media, cached reads and current version integrity.
- Local browser checks verify one daily card for each of two Programs and one Course, including multiple classes and separate rooms. All five lessons join their correct rooms through the real Worker. Checks also deny a revoked Global Admin, preserve scoped Admin visibility and keep an open picker stable across a background grid refresh. Desktop, 390px and 320px screenshots were inspected.
- Matching website assets build locally. No Worker configuration, permission rule, database schema or live record is changed.

The existing Student, Teacher and scoped Admin role-dashboard browser runner also passes against the current UI. Its old Class Note selector was updated from Messages to For your attention, and its removed dashboard Teaching hours expectation now verifies that workload stays absent. Header-date responses are synthetic so the runner never contacts Jamiat.

Local evidence: `outputs/academy-header-dashboard-local/` in the project workspace. Keep live checks small to limit database usage. Deployment requires a separate approval and a new release version.

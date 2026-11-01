# Native circle lesson Join

Source-only local feature based on the reviewed complete Source checkpoint
`317b3988570b513c4f8ca627e2a8c7228b7223f8`. No schema, binding, credential,
session duration, timetable or media changes. Optimisation owns final composition
and the matching Academy/Studio release.

## Checked dashboard reference

The signed dashboard summary has `nativeJoinVersion: 1`. Its eligible scheduled
native timetable rows retain `joinAvailableAt` and `timezone` and carry:

```json
{"nativeJoin":{"joinKey":"<existing native serialized lesson reference>","date":"YYYY-MM-DD"}}
```

This is an existing publication/occurrence reference, never a new session ID or
meeting URL. Cancelled/preview rows and mapped Studio-owned/frozen rows carry no
native Join reference. Existing activity/audience filtering and row limits stay
in place. A mapped Studio row stays on its existing Studio Join path and paid/live
gates. The Source resolver independently checks ownership even if an older
dashboard still contains a reference.

Consumers should upgrade an older cached dashboard once when its version marker
is absent. Keep the normal account-bound snapshot policy thereafter. Display the
button using the existing `joinAvailableAt`/`endsAt` values; a timer can update the
display without polling Source. The displayed button never grants access.

## Click-only signed resolver

```text
POST /internal/website/lesson-join
HMAC: existing maktab-web-v1:POST:/internal/website/lesson-join
{issuedAt, sourceRef, mode: "learn"|"teach"|"admin", joinKey, date}
=> {success: true, joinUrl: "https://..."}
```

The ordinary signed bridge validates the request age and current Source session,
admission, epoch and expiry. Input rejects extra fields, invalid modes, keys over
1200 characters, invalid dates and malformed native reference shapes. Programme,
Course and Substitute references use their existing native formats; a Substitute
assignment resolves its current activity for the signed account.

The resolver checks the selected mode against current native availability and
checks the exact activity's ownership using the existing Core0019 NOCASE index.
`FROZEN` or `STUDIO` returns `409 STUDIO_JOIN_REQUIRED`; Source-only membership
cannot replace Studio paid/live checks. Unmapped Academy programmes are supported.

It mints only the existing same-sid native request token and invokes the normal
accepted-reader `/api/academy/lesson/join` dispatch with the selected workspace.
That unchanged handler reprojects the one-day current native timetable and checks
audience, publication, cancellation, calendar and the five-minute-to-end window.
No synthetic roles, memberships or session/expiry extension are created. Its
native Learn preview remains a preview and does not become a learner identity.

After that await, Source rechecks its native permission state, activity ownership
and bridge admission/session state. The URL is returned with `private, no-store`;
it is never written to a dashboard, outbox or persistent receipt.

The Target consumer belongs to Circles: authenticated, Origin-checked
`/api/circles/lesson-join`, with current local actor/session/epoch/mode rechecked
after Source responds. Return the HTTPS URL only for the deliberate click, clear
any placeholder window if the account/view changed, and never persist the URL.
Existing public-free joining and Studio `ws-*` session routes are separate and
unchanged. Do not fall back to this Source resolver after a Studio rights denial.

## Local evidence and limits

`backend/tests/academy-circles-native-join.test.mjs` covers seven Source checks:
safe dashboard projection; exact open/end milliseconds for an Academy-only
programme; input/HMAC/mode/copied-reference denial; current class/admission/epoch/
session withdrawal; actual Teacher/Admin and Learn-preview boundaries; native
programme cancellation; Studio/FROZEN ownership; and an admission change during
the awaited resolver. Test sessions are created before the application Date mock
because SQLite's `strftime('now')` remains on the real clock.

The focused run adds public-free/calendar/native workspace/Teacher bridge
regressions: **19 passed, zero failed/skipped**. This is the actual Source Worker
handler with disposable split fixtures, not a hosted meeting Join or final Target
browser acceptance.

Parent evidence directory: `outputs/circles-native-join-20261101/`. The independent
local workerd/D1 lookup measurement uses the exact new ownership SQL:

| One ownership query | Rows read before / after 4000 unrelated owners | Writes |
| --- | --- | --- |
| Academy owner | 2 / 2 | 0 |
| Studio owner, case-insensitive | 1 / 1 | 0 |
| Unmapped Academy activity | 0 / 0 | 0 |

The plan uses `website_platform_ownership_nocase`. The actual resolver performs
this ownership check twice, plus the existing native session/permission/timetable
readers and a final bridge session check. Substitute references add an indexed
assignment lookup. The dashboard ownership metadata reuses its existing bounded
mapping query, with no new per-row request. These measurements cover only the new
ownership SQL, not complete HTTP cost, inherited permission-reader growth or
hosted billing. Final paired/UI integration and existing native read limits remain
with the complete release acceptance gate.

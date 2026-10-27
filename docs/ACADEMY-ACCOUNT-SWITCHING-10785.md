# V107.86 follow-up — Remember ID selected by default

The user requested that Remember my ID on this browser start ticked, followed by an explicit request to deploy to Development. The default is selected in Academy Login, personal-link login/PIN setup and Switch account, including Use another ID and a later sign-in. Explicitly unticking it still prevents remembering that ID. Remove and Forget all preserve their deliberate clearing behaviour; PIN verification and session switching are unchanged.

The existing browser acceptance now verifies all four default states, automatic remembering without clicking the checkbox, explicit opt-out after successful PIN verification and the selected default on the next switch. Release V107.86 on the same feature branch. No database migration or coordinator deployment is required.

# V107.85 — Remembered IDs and PIN-protected account switching

AUTH-01 implements the user's approved proposal on `feature/academy-account-switching`, based on deployed V107.84 (`5a1731c0`). The user explicitly requested building and deploying this feature on a new feature branch. Preserve existing permissions and the previous release's read optimisations. No database schema, private coordinator or live record correction is required.

## Behaviour

- Academy Login and personal-link PIN login/setup offer **Remember my ID on this browser**, unchecked initially. Only successful, server-verified sign-ins may add an ID. The local list contains at most ten IDs, optional display names and last-used timestamps, scoped to the configured API. It contains no PINs, session tokens, permissions or role grants. Saved values are validated, bounded and rendered as text.
- Remembered IDs appear in Login and **Switch account**, available in the common account header and from the account name. Selecting an ID clears and hides the PIN. **Use another ID**, **Remove** and **Forget all remembered IDs** remain local operations. Ordinary sign-out retains remembered IDs; clearing site data removes them.
- Every switch submits a fresh four-digit PIN to the existing login endpoint, retaining its rate limits, current account status and permission checks. Wrong PINs, unavailable service and cancellation preserve the original account. A delayed response after cancellation revokes the unused new session when its token is received.
- Existing unfinished-work guards block switching until work is saved or closed. The prior session is revoked only after the new PIN succeeds. An already-ended prior session is accepted as ended. Other logout failures keep the prior account and discard the unused replacement session.
- Successful switching clears previous private response caches, account context and workspace; owner-scoped draft recovery remains intact. The app loads a new document at the neutral Academy entry point and derives its workspace from verified server roles. This full document load is essential because changing only the hash would retain the previous account's in-memory state.
- Other Academy tabs clear private cached data, cover/inert the old interface and open the new account's workspace. A tab whose browser navigation is held by an unsaved-work prompt keeps the previous interface covered, with an Open account recovery action. Back/forward restored documents also check account ownership.
- Restored/loading tabs treat their previous local account ID as a hint, never as authority to invalidate a newly server-verified token. Aborted requests from the prior workspace cannot sign every tab out. Account changes reset the workspace generation before a full page reload, so old Admin checks cannot redirect the new account during the handover.

One active account remains shared across Academy tabs in that browser profile. Remembered IDs do not authenticate a user, sync to another device or add another persistent login session.

## Local verification

- Four unit checks cover bounded/sanitised ID storage, recent ordering and deduplication, corrupt/blocked/quota-limited storage, removal and cache cleanup without losing owner-scoped drafts.
- The complete backend suite passed 126/131 files within the sandbox. The five tests requiring local loopback ports were rerun outside the sandbox and all passed (six runtime checks), completing 131/131 files.
- Browser acceptance uses the real API Worker with disposable local accounts: optional remembered login, wrong/missing PIN, cancellation including delayed successful response, unfinished work, failed prior-session logout, session revocation, private cache cleanup, cross-tab workspace changes, untrusted labels/role hints, persistence/removal, personal-link login and an already-ended session. Layouts are checked at 320, 390, 768 and 1440 pixels.
- Existing Login, account and shared navigation regression checks pass. Website and matching API builds must pass before release.

Keep live release verification small: management deployment metadata, one API readiness request and targeted static/version checks. Do not log in as live users, query hosted account tables or run local acceptance against the live service. No automated messages are sent.

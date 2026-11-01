# Account metadata and read verification reuse

Local feature only; deployment is on hold. This extends the return-cache branches based on the verified paired V109.4 release.

## Read boundary

The shared Academy workspace helper coalesces empty `/api/account/session` reads from the navigation, Participants and Admin startup. It retains a navigation/account metadata copy in this tab's session storage for up to 12 hours, bounded by the signed token's existing expiry. The key identifies the token by SHA-256; a returned token is never copied. An unavailable hash/expiry disables persistence. This is UI metadata, not server authority.

Account switching, sign-out, a known session/permission denial, an explicit permissions-change event and successful account/access mutations discard the copy. Delayed replies remain account-fenced. Standalone account/sign-out paths remove the saved copy too. Network failures are not cached or polled.

Studio ordinary course, Tafseer, MOU, published media, catalogue and selected scoped Admin GET/table reads use the ordinary 43,200-second age, even when the reader is Admin/Teacher. The read-only intent is set by server routes/allowlisted commands, never accepted from browser role fields. Current local actor, session, credential epoch, scoped roles, ownership, publication and acquired material rights remain checked. A received master-account fence overrides reuse.

The Academy Participants proxy checks the current native session and scoped Admin authority. It reuses the existing account/access projections while their actor epoch, scope generation and 12-hour age remain valid. Pending identity, role, scope and access events are still delivered. Indexed, actor-specific stream heads determine reuse; no participant sweep or new schema is needed. Read-only requests no longer manufacture another account/access event. The signed transport proof remains short-lived.

## Sensitive boundary

Save, enrolment, roles, access changes, media attachment/publication and website mutations retain the 60-second Admin proof and atomic current permission/epoch guards. Source proxy saves always rebuild current actor authority. Handover and correction planning retain their existing stricter checks. Live Join still checks its existing fresh authority, audience, class/date, publication and five-minute timing rules. Reading timetable metadata does not authorise joining.

No PIN/password is stored or requested by this reuse. No session duration is extended. Existing Hifz code and hosted state are untouched.

## Evidence

Project-parent `outputs/academy-account-read-reuse-20261101` contains local client/security logs and bounded native read budgets. Tests use disposable D1/R2 fixtures; no live logins, hosted SQL, production analytics, media changes or deployments are required. These are synthetic request/row counts, not a daily traffic forecast or production speed measurement.

A separate product gap remains: the Tafseer Surah table currently requires a completion date at creation, so an ongoing Surah cannot use a truthful open/close workflow yet. No placeholder date, Surah creation or playlist publication is included here.

## Future paired composition

Compose the read-aware Studio runtime before the Source proxy optimisation: the old Source works with the new target, while a reused Source Admin read proof can outlive the old target's one-minute read policy. Include both commits in the same approved Academy/Studio release. Merge the separately owned startup/Teach/UI changes explicitly, especially any edits to `m4l-academy-workspace.js`; never overwrite them with this feature checkout. No content attachment/publication or new Surah workflow is implied.

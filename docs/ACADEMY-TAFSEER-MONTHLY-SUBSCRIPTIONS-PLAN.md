# Tafseer monthly subscriptions: local implementation plan

Status: **planning only**, prepared 27 October 2026. No feature code, migrations, live records, storage policies or deployed assets have changed.

Branch: `feature/academy-tafseer-monthly-subscriptions`.

Baseline: local `origin/development`, V107.100, commit `0e767b892e7cb69c6b6447576aef8ad61c15ac1b`. The branch is in a separate worktree so existing work stays independent. This plan does not claim a fresh remote synchronization.

## 1. Agreed behaviour

Tafseer remains a **Program**. Add a monthly subscription register rather than creating a new class each month or treating it as a Course subscription.

1. An administrator records a student's subscription for a specific calendar month, including its year, such as October 2026.
2. That subscription grants access to the permitted Tafseer lessons belonging to that month and their attached media.
3. Determine the month from the parent lesson's trusted `lesson_date`. Upload time, recording release time and the date payment was recorded do not determine access.
4. An October lesson's recording added in November is October media for access purposes. It remains attached to that October lesson.
5. Paid-month access persists without renewal. A student can hold October and December access without holding November access.
6. Ending current enrolment or changing current class must not remove an existing paid-month entitlement. An explicit correction/revocation can remove a grant, with an audit trail.
7. Existing account/session safeguards, lesson publication/withdrawal and genuine staff authority still apply. A month grant does not create staff privileges or access to other Programs.

Examples:

| Student's recorded months | Lesson date | Recording added | Student access |
| --- | --- | --- | --- |
| October 2026 | 20 October 2026 | 5 November 2026 | Allowed |
| November 2026 only | 20 October 2026 | 5 November 2026 | Denied |
| October 2026 only | 3 November 2026 | 3 November 2026 | Denied |
| October 2026; no later renewal | 20 October 2026 | Viewed in February 2027 | Allowed, with retained media available |
| October and December 2026 | 10 November 2026 | Any date | Denied |

This feature records access for paid months. Automated billing, payment collection, invoices, refunds, monthly class creation and changes to live-lesson joining are outside the first implementation.

## 2. Admin tab and recording workflow

Proposed location: **Programs → Tafseer → Participants → Monthly subscriptions**. Keep the existing participant/role editor alongside it. Show the subscription subtab only when the server identifies this Program as using monthly media subscriptions and the actor can administer it.

The register opens on the current month in the Program's configured timezone. The administrator can choose any past or future month; year is always visible. Changing the selected month never copies grants into another month.

Suggested layout:

```text
Tafseer / Participants
[Participants] [Monthly subscriptions]

Month: [October 2026 ▾]        [Find a student…]
Showing: [All / Subscribed / Not subscribed]

Student             Subscribed   Payment reference / note   Last updated
Amina               [✓]          OCT-014                    Admin · date
Fatimah             [ ]          —                          —

2 additions · 0 removals                         [Discard] [Save changes]
```

- Offer current students and a scoped search/add-existing-student action so former students and late payments can be recorded. Display existing subscribers even if they are no longer currently enrolled.
- Use the status **Subscribed** for an active month grant. An unchecked row means no month access; it is not an accounting claim about an outstanding debt.
- Store an optional payment date, short reference and administrative note. Record who changed the entry and when automatically. Do not collect banking credentials or card details.
- Default the covered class/cohort from the student's historical Tafseer audience for the selected month. If the Program has a single class, keep this simple. If multiple or missing historical audiences make the result ambiguous, show the covered class and require an explicit scoped selection before granting; never guess or silently broaden it.
- The first version uses manual confirmation of a paid subscription. Recording a late payment for October unlocks October, even if entered in November.
- Show the exact additions/removals before saving. Removing an existing grant is an explicit **Remove month access** correction with a reason. Preserve the previous record in history.
- Save only edited entries. Search, pagination, filters and unchecked rows that were not edited must never revoke hidden or unloaded subscriptions.
- Keep drafts on validation failure or conflict. Guard month changes, Program changes, refresh and navigation while there are unsaved edits. Account switching clears private drafts and ignores responses for the previous account.
- Use a month revision and row revisions for concurrent editing. A stale save returns a conflict with current values; it must not overwrite another administrator's change.
- Retry a lost save response with the same actor-bound operation identifier. The interface shows success only after the committed result is confirmed.

Desktop uses a compact table. Mobile uses labelled student rows/cards with the same controls, clear saved/unsaved state and no horizontal page overflow. Preserve keyboard operation, accessible tab labels and existing touch-target conventions.

## 3. Learner experience and lasting access

In Learn, Tafseer Lesson media shows a month selector and the student's available months, including past months. An unpaid month shows a simple access message without leaking lesson titles, attachment metadata or direct media URLs.

Current session context construction depends on current roles. Therefore the implementation must add a **media-only archive capability** for an account with retained monthly grants. A former student must still be able to find Tafseer and open their paid months after losing the current Student role.

That capability must not manufacture a Student role or grant attendance, live joining, assessments, planning, other classes or staff tools. Retain the normal enrolment workflow for those functions. Current class/role edits must not erase the historical audience covered by an existing month grant.

Do not compare a granted month with today's month or expire it at the start of the next month. No renewal process should delete previous grants. Account disablement, session revocation, withdrawal of a lesson and an explicit grant correction remain effective immediately. Existing Program lifecycle restrictions remain in force; any future archive-wide publication policy is a separate decision.

## 4. Data and ownership proposal

Use additive **Core-owned operational authority** records. These are live permission facts, not timetable definitions or immutable accepted-setup snapshots. Proposed names below are new design names, not existing APIs or tables.

| Record | Proposed fields and purpose |
| --- | --- |
| `program_monthly_media_policies` | Stable `activity_key` primary key, enforcement state, retention mode, revision, activation/update actor and timestamps. Opt in only the verified Tafseer Program. |
| `program_monthly_subscriptions` | Unique `(activity_key, account_id, lesson_month)`, active/revoked state, revision, optional payment date/reference/note, update actor and timestamps. `lesson_month` uses validated `YYYY-MM`. |
| `program_monthly_subscription_audiences` | The durable class/cohort references and any applicable date ranges covered by that grant. Retain them when current enrolment changes. Enforce the same Program scope. |
| Audit/receipts | Use the existing audited transaction and operation-receipt infrastructure, preserving changes and reasons without putting payment notes into learner-facing responses. |

Index both the student's available months and the Program/month register. Keep the current grant row plus an audit history, rather than deleting and recreating records on renewal. Validate account identity, month, Program kind, applicable class references, note lengths and expected revisions on the server.

Do not reuse `course_subscription_decisions`: it is a per-Course active decision, has no month, and its revocation is tied to current Student-role changes. Do not derive paid months automatically from a current Student role, a class membership, the Program's Paid label or an old Course subscription.

Historical opening subscriptions require a reviewed explicit list of student/month grants. Empty policy tables preserve other Programs' behaviour. For an enabled policy, unavailable grant storage must produce an unavailable/denied result rather than falling back to broad enrolment access.

The new dataset must be explicitly recognized by scoped Admin transaction guards, split ownership/column/federation definitions, permission revision rules and local fixture schemas. Restrict register reads to the selected Program/month with pagination; do not load every account or export a broad live register to render one month.

## 5. Authoritative access rule

For a learner opening monthly-protected Tafseer media:

```text
valid active account and current session
AND allowed Program lifecycle and published/visible parent lesson
AND a grant for this account + this Program + parent lesson YYYY-MM
AND the lesson audience is covered by that grant's historical cohort
```

Apply the existing genuine staff exceptions using current verified authority and workspace rules. A projected Admin-Learn preview is read-only and must not be used to create grants. Teachers cannot record subscriptions solely because they teach Tafseer. Global Admin or a genuine Tafseer Program Admin can manage the register in the Admin workspace; another Program's Admin cannot.

Derive the month from the server-resolved parent lesson's `lesson_date`, already tied to the trusted published session. For a date such as `2026-10-20`, the key is `2026-10`; avoid device timezone conversion and UTC upload timestamps. Reject malformed or missing lesson dates rather than guessing.

Evaluate the grant against each **lesson attachment relationship**, not just a reusable asset ID. The same PDF linked to two lessons must not expose the second lesson through authorization for the first. Preserve historical class boundaries through the durable grant audience, without requiring a current class membership or relying on the existing single-class fallback to bypass month checks.

Adding a recording, PDF or other supported attachment later requires no subscription edit: the attachment inherits its parent lesson's month. If an administrator corrects a lesson date across a month boundary, show the resulting access change before committing and audit it; do not silently rewrite payment records or add an upload-month override. Keep the lesson/session identity stable.

The check must cover lists, calendar/timetable media indicators, metadata, reader opening, PDF delivery, recording tickets, MP4 range requests and other private media entrypoints. Hiding a button is insufficient. Recheck current rights when serving media; an old link or ticket cannot restore a revoked grant.

The app can control its own media delivery. Previously downloaded files and externally shared copies cannot be revoked. Any externally hosted recording retains that host's sharing limitations; do not promise that an Academy month check makes a public external URL private.

## 6. Existing code integration

Paths below are relative to the repository root. They identify implementation work, not changes made during this planning stage.

| Area | Existing integration points | Planned change |
| --- | --- | --- |
| Program tabs | `programs/index.html`, `js/m4l-program-admin.js`, `js/m4l-program-management.js` | Add the scoped Participants subtab and lazy register module. Integrate selection, workspace, account and unsaved-change guards. |
| Register UI | Proposed `js/m4l-program-monthly-subscriptions.js` and matching CSS | Month picker, scoped student rows, explicit edited delta, validation, conflict/retry and draft state. |
| Mutation authority | `backend/src/academy/d1/management-store.js`, `workspace-access.js`, `change-scopes.js` | New scoped dataset/action guards; Core transaction, audit, receipt and revisions. Avoid default setup publication for operational payments. |
| Monthly service | Proposed `backend/src/academy/d1/program-monthly-subscriptions.js` and API routing | Bounded register read, reviewed batch grant/revoke and own-month summary. Never trust client-supplied authority or Program identity. |
| Lesson audience/access | `backend/src/academy/d1/lesson-media.js`, `lesson-media-sessions.js` | Shared monthly policy check after resolving trusted parent session/date; cover feed, metadata, reading and attachment delivery. |
| Recording delivery | `backend/src/academy/d1/session-video.js` | Preserve fresh session checks on tickets/streams; derive retention from trusted scoped policy. |
| Learner context | `backend/src/academy/d1/repository.js`, `workspace-access.js` and existing Learn navigation/media clients | Allow retained-month discovery and media-only contexts independently of current Student roles, without broader rights. |
| Permission cache/proof | `backend/src/academy/d1/permission-state.js`, `backend/src/academy/separation/proof.js` | Extend the explicit state schema/allowlist and current authority signature or entitlement revision. Verify both full and fast actor proofs. |
| Revisions | `backend/src/academy/separation/snapshot-revisions.js` and existing private snapshot/client cache invalidation | Account grant/revoke and Program policy changes invalidate affected private views. Stale UI caches cannot authorize delivery. |
| Split schema | `backend/src/academy/separation/ownership.js`, `columns.js`, `federation.js`, `empty-shapes.js`; additive migration directories | Core ownership, bounded projections and supported schema compatibility. Cover split and monolithic fixtures. |

`management-store.js` defaults `acceptDefinitions` to true and enumerates datasets allowed for scoped Program Admin writes. Add this feature deliberately to those guards and route operational grant writes with definition acceptance disabled. Do not accidentally publish a timetable, take an all-account snapshot or weaken authority checks to reuse the helper.

The permission cache currently allowlists known state fields; adding a property to one response alone will not preserve it. Update the cache format and proof/revision wiring together. Revocation must win over stale cached grants, old split proofs, already-open reader tabs and previously issued video tickets.

## 7. Recording retention dependency

Current native MP4 handling expires recordings **14 days after upload** in `session-video.js`. Repository release notes also record a 14-day R2 lifecycle on the Development `session-recordings/` prefix. Permanent month grants alone cannot preserve a recording whose bytes have been deleted.

The proposed Tafseer implementation therefore includes **retaining its paid-month recordings**, with no automatic 14-day expiry, while the lesson remains available. Use a separate private retained prefix and a server-controlled scoped policy. Keep the existing expiry for other Programs/Courses. Check actual lifecycle configuration only through a small authorized metadata check during implementation/release preparation.

- Resolve retention through the parent lesson/Program, never an uploader-controlled flag or path.
- New protected Tafseer recordings must be stored outside the expiring prefix and remain subject to the same authentication and range-request checks.
- Adjust backend expiry checks, tickets, any cleanup process and storage rules together. A separate prefix alone does not fix the application's 14-day gate.
- Before activation, review a bounded list of existing Tafseer recordings still needed. Future approved work can move/copy available objects and update references safely, retaining rollback information. Do not perform a global bucket migration.
- Already-deleted recordings cannot be recovered by changing a subscription; report missing files and arrange re-upload where needed. Links/PDFs need the same attachment access rule, but may have different storage handling.
- Retention increases storage use. Confirm this scoped policy before implementation of storage changes; do not silently disable retention across the bucket.

No recording has been copied, expiry changed or bucket queried as part of this plan.

## 8. Implementation sequence after planning approval

1. **Confirm identity and opening data.** Resolve the existing Tafseer Program's immutable activity key and historical class structure from trusted metadata. The display name is not a security identifier. Prepare the explicit historical paid-month register and confirm retained native-recording policy. No blanket conversion of all enrolled students to paid history.
2. **Add local schema and service.** Create additive Core/monolithic fixture migrations, disabled policy default, unique month grants/audiences and scoped atomic grant/revoke API. Add actor-bound retry receipts, audit events and concurrent revision guards. Allocate migration numbers against the then-current branch.
3. **Wire authority end to end.** Implement one consistent lesson-month predicate across all read/delivery paths, historical audiences, permission cache/proofs and revisions. Add media-only archive discovery. Verify negative access cases before enabling the register UI.
4. **Build the Admin register and Learn month navigation.** Use server capabilities, clear month/year, edited-delta saves, existing-account search, historical rows and guarded navigation. No automatic role changes or renewals.
5. **Implement scoped recording retention locally.** Test storage placement and expiry with synthetic objects. Prepare a concrete, bounded migration/retention review for existing files; preserve other media policies.
6. **Run local acceptance checks.** Use disposable synthetic accounts and split/monolithic fixtures. Review desktop and mobile layouts and permission failures. No live user-data exports or broad hosted scans.
7. **Prepare an explicitly authorized release separately.** Review the schema/API/coordinator/website compatibility order, opening grants and recording migration. New schema starts disabled; turn on enforcement only after all readers understand it and the opening register/storage are ready. Enabling with empty grants would lock students out and requires a deliberate check.

Migration and deployment are not authorized by this local-plan request. Do not bump release markers, push the feature branch, publish content or apply SQL during planning.

Rollback must preserve grants and media. Once enforcement is enabled, never roll back to a reader that ignores monthly protection or toggle it off merely to make an error disappear. Hide/freeze register writes or return a clear unavailable response while retaining authorization; use a compatible reader build. Reverting one bad administrative grant uses the audited correction workflow.

## 9. Acceptance checks for implementation

| Scenario | Required result |
| --- | --- |
| October paid; October lesson recording first added in November | Access granted without another subscription edit. |
| November paid only; same October lesson | List/metadata and direct recording/PDF access denied. |
| October paid; no November renewal | October remains available in later months; November stays locked. |
| Late payment; disjoint paid months | Correct historical month unlocks immediately; gaps stay locked. |
| Current Student role removed or class changed | Previously covered paid-month media remains discoverable; no extra live/assessment/staff rights. |
| Another class or Program; shared asset attached twice | Grant covers only its recorded Program/audience and authorized parent attachment. |
| Explicit revocation with open reader/cache/old ticket | Every subsequent protected request denies the revoked month; no stale grant restores it. |
| Disabled account, revoked session, unpublished/withdrawn lesson | Denied despite the month grant. |
| Global or Tafseer Program Admin; Teacher; other Program Admin; reader preview | Only genuine appropriately scoped Admin-workspace actors can edit; private notes stay private. |
| Filtered/paginated table save; month switch; failed save | Only explicit edits change; hidden rows and other months are untouched; drafts are guarded/preserved. |
| Concurrent edits; retry after lost acknowledgement; batch failure | Conflict retains draft; one operation commits once; failed batch makes no partial grants. |
| Invalid scope/month/class; manipulated upload date | Server rejects or resolves trusted values; no scope escalation or month substitution. |
| December/January and leap-year dates; different device timezone | Year and month follow the trusted lesson date consistently. |
| Lesson date correction crossing months | Access impact is reviewed/audited; payment history remains unchanged. |
| Recording older than 14 days | Retained Tafseer object plays with current rights; default expiry elsewhere is unchanged. |
| Missing/deleted recording | Honest unavailable message; no false claim that a grant restores bytes. |
| Policy disabled elsewhere; enabled but unavailable grant storage | Other Programs keep existing behaviour; protected Tafseer fails closed. |
| Phone and desktop, keyboard and enlarged text | Usable labelled register and Learn month navigation without page overflow. |

Extend the relevant existing tests: `backend/tests/academy-lesson-media.test.mjs`, `academy-lesson-media-cache.test.mjs`, `academy-session-video.test.mjs`, `academy-session-video-split.test.mjs`, `academy-split-workflows.test.mjs`, `academy-split-runtime.test.mjs`, `academy-split-preparation.test.mjs`, `academy-split-materialize.test.mjs`, `academy-split-engine.test.mjs`, `academy-d1-program-workspace.test.mjs`, `program-lesson-media-ui.test.mjs` and `academy-workspace-client.test.mjs`. Add focused monthly-register service/UI tests and synthetic fixtures for the new behaviour; avoid tests that merely repeat implementation structure.

## 10. Planning completion and references

This planning stage changes only this document and the branch's task-scope instructions. Check document references and whitespace locally. Application tests are not needed for documentation-only changes and cannot establish that an unimplemented feature works.

Before implementation, resolve three concrete prerequisites: the real Tafseer Program key/cohorts, the reviewed historical student/month register, and approval of the scoped recording-retention change. These do not prevent reviewing the design now.

Relevant platform references checked during planning:

- [Cloudflare D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/): ordered batched prepared statements support transactional rollback; combine mutation and current-authority guards in the same transaction.
- [Cloudflare R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/): prefix-based expiry can physically delete objects; an entitlement is not a substitute for retaining the stored recording.

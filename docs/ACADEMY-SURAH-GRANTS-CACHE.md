# Additional Surah grants and source caching — V107.116

Paid months remain the normal Tafseer website access rule. An actual Global Admin or Tafseer Program Admin can open **Participants → Additional Surah access** for a student, select individual Surahs and use **Save additional access**. The same editor is available beside each student in Monthly subscriptions. A checkbox is only a local draft until Save. Close/discard never writes. Existing paid access is labelled separately; extra access can also be granted to a paid student and will remain if their paid month later changes. Removing an extra grant does not remove paid access.

A grant covers that Surah's published website and website-owned attachments. It does not grant a recording subscription, a Student/Teacher role, another Surah or editing authority. Native Lesson media references inside a website retain their own publication, paid-month, class and playback/download rules. Public Foundations remains public. Inactive accounts/Programs/Surahs, withdrawn or unpublished websites and revoked sessions remain blocked.

## Authority and concurrency

Core's new `program_surah_grants` stores one row per Program/student/Surah; revocation retains an inactive audited row. The management endpoints are `surah-grants` and `surah-grants-save` under the existing Program monthly-subscriptions service. Targets must belong to that Program's participant, membership, subscription or existing-grant history. Selection is bounded to 200 Surahs. Reasons are optional and limited to 500 characters.

Save reuses the existing current-session, actual scoped authority, Program, policy revision, Core version, transaction, audit and exact-operation receipt guards. Per-row grant revisions reject stale selections. The transaction rechecks the active target and newly granted Surahs. An uncertain response keeps the exact request/retry identifier; an account/Program switch clears the editor and ignores delayed responses. No real grants, paid months, completion dates, monthly policy activation, publication or student data changes form part of the release.

The private permission snapshot now includes indexed active Surah rights. Its format and flag namespace prevent older snapshots being reused. Account-specific revision triggers invalidate the affected owner immediately on grant/revoke; other owners keep their snapshots. Every request still checks the current account/session/credential state and current relevant authority revision. Split fence/epoch triggers and the coordinator's optional proof tuple prevent an earlier verified proof surviving a grant change. The new coordinator also accepts the prior API proof shape during staged rollout. Missing enabled authority storage fails closed.

Former participants with a retained grant can use the existing read-only reader context without acquiring enrollment or recording rights. Final website/file guards still apply on every request; the published content cache contains no authority decision.

## Source caches included in this release

Published calendar/holiday facts, including successful empty results, and Course/Surah website documents/attachment lists use the bounded published-facts cache. Keys include deployment namespace and the relevant accepted component or live availability revision. Publication and immediate suppression/withdrawal/deactivation invalidate the affected source. Admin drafts remain fresh. Errors are not cached. No final personalized response, credential, session, private Journal entry or permission decision enters the shared source cache.

Synthetic local D1 checks measured warm source reads of 10 rather than 562 calendar rows, 3 rather than 38 Course document rows, 3 rather than 75 Surah document rows, and 2 rather than 4 attachment-list rows. Cold fills cost additional revision checks. These figures concern the isolated source queries, not whole-request/live totals or a daily allowance forecast. Caches are bounded and may be cold after an isolate restart.

## Release and verification

Preserve V107.115. Apply only the additive `academy-core/0008_program_surah_grants.sql` to existing Development Core; Admin needs no migration. Deploy the compatible private coordinator, then the API with `ACADEMY_SURAH_GRANTS=1`, then the matching website. The unsplit fixture/source migration is `academy/0043_program_surah_grants.sql`. No new binding, public endpoint or bucket is required.

Use local synthetic fixtures for rights, revocation, retry/conflict, split proofs and cache isolation; the native Workers runtime exercises actual D1/R2/private Durable Object RPC. Desktop/mobile Chrome checks cover manual Save/reopen/revoke, the Participants shortcut and account cleanup. Evidence is in the project `outputs/academy-surah-grants-107116` directory. Keep live verification small: targeted schema metadata and unauthenticated version/assets only. Do not log into the live app or scan student/permission tables.

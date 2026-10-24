# Distinct Admin readers — V107.38

V107.38 promotes the reviewed V107.37 navigation and banners to Development with the authorised Core/Admin database cutover. The personal/Admin access distinction and current layouts are unchanged.

V107.37 supersedes the earlier Home navigation decision. Global and scoped Admin accounts have Personal Learn, Personal Teach and Admin choices on Home; personal choices carry explicit PERSONAL labels. Both personal choices remain available even when there are no personal assignments, without adding inherited permissions. Inside Admin, ADMIN-LEARN and ADMIN-TEACH retain their separate routes and labels. Admin context banners show only the first workspace label/description row; all second-row navigation links are removed. Use the existing Home action to return to personal choices, retaining draft guards.

V107.37 verification: all 23 affected permission, workspace, page-action, site and account checks pass. Thirty isolated browser cases pass at desktop, 390px and 320px widths across Global Admin, scoped Admin, dual-role Admin, Teacher, Student and unassigned accounts. Checks cover personal entries with and without genuine assignments, all three Admin banner modes, connected PDF readers, Home returns, unchanged ordinary roles, forged Admin-address denial and retained draft guards. Website and Worker builds pass; no database migration or data correction is required.

V107.36 applies the user’s Global Admin-only navigation clarification: hide ordinary Learn and Teach switches outside the Admin workspace, including connected readers. Global Admin enters through Admin, where ADMIN-LEARN and ADMIN-TEACH remain visible and explicitly labelled. Existing Personal Learn/Teach exit links retain their personal request contexts and access checks. Program Admin, Teacher and Student switches keep their current behaviour.

V107.36 verification: the old Home navigation reproduces the plain Learn switch for Global Admin. After the change, 14 desktop/phone browser cases pass across Global Admin (including a real personal Teacher assignment), Program Admin, dual-role Program Admin, Teacher and Student accounts. Connected readers, explicit personal exits and labelled Admin readers pass. All 23 affected permission, workspace, page-action, site and account checks pass; Worker and website builds pass. No database migration or data changes are required.

V107.35 corrects the signed-out/student banner issue: an Admin address requests a workspace but does not establish authority. A fresh account-session check using the personal request context must confirm Global or scoped Admin before Admin data requests and active Admin labels. Signed-out entry has no active banner; students, ordinary Teachers and unassigned accounts return to personal Academy home. Account changes immediately clear verification, class context and delayed replies. Home explicitly exits to normal Academy home; the Admin workspace link returns to management.

V107.35 verification: all 98 regression test files passed. Twenty-eight isolated desktop/phone cases passed, including real Student sign-in from Admin sign-in, unassigned/Teacher redirects, Admin-to-Student sign-out/sign-in, ordinary Home navigation and preserved Global/scoped Admin readers. Native client checks also reject a delayed verification from the previous account. No database migration or data reset is required.

The 23 October clarification supersedes the V107.32/33 routing: Admin-Learn and Admin-Teach must be distinct from personal Learn and Teach. The implementation below corrects the shared reader contexts described in the historical release record.

| Workspace | Address | Request context | Access |
| --- | --- | --- | --- |
| Personal Learn | `/academy/#timetable/learn` | `LEARN` | Own enrolments/subscriptions and ordinary public Course access; no inherited Admin preview |
| Personal Teach | `/academy/#timetable/teach` | `TEACH` | Own genuine Teacher/session/class assignments and dated substitute grants |
| Admin-Learn | `/academy/admin/#timetable/learn` | `ADMIN_LEARN` | Read-only Student class audience within current Admin scope; no learner identity, membership, attempt, personal result or submission |
| Admin-Teach | `/academy/admin/#timetable/teach` | `ADMIN_TEACH` | Actual Teacher actions in every session within current Admin scope, recorded under the real actor |
| Admin management | `/academy/admin/#administration` | `ADMIN` | Existing current scoped management and explicit publication/release controls |

Global Admin has Academy-wide Admin reader scope. Program/Course Admin has its assigned areas. A personal assignment outside an Admin’s managed areas stays in the personal workspace; it does not extend that account’s Admin readers. Role revocation takes effect on subsequent requests. Ordinary non-admin accounts cannot select either Admin reader context. Named-examiner, owner, moderation, publication, hidden media and release restrictions remain.

The Admin shell displays ADMIN-LEARN / ADMIN-TEACH tabs and a persistent current-workspace label/description banner. The banner contains no navigation links. Home explicitly opens normal Academy home, where Personal Learn/Teach and Admin are available, with existing unsaved-work guards; Close retains the invoking reader realm. Calendar, Library/media and PDF tabs carry the exact context and selected class; the PDF reader also labels its own header. Switching contexts invalidates pending responses. New cache identities discard the earlier combined reader snapshots and keep pending attendance drafts separate. Existing unsaved-work guards apply before exits.

No persisted assignment expansion or learner enrolment is introduced. Actual authority proof remains based on the real account/roles. Existing Core/Admin split ownership and manual edge-case handling remain unchanged. V107.38 promotes this reviewed UI to Development on the new stores; the feature preview retains its own shared-service holds and now shares Development data. See the Phase 5 cutover record for reconciliation and recovery.

Regression coverage includes direct HTTP denial of inherited access from personal contexts, forged Admin contexts, cross-class protected media, own Teacher actions in Admin-Teach, current revocation, mixed personal/Admin scopes, examiner/release boundaries and client delayed-response isolation. Desktop/phone verification covers explicit Admin routing, class switching, attendance, personal exits and reader context preservation.

Final V107.34 validation: all 98 regression test files passed. The 42 focused reader checks passed, including an Admin who also owns a learner card, without selecting a class. Isolated desktop/phone checks passed 16 Global/scoped Admin cases covering labels, class switching, attendance, explicit personal exits, browser Back and PDF context preservation; ordinary students receive no Admin selector/banner. Fresh read-only Core/Admin recovery exports passed integrity and foreign-key verification (1,970 and 528 rows respectively). No migration or reimport is part of this release.

## Historical V107.33 record (shared routing superseded)

# Admin teaching inheritance and student class views — V107.33

The user clarified on 23 October 2026 that Global Admin is an actual Teacher in every session globally, and Program/Course Admin is an actual Teacher in every session of their assigned area. Learn provides the Student view for each selected class. It does not automatically enrol Admin in every class or create learner work.

## Access

Teacher eligibility is derived from current Admin authority on every request. Existing named teachers and examiner assignments remain intact; no per-session Teacher rows or Student memberships are inserted. The real account/session remains authoritative. Scoped Admin loses inherited teaching immediately when the area grant is revoked. Global Admin also inherits new active areas without a stored role copy.

Teach permits joining, attendance, own planning, class progress confirmation, own PDF notes and ordinary assessment work throughout the administered scope. Named examiner and no-self-moderation rules remain. General media curation, setup publication, role management and explicit release remain in Admin. Own-note authorship and own-plan boundaries still apply.

## Learn class audience

The existing Program activity header gains a Class selector visible only to Admin in Learn. It defaults to the first available class and supports switching classes without adding learner membership. Courses retain their existing student delivery view. Timetable, assessment lists/detail, media lists/calendar/timetable attachments and protected PDFs follow the selected class. Draft and hidden content remains subject to the ordinary Student publication/current visibility rules.

The selected context contains only an activity and class ID. The server checks the current Admin scope, and reader filters use accepted class/session metadata. There is no selected learner identity. Generic assessment previews contain no learner records/history and start no attempt timer or first-access event. Progress in a class preview is read only. Existing private learner results remain in their ordinary learner/Admin paths.

The browser carries class context with reader requests and PDF tabs. Its workspace generation and snapshot/cache keys change when the class changes, so a delayed response from the previous class cannot populate the new class. Existing unsaved-work guards remain before switching. Session changes clear the class context.

## Verification and release

Synthetic split-database HTTP checks exercise Global/scoped inheritance, own attendance and notes, own plan saves, scope revocation, unrelated-area denial, class switching and protected-note denial across classes without new memberships. Regression checks retain ordinary examiner, publishing and owner restrictions. Desktop and phone browser checks cover Global and scoped Admin Learn selection and Teach attendance, plus ordinary learner selector absence.

The release is limited to feature-admin and feature_worker using the existing READY Core/Admin stores. No migration, reimport, backfill or physical assignment expansion is required. Development stays at Phase 4 V107.28. Existing preview holds on Hifz and shared Library/My links writes remain.

Final validation: all 98 regression test files passed. The final reader-specific checks also passed after limiting the class-preview memorisation catalogue. Isolated desktop and phone browsers passed eight Global/scoped Admin Learn/Teach cases, including switching to a different class and back, no learner Join action, working attendance controls, no page errors and no horizontal overflow. Ordinary learners do not receive the Admin class selector. The verified live release is attested by `academy-admin-inheritance-v107.33`.

V107.33 completes delivery by refreshing the Users screen’s previously retained script query version. The permission implementation and 98-file behavioral regression remain those verified for V107.32; release integrity and Users UI checks are repeated for the cache update.

# Admin teaching inheritance and student class views — V107.32

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

Final validation: all 98 regression test files passed. The final reader-specific checks also passed after limiting the class-preview memorisation catalogue. Isolated desktop and phone browsers passed eight Global/scoped Admin Learn/Teach cases, including switching to a different class and back, no learner Join action, working attendance controls, no page errors and no horizontal overflow. Ordinary learners do not receive the Admin class selector. The verified live release is attested by `academy-admin-inheritance-v107.32`.

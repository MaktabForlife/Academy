# Class Notes — V107.56

Class Notes extends the existing Program/Course timetable. Its seven swipeable days, lesson-card grouping, date controls, joining and media controls remain in place. Select **Class Notes** beside Timetable to reveal **+ Note** and saved-note links. Lesson details also offer the Class Notes section.

Each lesson/class can hold multiple independent long-text notes. The form shows the source lesson, class and Teachers, and defaults to the next accepted session with the same class/delivery, module (otherwise subject) and Teacher identities. An explicit date can be saved without a matching lesson. Reminders on matching due lessons open the canonical source note. Reading does not complete a task or remove its reminder.

Students need current genuine class membership, or a valid Course delivery interval plus learning access. They may correct their own active notes. Responsible Teachers and scoped Admin may correct, withdraw or explicitly relink within the same class, with a reason. Admin-Learn is read-only. Substitute-only, public and unrelated access does not grant note permissions.

Corrections append immutable versions; author identity is retained. Withdrawal leaves a tombstone for students and retained history for authorised staff. Note/version/audit/retry evidence commits together under current account/session, accepted-head and revision guards. An uncertain retry reuses the exact original operation. Concurrent edits keep draft text and require review before another save. Lists and history use bounded pages. Timetable reads batch accepted facts across learning areas and do not fetch full note bodies.

Program recurring occurrences remain date-specific. Course source/target rescheduling follows the accepted stable SourceSessionID within the same delivery. Changed or cancelled target teaching details require review. Fixed dates remain fixed. Saved setup-head provenance and immutable due references retain the prior association.

## Additive Development database upgrade

Apply `backend/migrations/academy-core/0001_class_notes.sql` once to the existing SPLIT_V1 **Development Core** before deploying the matching Worker and website. It creates only `class_note_contexts`, `class_notes` and `class_note_versions`, their indexes/constraints, and the required split fence/epoch triggers. Account actor references use the existing `actor_refs` table. Admin has no editable copy.

Do not replay the legacy migration history or reconstruct either live database. `backend/migrations/academy/0036_class_notes.sql` supplies the equivalent source schema for disposable compatibility fixtures and future clean schema preparation; it is not the live split-store upgrade.

## Verification

- Program and Course membership/authority boundaries, shared lessons, immutable corrections, withdrawal, relinking and due-only changes.
- Exact retry receipts, transaction rollback, stale revisions, current access revocation and changed accepted heads.
- Next matching subject/module and Teacher, fixed dates without sessions, rescheduled Course occurrences, cancelled targets and canonical reminders.
- Physical split-store HTTP path and additive migration, including Core-only ownership and fence/epoch triggers.
- Bounded note/history pages preserve access to earlier records.
- Real Academy browser at desktop, 390px and 320px: unchanged day rail/scroll position, Arabic/English paragraphs, save-response loss, edit history, conflicting edits, date selection, cancellation and sign-out isolation.

FMA, messaging, dashboard changes, personal completion, conversations, attachments, push/PWA and email remain later work. No notification or recipient tables, fan-out or provider bindings are introduced.

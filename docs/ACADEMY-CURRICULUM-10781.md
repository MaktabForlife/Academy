# V107.81 — Curriculum management, workspace corrections and Library lesson PDFs

This release incorporates the directly authorised NAV-01 correction and subsequent instructions in optimisation. It follows deployed V107.80 and preserves its session resources, plan requirements, simplified Save/Publish completion, Quick tools and automatic public snapshot refresh.

## User-visible changes

- For Global Admin, Curriculum opens `/academy/subjects/` directly. That existing screen is now titled **Curriculum management**. The old `#administration/curriculum` chooser is removed and its URL redirects to the correct destination.
- Secondary Curriculum tabs connect **Subjects & Modules**, **Programs** and **Courses**, with the current section marked. Tabs use existing management pages rather than duplicate editors.
- A scoped Admin enters their permitted Program or Course management directly. Only authorised category tabs are shown; shared Subject/Module editing remains Global Admin-only. No new roles or catalogue rights are granted.
- Subject editing includes **Active / Archived**. Archived subjects can be edited/restored. Existing identities, Program subject links, Module references and published timetable records remain intact. An older client that omits status preserves the current value; creating a same-name archived subject does not silently restore it.
- The Global Admin dashboard workspace list contains only **Users; Announcements; Attendance; Curriculum; Library; Lesson plans; Assessments; App settings; Update timetable**. Its sidebar markup, styles, typography and responsive menu formatting are retained. Scoped Admin, Teach/Learn navigation and the separate Quick tools keep their existing behaviour.
- Lesson PDF forms offer Upload a PDF or Public Library for Admin attachments and assigned Teacher notes, including recurring notes. The picker reuses the existing public catalogue cache, supports search and individual volumes, excludes non-PDF/unsafe sources and imports the selected PDF through the existing authorised upload. The current 16 MB and combined PDF-count limits remain. Public download requests carry no account credentials; oversized responses are cancelled, content is checked for a PDF signature, repeated in-flight selection is coalesced, and closing/resetting the lesson cancels the download. An imported recurring PDF is stored once and reused across matching occurrences.

## Safeguards and reads

Subject status participates in the existing content revision, idempotent receipt, audit and in-transaction Global Admin authority checks. Malformed status values and stale edits are rejected. The shared catalogue's logical GLOBAL scope is supplied to the exact-operation acceptance path for Subject and Module saves, so only the edited definitions complete and unrelated private catalogue entries stay private.

Navigation uses already verified shell data; no permissions or timetable lookup is added for the tabs or menu. Status changes use the existing save/reload flow. No database schema, private coordinator code or storage migration changes.

## Local verification

The Admin browser fixture clicks Curriculum from both the dashboard workspace and Admin pills, waits for the actual Curriculum management table, navigates the Program/Course tabs, follows the old chooser URL, archives/restores a subject through the real editor and checks the persisted result after reload. It checks the exact Global Admin workspace list, current phone/desktop layout, manual Update timetable fallback, scoped Program/Course access and the Global Admin catalogue restriction.

Backend fixtures cover linked subject identity/history, Active/Archived revisions, restoration, older clients, invalid values, stale edits, exact retries and denied scoped/Teacher/learner edits. Accepted and split-store fixtures confirm catalogue changes complete without exposing unrelated private definitions and retain the existing per-write database bound. The session browser fixture imports/publishes a public PDF from the actual dynamic Admin Program workspace, imports a recurring Teacher note, tests oversized and unsafe/non-PDF selections, verifies separate volume choices and protected learner downloads at phone widths. It also cancels/reopens the picker and uploads a local PDF through the unchanged file option without a Library download. All 126 backend test files pass. Early-morning assessment fixtures use explicitly open synthetic papers, while production 03:00 opening gates remain unchanged. Course note fixtures use the app date consistently across UTC midnight. The broader regression suite checks existing Academy behaviour.

Release evidence is saved under `outputs/academy-curriculum-10781*` in the local project. Keep live checks small: release metadata, one API readiness request and a few changed static-file hashes. No authenticated live acceptance, SQL, timetable publication or snapshot rebuild is needed.

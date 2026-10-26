# Assessment workflow — V107.74

The user authorised release after deployed V107.73. The implementation is based on Development commit 8437e8cb and preserves its header, dashboard and read optimisations. No database migration or new binding is required; states, receipts and reports use the existing assessment events, report evidence and file records.

## UI and workflow

- Three screens: Register, assessment table and Edit reports. Back/Close returns to Register. Editable register name, areas and class choice; confirmation for release, completion and cancellation.
- Assessment rows stage edits and approval/collection/readiness/moderation in one Save all operation. Other details use a popup. Examiner is selected from Program/Course teachers; uploader is separate.
- Validate schedule before release. Validate current paper PDF/details/approval before publication; publish eligible papers without waiting for the remainder. Shared paper classes must be ready together.
- Only the assigned examiner and authorised scoped Admins can open paper PDFs, attach papers before approval, view submissions, confirm exact-PDF receipt or enter marks. Only Admin workspace edits full details. Admin replacement of released/accessed papers requires a current impact confirmation and fresh approval/publication; old answers/files remain. Optional learner notices are drafts in Messaging, never sent automatically.
- Enter marks, moderate, validate marking, generate/review private reports, then release marks for the whole Imtihaan. Reports release with marks or afterwards. A changed mark invalidates moderation, validation proof and generated reports; published results stay visible until a subsequent release.
- Only Global Admin may explicitly override missing marks or unconfirmed receipts, with a required reason and current fingerprint. This does not override invalid marks or missing moderation. Missing marks remain Pending, including in reports.
- Learner caching, PDF.js with native printing, phone scanning help, answer preview/receipt and result privacy are retained. Zero marks display correctly. Assignment date-only deadlines are 13:00 in Academy timezone, preserving explicit existing timestamps until edited. PDF schedule share/download uses the actual Imtihaan schedule.

## Verification

Use disposable local fixtures. Tests cover batch atomicity and retries, current-file approval, timing, scope, examiner-only access, revocation, replacement, receipt override, mark correction/moderation, private report generation and explicit release. A real Workers runtime with both local D1 bindings and private coordinator verifies the new SQL and report release. Browser checks use the actual UI and PDF.js with synthetic accounts, including phone layouts and learner uploads. Release evidence is saved in the project outputs folder.

Hosted verification is limited to matching API/site versions, readiness and static artifacts. Do not run broad acceptance tests against live learners or send messages.

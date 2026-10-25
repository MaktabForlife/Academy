# V107.66 — Manual mark entry and grouped paper publication

Teachers and Admins have Enter marks in each assessment row. Its popup groups the authorised students under their classes and sorts names alphabetically within each class. Each input accepts zero through that class assessment’s total. Blank fields are unchanged; saved marks are not released automatically.

Manual results are immutable manual-mark assessment events. The existing recipient pointers identify the current and released result versions, and one result projection combines manual entries with existing PDF marking. This preserves historical corrections and existing results/report interfaces without inventing an answer submission or requiring a database migration. Core owns the result events, recipient pointers and release state in SPLIT_V1. No fake files, submissions or learner access records are created.

The mark list and batch save recheck teaching access and active class scope. A Teacher with only part of a shared assessment sees only their authorised classes. Student workspaces cannot read or save the roster. Assessment and recipient revisions guard edits; operation receipts provide exact retries. A failing batch rolls back every student. Corrected marks stay private until a later explicit release, while already released marks remain visible. Paper totals and replacements are fixed once marks have been entered.

Each Admin row has Review paper. Approval remains bound to the exact reviewed PDF, but no longer launches setup publication. Publish papers stays disabled until every remaining assessment in that Imtihaan is approved and scheduled. The action prepares the whole set, confirms one complete setup publication, then releases the papers together. Server validation rechecks complete selection, authority and revisions; a staged or cancelled setup publication cannot release the papers. Each step has its own exact retry receipt.

The existing PDF.js, learner answer popup, row results, Admin-Learn preview and V107.65 dashboard timetable links remain. No migrations or live assessment data corrections are required.

Validation: disposable native and split D1 fixtures cover class/name ordering, zero and decimal marks, no-submission entry, held and corrected results, reports, access boundaries, stale edits, rollback/retry, individual approvals, and one complete paper publication. Native/shared and legacy browser acceptance cover mobile/desktop marking, dirty-file guards, lost-response retries, learner privacy, PDF.js and reports.

Verified: 110 affected backend/release checks passed, plus the real Teacher split-store write/retry check. Native/shared and legacy/report browser acceptance passed, including mobile and desktop manual mark popups and one publication for two individually approved papers. Worker dry-run and Development website build passed.

# Save Course participants V106.65

The Participants table previously offered only a Save button in the rightmost column of each user row. Those buttons could be outside the visible part of the table, leaving no obvious way to save checked roles.

Add Save participants above and below the scrollable table. Both buttons show the same pending state, become available when a role changes and save all changed users, including users hidden by the current search or Assigned only filter. The Course heading shows unsaved participant changes immediately. The existing per-user Save buttons remain available.

Use the existing participant-save API sequentially, preserving current-session authority, Course scope, row revisions, audit records and actor-bound retry receipts. Only changed users are submitted; saving does not reload the participant directory. A failure stops the remaining saves, retains their drafts and reports how many saves were confirmed. Retrying reuses the failed operation identifier, including when the server committed a change but its acknowledgement was lost. This action does not save or publish schedule edits. Inherited Global Admin authority remains protected.

The release builds on V106.64 on `feature/academy-review-fixes-10660` and synchronises current version labels and changed asset cache URLs to V106.65. It uses the existing website and Development Worker setup. No new Worker, database, storage binding, migration or data correction is required.

Validation: all 41 focused Course, role, branch-switching, packaging-boundary and release checks pass locally, plus two additional preview/asset packaging test files. Real Chrome checks pass at widths 390, 768, 1440 and 2154: both buttons remain within the page width, filtered changes save and survive reload, and inherited admin access remains checked and disabled. Browser checks use a local synthetic database, with zero browser errors and no external requests. Both website packaging and the Development Worker dry-run build pass. Hosted verification uses health routes and static assets only; no hosted participant write or regression test is run.

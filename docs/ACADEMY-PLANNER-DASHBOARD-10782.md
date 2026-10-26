# V107.82 — Planner and Admin dashboard

The user authorised building and deploying the pending follow-ups after confirming V107.81. All work stays in this chat.

- PLAN-02: new Program plans contain one blank section. Subject/module choices use the accepted Program curriculum. Class choices use active assigned classes and current published teaching, with DEFAULT assignments first and names ordered consistently. The default remains changeable. Saved historical labels and local drafts are retained. Add subject appends a blank section with the same choosers.
- PLAN-03: rename Reload saved plan to Revert to saved plan, to the left of the Load a plan date selector on desktop and phone. Retain the explicit discard confirmation and recovery of the currently selected week, including Course entire-period recovery.
- DASH-01: attendance review includes submitted registers with ABSENT marks only. Cache counts rather than learner names or marks, with a new summary cache key. Corrected all-present registers leave the queue.
- DASH-02: plan review includes submitted records only; counts and empty states follow the filtered list. Teacher due reminders and the full Admin plans board remain available.
- DASH-03: remove the quoted Global Admin inherited-authority banner from the Admin dashboard. Authority is unchanged.
- DASH-04: use the explicit /teach/assessment/<registerId> route within Admin. Group by register and learning area so shared Imtehaan retain the right Program destination. Retain current/upcoming date selection and exclude completed/cancelled/released/archived records.
- DASH-06: restore Visit website after the nine Global Admin workspace links, keeping its explicit public-site exit route.
- DASH-05: rename the Admin dashboard assessment panel heading to Imtehaan.

No schema migration, live SQL, data correction or coordinator change is required. Local tests use disposable SQLite/R2 records; hosted verification uses release metadata and static file matches only. Release evidence is stored in outputs/academy-planner-dashboard-10782/ in the parent workspace.

Validation: all 126 backend test files pass, including the four local Workers runtime files rerun with loopback permission; the planning regression also covers accepted curriculum isolation. Planner browser checks cover 38 flows including mobile, recovery, exports and submission. Dashboard checks cover filtering, routing, shared Imtehaan and public website exit. The Pages build contains 756 files and the Development API dry run passes.

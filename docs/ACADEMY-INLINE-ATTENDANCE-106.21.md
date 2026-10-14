# V106.21 — Attendance inside the Academy Program page

The Program Teach → Attendance pill now opens the date controls, compact class registers and day summary inside the existing Academy Program page. The Academy header, subscribed Program pills, selected Program heading, Admin/Teach tools and timetable stay in place. The Program management Attendance tab opens the same embedded view. No duplicate Program selector or standalone management heading is inserted into this page.

The view has a shareable `#activity/PROGRAM/<id>/attendance` address. Program pills retain the Attendance view when switching to another teaching Program; Close returns to that Program’s page. Attendance loads only when opened and reuses the already verified Academy Program list. New reads and saves still enforce current D1 permissions. Student and unassigned accounts cannot open the register. Sign-out, account replacement and restored pages clear the editor; delayed responses cannot restore the previous account’s data.

Class columns are 240 pixels wide, with smaller headings, spacing and controls and short Submit/Save changes labels. Names wrap within the column. Mobile controls retain touch-sized heights and the class strip scrolls inside the page. The day summary is also compact.

Unsaved changes require confirmation before leaving or changing Program. Loading, saving and uncertain submissions block in-page navigation until finished or retried. Exact session-bound retry, revision checks, one/all lesson submissions and historical corrections reuse the existing editor and D1 service.

An existing “Combined earlier register” preserves a prior shared-lesson submission saved as one group. It is not an extra class or a new combined-submission option. Its column now explains why its saved learner list stays together for corrections. No saved register is deleted, split or rewritten by this layout change.

Program and Course navigation pills show one highest access label: Global Admin, Program Admin, Teacher or Student. No access means no pill, as clarified by the owner. Global Admin inheritance and all underlying permissions remain unchanged. Detailed account role information remains available elsewhere.

No schema migration or live data correction is required. The owner will verify real rosters; there is no real attendance history to verify.

All **139/139 local regression files**, the development Worker dry-run build, syntax, version consistency and diff checks pass. Synthetic Chrome checks at 1440, 390 and 320 pixels verify the actual Academy page with D1: lazy inline loading, compact columns, one/all lessons, separate shared registers, exact lost-acknowledgement retry after reload, conflicting edits, unsaved-change navigation cancellation, Program switching, corrections, highest-access pills and Teacher/Program Admin/Student scope. No browser script errors or external data requests occurred. These corrections continue the owner-authorised Attendance deployment.

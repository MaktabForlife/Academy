# Planning UI and PDF sharing — V107.76

The user explicitly authorised deploying the reviewed planning changes. Incorporates V107.75 (`6f735eea`), including its sign-in handover and reduced reads, before release to the existing Academy website and Development API. No database, binding, schema or private coordinator change is required.

## Changes

- Keep one action row at the top: Save draft, Submit, Reload saved plan and accessible PDF download/share icons. Remove duplicate bottom actions, the marked teacher preparation/status/deadline/submission information and overview input. Stored overview data remains intact and in existing exports.
- Load a plan selects the source week. Week starting in the header copies its content into an empty target week, preserving the source. Save or Submit creates the new plan. Existing saved or local target plans are protected. Dated lessons move by the same week offset. Entire-course planning remains available.
- Remove the submission timestamp from the PDF header; retain Draft and Admin feedback.
- Generate the PDF before presenting a fresh Share PDF confirmation. Pass only a PDF File, without a text/title-only payload. Use a download with clear attachment guidance when native file sharing is unavailable. Cancellation creates no unexpected download. Close prepared-share UI if the planner resets.

## Verification

Use disposable local data and synthetic users. Planning browser acceptance covers top actions, loading/reuse, original and target protection, stored legacy content, source-bound retries, PDF download, files-only sharing with a fresh user gesture, cancellation/fallback, course plans, Admin feedback/deadlines, private drafts and mobile widths 320/390/768/1440. Inspect A4 output visually, including mixed Arabic/English and pagination. Native recipient-app behavior still depends on the device; no messages are sent during verification.

Keep live verification limited to matching release versions, one readiness request and changed static files. Evidence is saved in the project outputs directory.

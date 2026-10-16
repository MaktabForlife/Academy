# V106.85 — Manual registration and enrolment requests

The public homepage banner links **Join the Academy** to `/academy/enrolment/`. Signed-in Learn shows **Open for Enrolment**, opening the same form with the learner's name, WhatsApp number and Unique ID prefilled. Visitors provide contact details and remain unlinked until admin chooses an existing user or manually registers one.

The catalogue contains a Program/Course, enrolment year, cost text, display order and visibility. Admin explicitly opens each entry. Visibility is independent of timetable publication; only the selected area's name, kind, year and cost appear publicly. Cost text and the Paid checkbox do not affect Free/Paid access, roles, class memberships or subscriptions.

The inbox lives at `/academy/enrolment/manage/`, with links in Users, Course management and Program management. It supports contact/selection edits, Paid filtering, manual user linking, manual registration and deletion. Register user copies the chosen name and WhatsApp number into one Academy account and links the request atomically. It grants no Student role or subscription. Enrolment links open existing management tools for manual changes. Program Student access and class membership remain separate existing steps.

Global Admin sees the full inbox. Scoped Program/Course Admins see only selections they administer. Scoped removal preserves another administrator's selections. Global Admin handles user linking/registration in the inbox and can change the destination WhatsApp number. The default is the Academy's existing public contact, +27 82 847 8639.

**Send POP via WhatsApp** opens an admin chat with learner details and selections. The learner attaches and sends payment advice there. Admin can open the applicant's WhatsApp chat from the inbox. No payment files, payment verification, application statuses or application archive are implemented. Deleting a request removes its selected items; accounts and enrolments are retained. Technical retry receipts contain administrative result identifiers, not copies of deleted request contact details.

Storage upgrade `0026_enrolment_requests.sql` adds three D1 tables. It does not modify accounts, credentials, publications or learning access. Public submission is bounded, rate limited under a separate key in the existing limiter, and protected against duplicate retries and stale catalogue choices. Existing-user ownership is taken from the authenticated session. Administrative writes use current session/authority guards and request revisions.

Only the existing `development` branch and Development site/API are used. No new Worker, database, bucket or branch is required.

## Verification and launch

All 70 backend test files passed. The final affected checks passed 27 tests, and packaged Chrome acceptance covered 17 visitor, learner and admin flows using synthetic data. Phone and desktop layouts were inspected. Lost acknowledgements, scoped visibility, manual account linking/registration, explicit enrolment, catalogue editing and request deletion were verified. No live test applications or WhatsApp messages were sent.

The launch catalogue is initialized from the existing visible active Programs and currently published active/upcoming Courses for 2026, with **Contact Admin** as the cost text. Admin can change the year, wording and visibility in the Catalogue tab. A protected export of the existing database was taken before applying the additive request-table upgrade.

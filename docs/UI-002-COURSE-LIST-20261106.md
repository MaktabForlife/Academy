# UI-002 — Course list

Unreleased frontend component. Groups use checked native display stage (Current/active, Draft, Completed, Cancelled, Archived) and saved Free/Paid classification; each course/run appears once. Within groups sort latest start date first, then name. Keep AVAILABLE default; Show all reveals retained archived/cancelled rows. Display start date only, retaining saved end dates. Scope compact desktop width to the list and allow the table to scroll on small screens.

Per-course Free/Paid controls stage explicit confirmation, using the existing native checked get and current account/selection/unsaved guards. Academy-owned draft changes reuse courses/save with unchanged details except accessModel, existing revision and idempotency operation. Non-draft legacy policy stays under existing lifecycle controls. Studio-managed policy opens the SAME owning policy editor/handler, requiring current WEBSITE/COMMITTED ownership; explicit save retains existing purchases and exact unknown-ack retry command. No new backend writer or storage. No writes on rendering, grouping, sorting or Show all.

Archive is an explicit confirmed existing courses/status action only after checked DRAFT/COMPLETE/CANCELLED eligibility. No restore toggle, record deletion, ID rewrite or participant/media removal. Current acquisition, source/ownership, lifecycle and authority checks remain server-owned.

Disposable GitHub tests exercise actual native draft/save/status/CAS/denial paths plus the existing owning-policy UI request/retry/conflict/account guards. Browser event/layout and actual Studio server policy integration remain gates until their evidence is linked in the component PR. This source is not a ready release or a completed full UI parity claim.

No hosted app/DB calls or live setting changes. No backend/schema/credential/JWT/hosting/release-version changes. Deployment owns release preparation and optimisation owns independent exact-head approval.

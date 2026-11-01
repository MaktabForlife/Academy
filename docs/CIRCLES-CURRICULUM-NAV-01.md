# NAV-01 Curriculum continuation — local correction

The completed V109.2 server issues `/academy/admin/#administration/curriculum` for the Global Admin Manage Curriculum action. The browser destination allowlist rejected that exact URL, so the authorised continuation stopped before opening Curriculum.

`academy/website-platform/connect/destinations.mjs` now accepts only that same-origin path, exact hash and empty query. The server's existing workspace/role checks, code exchange, account binding and arbitrary-URL rejection are unchanged. No server, schema or access change is included.

Local verification on1November2026 used paired disposable fixtures with the actual Circles button, real Source connector and native Curriculum UI. Global Admin signed in, selected Manage Curriculum, passed the checked connector, and reached `/academy/subjects/`:3Subjects and2Modules rendered. Home returned signed in to Circles Admin. No Curriculum record was edited.

Target `feature/circles-next-integration` contains two passing pure connector checks and one passing paired dashboard/access scenario. These cover the exact route, malformed/query/foreign-origin alternatives, ordinary learner denial, Admin using Learn/Teach denial, authorised Admin issuance and exchange, and role invalidation.

Evidence lives in parent `outputs/circles-curriculum-navigation-20261101/`. This fixes NAV-01 locally only. It is not deployed or production acceptance. PAGE-03 Curriculum layout/version polish, DATE-01 and NAV-02 remain separate pending work. Inherited native header wording in the screenshot is not a newly assigned release version.

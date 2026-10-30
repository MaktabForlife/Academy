# Circles dashboard bridge — local only

The owned feature branch adds the signed read-only dashboard projection and exact-context, fixed-destination native continuations for the Circles homepage. Implementation: backend/src/academy/d1/web-platform/dashboard.mjs, bridge.mjs and worker.js. Native connector validation: academy/website-platform/connect/destinations.mjs. The existing dashboard opens its inbox for the fixed circlesTool=messages continuation.

Academy remains the access authority. Both issuance and exchange validate current context; no role is inferred from a browser selector. Ordinary navigation retains twelve-hour verified proofs and sensitive Admin operations retain sixty-second checks. No schema, hosted write, recording mapping or new grant is included. Keep these changes local until a fresh coordinated release approval; reconcile the separate access-management work before deployment.

The paired target's docs/CIRCLES-DASHBOARD-AND-ACCOUNTS.md describes the display projection, cache and verification boundaries. Tests run through its disposable native Academy fixture rather than live account queries. Full hosted acceptance and the full native frontend still require the coordinated release. Existing Academy screens remain available.

## Global Admin workspace clarification — 30 October 2026

The owner requires Learn, Teach and Admin pills for every Global Admin. dashboardModes now includes the existing Teach workspace for Global Admin without requiring a separate Teacher context. Scoped programme/teaching continuations still check exact native contexts at issuance and exchange. The paired target dashboard integration verifies successful Global Admin Teach display and continued learner rejection of forged Teach/Admin requests. Local only; no deployment, membership or permission record was changed.

# Circles dashboard bridge — local only

The owned feature branch adds the signed read-only dashboard projection and exact-context, fixed-destination native continuations for the Circles homepage. Implementation: backend/src/academy/d1/web-platform/dashboard.mjs, bridge.mjs and worker.js. Native connector validation: academy/website-platform/connect/destinations.mjs. The existing dashboard opens its inbox for the fixed circlesTool=messages continuation.

Academy remains the access authority. Both issuance and exchange validate current context; no role is inferred from a browser selector. Ordinary navigation retains twelve-hour verified proofs and sensitive Admin operations retain sixty-second checks. No schema, hosted write, recording mapping or new grant is included. Keep these changes local until a fresh coordinated release approval; reconcile the separate access-management work before deployment.

The paired target's docs/CIRCLES-DASHBOARD-AND-ACCOUNTS.md describes the display projection, cache and verification boundaries. Tests run through its disposable native Academy fixture rather than live account queries. Full hosted acceptance and the full native frontend still require the coordinated release. Existing Academy screens remain available.

## Global Admin workspace clarification — 30 October 2026

The owner requires Learn, Teach and Admin pills for every Global Admin. dashboardModes now includes the existing Teach workspace for Global Admin without requiring a separate Teacher context. Scoped programme/teaching continuations still check exact native contexts at issuance and exchange. The paired target dashboard integration verifies successful Global Admin Teach display and continued learner rejection of forged Teach/Admin requests. Local only; no deployment, membership or permission record was changed.

## Connected Library and PDF returns — 30 October 2026

Library continuations retain the selected workspace through the exact allowlisted /academy/library/?workspace=LEARN|TEACH|ADMIN destination. Source validates native context at both issuance and exchange as before. The one-use exchange supplies the configured Circles root and selected workspace; the connector stores this expiring return context in this tab, tied to a SHA-256 hash of the existing native token. Arbitrary return query strings and mismatched/expired contexts are rejected. No additional raw credential is saved.

The shared page actions module installs the connected Home/brand return and icon styling only when that context matches the current native token. Native account changes restore the original navigation. PDF links open in the same Library tab so the account-bound return survives; Close PDF returns to the native Library. Existing lesson-specific Library return behavior and native draft guards remain. Library/Open Library display the existing Academy Gregorian/Hijri date helper.

The paired target's final affected suite passes25 checks, including exact-workspace issuance/exchange, denied forged modes, return URL validation and purchase-only course placement. Browser checks verify Learn Library → PDF.js → Close → Library → Circles and Teach Library → teaching dashboard. This is local only; no schema, hosted change, publication or new media. Keep the separate access-transfer implementation and its pending independent review outside this UI checkpoint.

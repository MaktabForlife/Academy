# Academy homepage and dashboard
The owner approved moving the homepage/dashboard to ummabbadacademy.app on 4 November 2026, then authorised tested releases needed until maktab4life.org can be transferred. Build and release remain GitHub-only with no Mac writes/deletions. No Hifz repository, hosting, session policy or journal change is included.

## Address configuration
config/hosting.json is Academy's reviewed address map. backend/src/academy/hosting.mjs validates exact HTTPS origins, builds the native browser configuration and supplies the server allowlist. Relative same-site paths remain relative. Never derive a trusted redirect, callback or backend from request Host/Origin/Forwarded headers. No wildcard origin trust is permitted. Studio has its own validated environment contract documented in its CONFIGURABLE-HOSTING.md; the paired release must align those values.

## Ownership and access
portal/ contains transferred public Circles homepage source, with upstream commit and file hashes recorded in portal/provenance.json. Future homepage changes belong in Academy. portal-adapter/ adapts the shared display client to the existing native Academy login and current session/epoch/role gates; it does not convert Academy or Hifz to cookies.
The Academy backend assembles its timetable, calendar, assessment, notes and Admin dashboard through existing native readers and their permission/publication-aware snapshots. One bounded signed Studio summary supplies native Studio Course/Surah rights and exact offering mappings; this never grants access. Failed components report unavailable rather than manufacture empty purchases or permissions.
Public schedule and catalogue snapshots still come from their existing published storage; no website body, private media or PDF is copied to this repo. The public Pages relay strips credentials and allows only fixed public paths/upstreams. It has no database binding.
Studio continues to own its recordings, rights and secure host-only cookie. Opening Studio uses a 60-second, one-use PKCE handover; no master token or verifier crosses in a URL. A non-authoritative Source reference hint can be reused only after the server checks the current native session/account/epoch. Ordinary returns do not manufacture a fresh identity/access outbox.

## Hifz compatibility
Hifz's existing sign-in expects Academy's existing Pages connector. The new portal invokes that exact configured legacy connector with a one-use current native handover, allowing Hifz to remain unchanged. The Source connector chooses between its explicit Studio and portal caller origins. The new portal and old native tools may use different origins during this staged rollout; that is configuration, not another application or authority system.

## Tests and rollout
Use hosting-step1.yml to transfer pinned public source, run synthetic tests and build the complete Academy package on GitHub. All permission/current-account/Join/media/return checks must pass with the matching Studio commit before activation. Only then associate the new domain, check its certificate, activate the tested matching pair and perform bounded metadata/static/unsigned-denial checks. Preserve V109.18 recovery source and both release manifests in GitHub. Account/DNS transfer is a separate later step; do not remove existing working connections before the new entry is verified.

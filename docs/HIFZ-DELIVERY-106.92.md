# V106.92 — Repair automatic Hifz profile delivery

An Academy profile save committed successfully but remained queued with `DELIVERY_UNAVAILABLE`. The previous acceptance checks invoked the sender from a development tool and did not verify outgoing requests from the deployed Academy Worker.

A Cloudflare-hosted preview reproduced the exact failure: the Workers runtime rejects `redirect: error` before making the request. The sender now uses supported `redirect: manual` and continues to acknowledge only HTTP 200. Redirects remain undelivered and are never followed, protecting the signed profile body from being forwarded to another destination.

A regression verifies that 302 responses retain the queued revision and produce `HTTP_302`. Cloudflare-hosted acceptance exercises the actual sender and an automatic Academy API save. Existing compatibility dates, bindings, secrets, origins and recovery schedule are preserved. No schema migration or credential change is required. Production Hifz remains unchanged.

## Verified in development — 17 October 2026

The Cloudflare-hosted probe reproduces the old unsupported redirect error and, with the fix, reaches Hifz and receives its expected authentication response. The local Workers runtime regression sends a signed synthetic profile and verifies acknowledgement.

Academy 106.92 is deployed. A real Academy API profile save automatically delivered a disposable learner's changed login ID through the deployed Worker. The previously pending real profile update was also delivered and acknowledged: Academy and Hifz both contain `hbnaidu`, and the old `F1CJW7` lookup returns 404. The pending queue is empty. No real PIN was changed.

The two temporary Academy accounts are disabled, their roles and sessions revoked, and their Hifz profiles removed. Academy's immutable audit history is retained. No schema migration, secret rotation or Hifz deployment is required.

The full regression run also exposed a date-dependent Program-publication test at the Saturday/Sunday boundary. Its assertion now requests the publication's effective week explicitly; application scheduling behavior is unchanged.

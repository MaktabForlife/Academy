# V106.20 — Active D1 service version

The owner authorised Attendance deployment on 11 October 2026. The V106.19 website deployment succeeded, but the final live check identified an overlooked version label in the active D1 service: it still reported V106.18. V106.20 synchronises that health response with the website, package and legacy service labels. Attendance behaviour and its V106.19 asset versions are unchanged.

The existing activation regression now checks both health URLs in rehearsal and active D1 modes against the package version, so a future release with a stale service label fails locally. All **139/139 local regression files**, the development Worker dry-run build, version consistency and diff checks pass. No database migration or data correction is required. The owner confirmed there is no attendance history to verify and will check the roster after deployment. [Attendance integration details](ACADEMY-ATTENDANCE-INTEGRATION-106.19.md).

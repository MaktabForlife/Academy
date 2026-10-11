# V106.23 — Public Library sources

## Change

Essential Duas for Muslims (Grades 1–7) appeared in the public Library because its card was embedded in the page script. It was added before the Archive.org catalogue loaded and reinserted whenever that catalogue refreshed. The admin editor did not load that embedded record.

Remove the embedded card and the exact publisher URL exception in the PDF proxy. A saved Academy reader link to that external PDF now returns 403 before contacting the publisher. The synthetic browser-site fixture uses the same restriction.

Public Library media continues to use the Archive.org catalogue. Admin-added Other website links remain supported, editable and open in a new tab. Existing weekly browser caches hold Archive catalogue entries and saved metadata, so they remain usable without a cache reset or extra catalogue requests. An Archive.org failure cannot restore the removed card; saved results or available Other links remain visible.

The Library script URL advances to V106.23 so reloading the page loads the corrected script. No database migration, reseed or live data correction is required. V106.22 memorisation changes remain intact.

## Validation and release

- All 140 backend regression test files pass.
- Public Library tests cover initial loading, Archive media, Other links, a warm weekly cache and Archive.org failures with and without saved results.
- PDF proxy tests reject the removed publisher URL without an upstream request and retain private Drive range responses and Archive validation.
- Pages Functions compilation and the development Worker dry-run build pass.
- Active version markers, JavaScript syntax and whitespace checks pass.
- Browser visual testing was not performed.

The owner authorised deploying this update when complete to the existing feature branch, which deploys the Academy development website and Worker. No database writes are part of this release.

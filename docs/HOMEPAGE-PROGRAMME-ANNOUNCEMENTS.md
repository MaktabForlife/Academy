# PDF-independent 2027 announcement panel

The owner instructed on5November2026: “delink the pdf from the enrollments panel and publish the new announcements”. Remove the PDF requirement and link while preserving the approved layout, exact checked published-record authority, empty/withdrawn behaviour and existing Bootcamp/public notices. No static fallback is introduced.

The component still requires public record927e3eed-43b9-4fa2-a993-d640f9c69a51. A PDF-free record activates the panel. The optional full-message dialog receives no PDF fields. Existing attachments are neither removed, read, replaced nor uploaded. No draft/private record or URL is displayed.

The owner explicitly authorises the separate manual Admin publication of the two reviewedLive notices, retaining Bootcamp and the existing attachment. Coordinate that small publication with the release and final visible-panel check. Code builds never publish content.

The six source-managed programme schedules/fees/Arabic labels remain unchanged public marketing, separate from native sessions/Join, Teachers and acquired rights. Native navigation, dashboard, login and other rails stay unchanged.

The same cached public collection is reused, with no new per-tab/card/API/database/permission reads. GitHub-only tests cover PDF-free published display, attached-but-unlinked PDF, empty/legacy/withdrawn authority, Bootcamp, six tabs/widths320–1920, keyboard control and collection reuse. No Mac writes/deletions.

Root owns independent review and pairedV109.22 release, preserving current Studiohosting/23bindings/workerassets and isolated JWTV110.

V109.23 delivery correction: the native publication emits content-addressed image/PDF paths under /api/academy/announcements/. The homepage explicitly validates that configured source prefix and maps accepted same-origin attachment URLs to /api/public/academy-announcements/ before display/cache. Already-mapped saved URLs are valid on reload. Unreviewed origins, paths and malformed asset hashes remain rejected. The public relay stays credential-free, and its JSON is not rewritten or fetched again. Native-attachment relay/DOM and real-browser fixtures cover both notices; no publication retry is part of this code correction.

The same release scopes a native hidden override to #academy-news and descendants. Legacy grid/flex rules must never display hidden old flyers or controls; a withdrawn/empty publication has no section layout box. Browser fixtures now use the actual academy-news-grid/reel-controls structure and assert both post-publication hiding and pre-activation legacy collage behaviour.

# V107.4 — Refresh newly added Archive resources

The live public catalogue contains Class Duas (`class-duas`) and Tasheelul Ahadith wal Akhlaaq (`hadith-grade-1-7`), with supported public PDFs. A fresh browser displays both. Existing browsers can retain a public catalogue snapshot for seven days.

The shared header hides each page’s duplicate Refresh button with CSS. Its dispatcher also required that hidden button itself to have visible geometry, so it skipped Library refresh and reloaded the document. Reloading reused the same valid weekly snapshot and did not fetch the new resources.

Use the refresh button’s visible parent to select the current page action. Keep explicit hidden controls, hidden ancestors, inactive workspaces, disabled controls and each page’s own draft guards intact. Library’s existing forced-refresh action fetches both the Archive catalogue and public metadata and replaces the browser snapshot. The seven-day reuse policy and source publication rules remain unchanged.

Validation reproduces a valid saved catalogue missing the two new resources, verifies that header Refresh performs fresh catalogue/metadata reads without document navigation, updates both cards and preserves them on revisit. Existing cache, public/private Library, page-action and shared-header checks cover the surrounding behaviour. No live records or files are changed.

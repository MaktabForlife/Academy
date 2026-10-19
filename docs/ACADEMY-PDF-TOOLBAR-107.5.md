# V107.5 — One desktop PDF toolbar and full screen

At desktop widths of 1280px and above, the reader displays the active PDF’s title, saved-book/page actions, volume selector, Library and Open file controls alongside the split/focus, bookmarks, full-screen and close controls. Split-mode PDF tabs share the same toolbar. Selecting another pane switches the toolbar to that PDF. Smaller screens keep the existing pane headers and responsive controls.

Full screen hides the two Academy banners while keeping the PDF controls and Exit full screen available. The same button or Escape restores the headers. This is a per-tab reading view and does not persist to other Academy screens. Open dialogs and drawers keep their existing Escape behaviour.

Only toolbar elements move. PDF frames remain mounted, preserving document, page, annotations and per-pane preferences. Existing unsaved-annotation checks still protect replacing a PDF and closing the reader.

Browser verification covers single-row controls at 1280/1440/1920px, full-screen entry/exit on desktop and phone, split-pane selection, volume switching, bookmarks, annotation preservation/download, device PDFs and header restoration. No database migration or live data change is required.

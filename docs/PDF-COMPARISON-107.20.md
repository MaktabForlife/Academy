# V107.20 — PDF tools comparison

Development page: `/academy/pdf-compare/`. The normal Library links still open the
existing reader. Its scripts, styling and PDF.js viewer files are unchanged. The
only existing reader HTML changes are release labels and shared-brand cache keys.

The comparison loads one sample worksheet or a user-selected PDF into both the
existing PDF.js viewer and a separate canvas rendered by the same bundled PDF.js.
Each view has independent marks. The Academy toolbar supplies labelled tools,
colour/width/size controls, English/Arabic multiline text, rectangle/ellipse/line/
arrow shapes, selection, text editing, moving/resizing, whole-object erasing and
50 steps of Undo/Redo. Shape fills are translucent. Scroll mode permits touch
scrolling; drawing tools capture a pointer only while drawing.

Page coordinates are independent of CSS zoom. An export uses the original PDF
and transparent annotation images mapped back through the PDF.js page transform,
including crop origins and rotations. Original page content remains vector text.
New Academy marks become permanent image overlays in the downloaded copy, and
are not separately editable after reopening. The UI states this limitation.
Native PDF.js keeps its own save behaviour. Downloading does not upload a file.

On phones the views switch with tabs, and a bottom tool picker plus Undo keeps
the page accessible without repeatedly scrolling through the full settings.
This self-contained experiment has its own Academy/current-reader return links,
without account shell scripts or account API reads. Other pages retain the shared
Academy header requirement.

Editable Academy marks are tab-local; there is no autosave or cross-device sync.
An unsaved-work guard covers either view before replacing a PDF or leaving. The
prototype accepts unlocked PDFs up to 30 MB. Signed documents should be kept as
originals: adding marks produces an altered copy, not a signature-preserving flow.
The comparison makes no account, permission, profile or database writes. It uses
existing bundled libraries; no external editor service or licence is introduced.

Validation includes geometry and wrapping tests, cropped-page export transforms
at 0/90/180/270 degrees, browser drawing/text/history/selection checks, visual
inspection of a downloaded two-page copy and desktop/phone layout checks. The
full regression run passed 78/79 files; the navigation coverage test was then
updated to explicitly recognise this account-free experiment and passed on recheck.
All 79 test files therefore pass across the run and the focused recheck. The new
geometry/wrapping tests and existing PDF, bookmark and release checks passed.

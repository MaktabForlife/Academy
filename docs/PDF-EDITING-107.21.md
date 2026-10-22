# V107.21 — In-place text, editable annotations and favourite colours

Development comparison only: `/academy/pdf-compare/`. The normal Library reader,
its JavaScript, its styles and the bundled PDF.js viewer are unchanged. Existing
HTML changes outside the comparison are release labels and shared-brand cache keys.
No database, profile, PIN, role, API route or dependency is changed.

Text is entered in a textarea anchored to the page, with Done/Cancel and direction
controls beside it. Click existing text in Text or Select mode to edit in place;
dragging text moves it. English, Arabic and mixed text keep their first-strong
writing direction. Colour/size changes update the draft. Empty text removes the
annotation; Undo restores it. Marks can be moved/resized; line/arrow endpoints
can be adjusted. Erasing deletes a mark rather than painting over PDF content.

Downloads use the pinned PDF.js annotation writer: added text becomes FreeText,
shapes/strokes become Ink, and imported text highlights remain Highlight records.
They are real PDF annotations, not a flattened image on the page. The original
PDF content is preserved. The saved bytes can be reopened using Reopen saved copy
or a device PDF. Supported unthreaded FreeText, Ink, Highlight, Square, Circle and
Line annotations are imported into the comparison editor. Unsupported/commented
annotations and locked annotations remain intact in the PDF and available in the
native viewer; they are not silently removed. Printed page text and prior flattened
copies cannot be recovered as editable annotation objects.

Per-annotation metadata preserves parametric shape and text-box settings. It is
bounded/validated and checked against the actual annotation contents, geometry,
styles and appearance reference. Native PDF.js changes invalidate stale metadata,
so subsequent opens import the edited PDF fields. Export reuses PDF.js's existing
FreeText/Ink saving support rather than modifying the shared viewer code.

Edit favourites opens four colour slots. Users can choose a colour or enter its
colour code, save, cancel or restore the defaults. Validated colours are stored
only in this browser, separately from the PDF and from Academy account data. If
browser storage is unavailable the interface reports that colours last for this
tab. Reloading restores saved colours. Choosing a favourite works for text,
strokes, shapes and highlights.

Validation:
- Full backend regression: 80/80 test files passed; focused geometry, Unicode,
  direction, metadata and preference checks passed after final refinements.
- Browser: add text, click to edit in place, modify Arabic/English text, save and
  reopen, then edit the reopened text; native PDF.js also opened its text editor.
- A filled box and arrow survived an editable save/reopen; native PDF.js recognised
  both as editable Ink annotations and opened its Ink editors.
- A changed favourite colour survived reload and was used for new text.
- Phone layout: on-page Arabic text editor and quick tools fit a 390px viewport.
- Development artifact build and release/version checks run before publication.

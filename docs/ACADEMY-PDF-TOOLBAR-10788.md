# V107.88 — PDF reader toolbar update

The user supplied an annotated screenshot and requested the PDF reader UI update. This branch incorporates deployed V107.87 and follows the user's existing instruction to deploy completed work to Development. It changes Academy's PDF.js toolbar integration and annotation UI; the rendering engine is unchanged.

## Changes

- Keep the shared brand/date and Home/Refresh/account actions in the top banner. Leave the account identity in the lower shared banner and put Split, Full screen and Close at its right. Anonymous readers also retain this lower row. Fullscreen moves the same controls to the reader's fallback bar, then returns them on exit. Frames, reading position and edits remain mounted. Other Academy page headers are unchanged.
- Keep native zoom values and behaviour, using AUTO and ACTUAL labels on a white field. PDF.js starts translation before its initialization promise resolves; observe only those two options to retain the requested labels if a pending translation rewrites them.
- Leave the existing four ink favourites in the Border dropdown and add a separate four-button Fill palette using the same saved favourites. Both include a custom colour picker and Edit favourites. Editing the saved palette updates both menus. Fill selection enables filling without changing border/ink colour. Saving and selecting annotations retain their existing undo/export behaviour.
- Keep menus inside each PDF pane at narrow widths. Preserve the V107.87 natural-height Library rows and scrolling.

## Verification

- Sixteen existing PDF comparison, editable annotation, favourite persistence, fill/border independence and guarded defaults checks pass.
- The synthetic browser workflow verifies lower-row placement; AUTO/ACTUAL selection and native zoom values; white zoom background; border/fill favourites and independent selections; editing saved favourites through Fill; editable text/shape download; scrolling after Edit is off; independent panes, bookmark/volume changes and unsaved replacement guards; fullscreen recovery; phone touch scrolling and Whiteboard retention.
- Colour-menu positioning and reader overflow are checked at 320, 768, 1024 and 1600 pixels. Source and release-asset checks use disposable local PDFs/accounts, without accessing live users.

No database or coordinator update is needed. Keep live checks limited to deployment metadata, targeted website/static checks and one API readiness request.

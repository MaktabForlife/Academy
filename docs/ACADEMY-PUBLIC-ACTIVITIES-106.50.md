# V106.50 — Public Academy activities

The user requested copying HifzHelper's Surahs in my Heart and Kaaba puzzle into the Academy website with Academy branding and visitor access from the main menu. The implementation builds on the latest V106.49 (`d5a7f383`) and retains its PDF reader and administrator tool defaults.

## Pages and menus

- `/activities/surahs-in-my-heart/`: standalone colouring activity.
- `/activities/kaaba-puzzle/`: standalone free-play puzzle.

Both pages appear in the Academy home menu and the shared menu on connected pages, for visitors and signed-in users. Each page has the Academy logo, shared banners, Home/Refresh controls and links to both activities. Neither activity requires an Academy or HifzHelper account. Signed-in users retain the shared Academy account navigation.

## Copied behaviour

Source: local HifzHelper checkout `e70d056`, build 4.2.15.25. The existing `sihScreen.js` region engine, original heart SVG, text-free boundary layer and 115-region JSON are copied. They preserve all 114 surahs, including the split Ash-Shu'ara region. Colour modes, wheel, lightness, swatches, eraser, undo, pan/zoom, temporary background image, reset confirmation and PNG export are retained. A public browser save key is independent of HifzHelper and Academy account progress. Saved colours remain only in this browser on this device; photos are not saved or uploaded. PNG exports include an Academy footer without covering the artwork.

The existing `kaabaTracker.js` SVG component is copied and opened in free-play mode: tiles toggle light/dark, each band and the door cycle blank/dark/gold. Start again confirms before resetting. State resets on reload. There are no learner progress reads/writes. The page uses the Academy's local Arabic font instead of requesting Google fonts.

## Layout and access

Phones use the original heart bottom-sheet controls with larger touch targets, wrapping toolbar buttons and Academy colours. Desktop keeps the expanded controls beside the artwork. Closed mobile sheets are removed from keyboard navigation; Escape closes an open sheet. A native colour control and surah selector provide alternatives to precise artwork taps. Kaaba tiles, bands and door support Enter/Space and announce their current states.

## Verification and release

**16 affected tests pass** across entrance, navigation, Library, shared page controls, routing/version and D1 activation. **18 local Chrome acceptance checks pass**, covering anonymous and signed-in visitors, direct artwork taps, saved colours after reload, gradients/eraser/undo, zoom/fit, local backgrounds, branded PNG download, Kaaba pointer/keyboard cycles and reset. Both layouts and public menus are checked at 320, 390, 768 and 1440 pixels. Visitor activities make no API requests; no HifzHelper service, Google font or other external request is used. Export and responsive screenshots are visually inspected. A delayed-artwork check confirms Save stays disabled until both the artwork and saved colours are restored.

There is no database migration or live data correction. Publish the matching version markers and changed shared-navigation cache keys to the existing Development release branch. The source HifzHelper application is not modified. Deployment is verified by build checks, live versions and exact hashes of the public pages/assets.

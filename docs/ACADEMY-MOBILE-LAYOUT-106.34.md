# V106.34 — Mobile-first Academy layout

Phones and tablets up to 900px use a compact Academy header with a Menu button. Expanding it reveals the existing navigation; choosing a page closes it and moves keyboard focus to the selected heading. Escape closes the menu and returns focus to its button. Desktop navigation remains visible.

The shared layout is loaded by Academy home and all 15 connected tool pages. It retains the plum and lavender branding, sign-in first on Home, existing subscribed Program/Course links and each workspace’s permissions.

- Stack Course details, assessment forms and Program setup fields on phones; use two columns where tablet space permits.
- Use 44px touch controls and 16px input text on mobile, with wrapping headings and actions, bounded dialogs and reduced-motion support.
- Keep wide registers, timetable boards and tab rows in their own scrolling regions. The profile sheet still freezes only User name; Login ID and WhatsApp remain horizontally editable.
- Retain the compact desktop profile sheet and leave the standalone recorder outside the Academy layout.

## Local verification

Browser acceptance uses the real frontend and Worker with synthetic D1/R2 fixtures. It checks public Home at 320, 390, 600, 768, 900, 901 and 1440px; menu open/close, Escape, selected-heading focus and breakpoint changes; real student sign-in; management screen widths; frozen-name scrolling; profile saves after reload; and selected Course field geometry. Screenshots and the acceptance report are in the task’s `artifacts/academy-mobile-first/` directory.

Run `npm run test:academy-mobile` from `backend/` with Playwright available (or set `ACADEMY_BROWSER_RUNTIME` to its installed package path). `ACADEMY_MOBILE_OUTPUT` selects the evidence directory. For a temporary synthetic local preview, run the same tool with `--serve`. No preview account is added to the application or live database.

All 61 mobile browser acceptance checks and all 142 backend regression test files pass. The full assessment browser workflow also passes, including editing earlier schedules and returning to the assigned phase. The development Worker dry-run build succeeds. Active release labels, frontend version files and both Worker health responses agree at 106.34. Asset URLs identify the new shared CSS and script. Moving between profile text fields no longer rebuilds the row on blur, preventing the next field edit from being lost; Login ID and WhatsApp are verified together through a confirmed save and reload.

## Release status

The owner authorised deployment on 12 October 2026 after confirming V106.33 was live. V106.34 includes that assessment-editing fix and adds the mobile layout. Deployment verification is recorded with the release evidence. No migration, data import or live database correction is required.

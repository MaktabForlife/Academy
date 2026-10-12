# V106.36 — Compact Academy and Learning menus

After sign-in, the Academy places the profile beside LEARN, TEACH and ADMIN tabs below the website header. Each account sees its authorised tabs and tools: Student access enables Learn, teaching authority enables Teach, and administration authority enables Admin. Global Admin sees all three, including inherited management access throughout the Academy. Scoped admins receive links for their own Programs and Courses; accounts without assigned access show None. Tabs support arrow keys, Home and End. Sign-out immediately clears their contents.

The website version appears beside the Academy brand in the top row. The former signed-in welcome card and duplicate activity grid are removed, and the public introduction is hidden after sign-in. The public sign-in form and session retry remain available when needed. Signed-in home leads directly to its navigation and timetable.

Phones and tablets use one compact **Learning menu** for subscribed Programs and Courses, including on Academy home. Its summary shows the current selection. Opening reveals a two-column list with existing role labels and a separate HifzHelper link. Selection closes the menu; Escape closes it and restores focus. The Learning and website menus close each other. Empty menus are hidden, and desktop retains visible Program navigation.

Mobile card sizing now applies to outer Program cards rather than nested shortcut links. This prevents HifzHelper from stretching the entire row. Program and Course headings size to their content instead of reserving 220px vertically; Home controls retain 44px touch targets.

The menu uses the existing authorised home snapshot and identity response. There are no additional account requests, permission changes, database migrations or live data corrections. V106.35's earlier-assessment date forms and asset versions are preserved. Current release markers and changed asset cache arguments advance to 106.36. The owner authorised this combined development deployment on 12 October 2026.

Validation evidence is retained locally under `artifacts/academy-10636/`. Browser checks use the real frontend and Worker with an isolated synthetic database and cover public/signed-in layouts, role combinations, scoped administration, keyboard interaction, sign-out, Program/Course switching and connected management tools at phone, tablet and desktop sizes. The assessment acceptance workflow exercises the earlier-date correction alongside editing, papers, submission, marking and reports.

Validation completed:

- All 96 mobile browser checks passed at widths from 320px to 1440px, including real Program/Course pages and connected tools.
- All 142 regression files passed; the release/router and entrance checks were rerun after the final version and test updates. None, teacher-only access and stale-response clearing are covered by entrance regression checks.
- The complete assessment browser workflow passed, including adding earlier dates at 320, 390 and 768px.
- Development Worker dry-run passed (1691.46 KiB / 341.87 KiB gzip). JavaScript syntax and whitespace checks passed.
- Academy menu, expanded Learning menu and Program phone previews were visually reviewed.

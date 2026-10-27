# Mobile-first Learn/Teach development

Status: V107.93 Development release, incorporating deployed V107.89 (`819ab547`). Branch: `feature/academy-mobile-first`. The user approved deployment after phone testing the V107.84-based preview through V107.92.

## Shared foundation

- Apply the reading layout only after a verified signed-in Learn/Teach context, including Admin-Learn/Admin-Teach. Public website and Admin management keep their existing layout.
- One reading column is the base. At 48rem supporting grids can use two columns; at 70rem the same Contents links become a sidebar. No separate mobile copy of the content or permission model.
- Reuse the existing dashboard navigation toggle as Contents. Program/Course pages use a native details/summary Contents menu, with ordinary links and aria-current for the selected section. Links remain in the normal keyboard order; arrow keys move focus, Enter selects, Escape closes. A section change collapses the phone menu and focuses the page heading. Existing draft guards remain responsible for navigation.
- Compact the existing identity/date/actions and workspace-switch rows. Retain Home, Refresh, Sign out, Hijri/Gregorian dates and Learn/Teach authority.
- Use 16px-equivalent base text and inputs, larger reading text, generous line height and 44px-or-larger controls. Text scales with the user's browser settings. Arabic-language markup uses a larger line height and size.
- Forms, attendance classes, lesson resources and media use a phone column. Reading paragraphs have a comfortable maximum width. Repeated planner Program/Course headings are suppressed within the already titled activity; exports and saved data are unchanged.
- The timetable remains a swipeable date rail. Wide assessment/register tables scroll inside their own panel. PDFs/media keep their existing viewer, protected bytes and fixed document format.

## Verification

Use `backend/tools/academy-learning-mobile-first-acceptance.mjs` against synthetic SQLite/R2 data only. It covers 320, 390, 768, 1024 and 1440 pixel viewports; dashboard and Program Contents, keyboard behaviour, selected-section focus, the day rail, assessments, Class Notes, media, Library, teacher drafts/save, attendance, 200% text sizing, Course layout and workspace isolation. External browser requests are blocked.

The existing entrance routing, sign-in, workspace client, Program workspace, planning and source-boundary checks provide targeted regression coverage. Build the isolated preview artifact to confirm the new assets are packaged. Deploy only its dedicated Worker and new synthetic D1/R2 resources.

## Local preview

Run the acceptance tool with `--serve` and `LEARNING_MOBILE_PORT=4186`. The `/__signin/studentA`, `/__signin/teacherA` and `/__signin/global` links create synthetic local sessions. They are not production accounts. The local preview and verification artifacts live under the parent workspace's `outputs/academy-mobile-first-local/`.

## Review before release

Review this first implementation on actual iPhone/Safari and Android hardware, especially keyboard opening, long lesson text and PDF interactions. Confirm the final spacing and menu labels with the user, before preparing a later live release. This development does not change backend services, schema, permissions, publication/release gates or current V107.84 optimisations.

## Hosted phone preview — V107.88

- URL: https://academy-mobile-first-preview.maktab4life.workers.dev/
- The landing page opens synthetic Learn or Teach accounts without a PIN. Sample changes are saved only in the dedicated preview database and bucket, both named `academy-mobile-first-preview`. No live Academy binding, coordinator or account is used.
- Public Library titles/PDFs use the existing read-only Archive.org routes. Preview public metadata is empty; private Library coordination is not enabled.
- Source entrypoint and offline builder are in `backend/tools/mobile-first-preview/`. The builder creates a fresh private artifact, random preview-only authentication secrets, a foreign-key ordered synthetic seed and bounded import batches. Secrets never enter the repository or static assets.
- Thirty local layout/workflow checks pass at 320–1440px. Hosted checks verify both sample sign-ins, the 390px layout, a persisted teaching draft, learner navigation, the public Library and a rendered two-page PDF. No real account was used for preview testing.
- The V107.87 Library row correction is also included. Development/live retain V107.87 and their existing headers; the mobile-first feature remains separate. The user's additional header-display concern awaits clarification.

## Phone planner correction — V107.89

- The native Load a plan and Week starting date fields have explicit shrinkable inline sizing and retain native date-picker semantics. The load row gives its remaining width to the date; the revert control remains immediately to its left as an accessible 44px icon.
- Save draft, Submit plan, Download A4 PDF and Share plan image share one compact row. Each has an icon, a short visible caption, its full accessible name and title, and a tap target at least 44px wide/high. Other planner views keep their existing full labels.
- Chrome and WebKit each pass the 30 shared fixture checks. Planner checks now measure individual date fields within their columns and assert a single action row, actual icon visibility, labels and touch targets at 320, 390, 768, 1024 and 1440 pixels and with 200% text.
- Eleven planning behaviour checks pass. Deploy the same preview URL with existing bindings and secrets; do not reset its synthetic database or drafts. Development/live remain V107.87.

## Compact headers, Admin badge and Close — V107.90

- Phone Learn/Teach headers now keep Home, Refresh and Sign out as accessible icons; dates share a row, secondary identity text and version labels yield space to content, and workspace tabs use short visible names with their full audience names available to assistive technology. Desktop header spacing is retained.
- Admin context is a badge beside the account name. Admin-Learn retains its read-only description in its accessible label/title. The badge opens the same scoped Curriculum chooser; management shows the same Admin badge without adding another banner. Permissions and available workspaces are unchanged.
- Explicit Close controls use the same top-right 44px X in workspaces, Class Notes, lesson media, plans, assessments, notices, progress and Library drawers. Original links/handlers and unsaved-entry guards are retained. Form Cancel actions remain distinct.
- Local Chrome and WebKit checks cover 320–1440px, 200% text, guarded X dismissal and Admin Curriculum on phone/desktop. Phone sample headers measure about 126px, down from 167px. The existing isolated preview is updated without reseeding or touching Development/live.

## Sample Admin entry — V107.91

The preview landing page now offers Open Learn, Open Teach and Open Admin. `/__signin/global` signs into the existing synthetic Global Admin account through the real login flow, then opens the sample Program planner in Admin-Teach. The badge is visible immediately, and the Learn/Teach/Admin tabs allow testing the other Admin contexts. The fixed account allowlist, dedicated preview origin and synthetic-only configuration checks remain in place. This release preserves storage, secrets and sample drafts without reseeding or changing hosted SQL.

## Clearer Refresh icon — V107.92

The shared header Refresh icon now uses an open circular arrow with a distinct arrowhead, matching the user's example. Its accessible name, tooltip, touch target and guarded refresh handler are unchanged. The update is limited to the existing isolated preview and preserves sample Admin access and saved plans.

## Development release — V107.93

The user confirmed V107.89 was deployed and authorised releasing the tested mobile Learn/Teach feature to Development. Merge the current Development baseline, preserving its remembered-ID/PIN account switcher, two-row PDF toolbar/zoom/colour tools, natural Library rows and protected Surah Kahf companion. Keep the four header actions usable on phones, including the existing Switch account action; the account-name shortcut retains a 44px tap target. Refresh changed asset cache queries to ensure returning browsers receive the release.

Build the standard Development Pages entrypoint and API runtime. Do not deploy the synthetic preview Worker or its sign-in routes, storage, seed or credentials. No migration, database correction, private coordinator update or timetable publication is needed. Use synthetic local browser/regression checks and targeted hosted version/static verification.

### Final verification for V107.93

- All 134 backend regression files passed. Five actual Workers-runtime files required local loopback permission and passed separately; the refresh unit fixture was updated for the standard DOM attribute API.
- Chrome and WebKit each passed 38 mobile checks, covering 320–1440px, 200% text, Contents/role boundaries, planner drafts, the account-switch dialog, native date fields, four planner actions, Admin badges and PDF Library dismissal.
- The preserved V107.88 PDF controls passed annotation, zoom/colour, bookmarks, fullscreen and unsaved-replacement checks. Library rows and all 13 remembered-account/PIN switching checks passed. The unchanged V107.89 account build was also compared during verification.
- Header measurement writes are deferred outside ResizeObserver delivery and skip unchanged values, avoiding Safari resize loops without changing reading positions.
- The standard 783-file Pages build uses the Development API and contains the course companion and mobile assets. Preview sample sign-in routes, seed, credentials and backend tooling are absent. API dry-run succeeds; its only difference from deployed V107.89 is the release marker.

# Mobile-first Learn/Teach development

Status: preview V107.88, based exactly on V107.84 (`5a1731c0`). Branch: `feature/academy-mobile-first`. The user authorised a separate phone preview on 27 October 2026. The live Academy remains unchanged.

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

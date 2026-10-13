# V106.49 — Academy PDF reader and tool defaults

The owner authorised building and deploying this module on 13 October 2026. It is based on V106.48 (`a1496a02`), retaining its teaching plans and all existing role, timetable and media-access rules. Deploy the Development website and matching Development Worker through `feature/105.3.4.13`.

## Reading and editing

Public PDF cards in Library and For you open a separate Academy PDF tab. Select **Two PDFs** for adjustable side-by-side reading, or **Focus** to temporarily expand one pane. Each pane has its own searchable **Library** drawer and **Open file** action. Device PDFs are read locally, without uploading them. Replacing a PDF with unsaved annotations asks for confirmation. Download saves a PDF containing the annotations.

Phones show one PDF at a time with PDF 1 / PDF 2 tabs. **Show both** stacks the panes with an adjustable horizontal divider. The desktop divider also supports arrow keys and Home to reset its position. Library drawers close with Close or Escape.

Colours, sizes, thickness and opacity selected in a pane apply to subsequent annotations in that pane, including when changing the selected annotation's style. Choices survive replacing that pane's document, and remain independent of the other pane. They live only in the reader tab's memory: closing or reloading the tab restores the Academy defaults. Existing annotations retain their saved styles unless explicitly edited.

## Global Admin defaults

Open **Admin → Library → PDF tool defaults**. The live preview covers text colour/size, pen colour/thickness/opacity, and highlight colour/thickness. **Reset to standard defaults** previews the bundled starting values; **Save defaults** applies them to new PDF tabs. Open tabs retain their existing choices.

The defaults use one JSON value, `AcademyPdfToolDefaults`, in the existing D1 `academy_settings` table. No migration, new binding, scheduled task or live data correction is required. Authenticated saves require Global Admin authority, reject stale revisions, recheck authority inside the transaction and atomically record the audit and retry receipt. An interrupted save retains its operation identity for exact retry.

The public defaults endpoint exposes only bounded tool settings. Each reader loads them once on opening; it does not poll. Both panes share the existing cached public Library catalogue. The new reader supports current public Archive PDFs and local device files; private Library delivery remains unfinished and is not enabled by this release. Existing private lesson-media and assessment permissions are unchanged.

## PDF.js integration

The existing bundled PDF.js 6.0.227 viewer is retained. An Academy-only integration applies defaults after editor registration, updates the native toolbar, and remembers user choices in the parent reader. Two small vendor changes allow selected styles to become subsequent defaults when the Academy flag is set, and give custom highlight colours an accessible label. Legacy PDF viewers retain their existing default-selection behaviour. Changed viewer modules and Library assets use V106.49 cache URLs.

## Validation

Local synthetic D1 tests cover public redaction/query bounds, Global Admin scope, input limits, stale edits, exact retries, audit rollback and revoked authority. The local Chrome acceptance checks exercise the real PDF.js viewer, admin preview/reset, separate-tab opening, annotation style retention, independent panes, Library search/replacement, unsaved-change prompts, annotated PDF download, local device PDFs and mobile switching/stacking. No hosted load tests or private live records are used.

All **149/149 local regression files**, the synthetic Chrome acceptance checks and the Development Worker dry-run build pass.

Run `npm test`, `npm run test:pdf-reader:browser` and a Development Worker dry-run build from `backend/`. Browser screenshots and the sample annotated PDF are generated under `/private/tmp/academy-pdf-tools-acceptance/`, outside the repository.

# V107.99 — Academy Course websites

The user authorised connecting and deploying the desktop Admin Website builder on 27 October 2026. Implementation is on `feature/academy-course-website-builder`, incorporating V107.98 (`8e502ba4`).

## Admin workflow

Open **Admin → Course websites**. The list contains the active courses the current administrator may manage. Global Admin sees every active Course; an assigned Course Program Admin sees only their courses. Existing Surah Al Kahf opens its eleven current web lessons as editable components. Other courses begin from the same layout with editable example text.

Edit the home, cover, journey, ordered lessons/sections/components, course materials, menu labels, page visibility and colour theme. Direct entry supports lesson text, Arabic, ayah/translation, quotation, ordered/unordered list, word study, reflection, image, source note and takeaway. Up/down controls and dragging arrange content. Authoring prioritises desktop; adjacent Phone/Wide previews show the student layout.

Canva files are exported as PNG/JPG/WebP or PDF, then uploaded and arranged here. This feature does not import editable Canva websites or automatically convert arbitrary PDFs into lessons. Images are limited to 5 MB, PDFs to 16 MB, and each Course may hold 100 uploaded file references.

**Save draft** persists a private course document. Typing alone does not publish or repeatedly call the server. **Review & publish** saves the draft and presents a review; **Publish course website** explicitly accepts the reviewed document and its referenced files. **Withdraw website** immediately hides the website from students while retaining its saved draft and course records. It does not cancel lessons, remove recordings or change enrolments.

**Save a copy** exports the in-memory document and referenced file bytes independently of a successful server save. If remote bytes are unavailable, it preserves the text in a clearly marked partial backup; importing that backup asks the user to choose the unavailable files again. Missing material files or image descriptions block publication. Copies bind to the selected real Course on the server rather than trusting their imported course identifier.

## Student delivery

The accepted student website is `/academy/course-websites/view/?course=<course-id>`, using the current Academy login and workspace/class boundary. Published websites appear on authorised dashboards and Course Teach links. Existing Kahf links retain their route and redirect to its edited website after the first explicit publication. Merely opening or saving its Admin draft preserves the current student website.

The reader includes compact Contents, adjustable text size, progress, previous/next lessons, browser-local account-scoped reflections, and mobile-first layouts. Existing Kahf completion marks and reflection keys are migrated into the component view. The original course PDF and public flyer remain in Course materials; new downloadable materials are added there. No print controls are included.

Native session and media feeds retain the published timetable, two-column phone cards, recording playback, Teacher own-note PDFs and current course/class permissions. Header Join now appears only inside the live lesson window; session cards retain the normal early joining window. Actual joins and file opens recheck current server authority. Assessments retain their existing release, submission and marking tools.

## Persistence and access boundaries

`course_website_documents` stores the current authoring document, revision, source kind, enabled state and actor metadata. `course_website_assets` stores immutable course-scoped file references, MIME type, size and server-verified SHA-256. Files live in the existing private R2 bucket under the existing object namespace. PDF streaming/hash checks reuse `lesson-pdf-storage.js`; images use bounded byte/signature/hash validation. Storage keys never appear in reader responses.

Draft writes require actual Admin workspace authority for the selected Course and run through the management store's current-session, account-revision and scoped-write guards. Uploads recheck authority in the guarded metadata transaction after bytes are stored. Queued editor saves/imports retain their Course generation and cannot attach to a newly selected Course. Account changes abort requests, remove private views and revoke object URLs.

The new tables belong to the presentation family in accepted setup. Draft source payloads belong to Admin; Core holds only references until acceptance. Core owns the live enabled field so withdrawal dominates pinned older heads. Explicit publication captures the selected document and exactly its same-course referenced assets with full-row/revision checks, using existing operation receipts and changes acceptance. Unrelated drafts remain private; stale publication receipts are rejected. A small Core `CourseWebsitePublished:` setting advertises availability without loading full lesson documents into routine dashboard queries. It is written only on completed acceptance, and cleared on withdrawal.

Student text and assets always use accepted repositories, including Admin student views. Current Course access and active state are checked separately. The Al Kahf source kind retains its original course-PDF publication gate. Course assets must be referenced by that accepted document and belong to the same Course; uploaded but unpublished assets are never student-readable. Old accepted files are retained rather than deleted on replacement.

## Schema and rollout

The full synthetic source schema is `backend/migrations/academy/0039_course_websites.sql`. It is for disposable unsplit fixtures, not direct deployment to the split stores.

Apply only these additive physical upgrades to the existing explicit bindings:

- Core: `backend/migrations/academy-core/0004_course_websites.sql`.
- Admin: `backend/migrations/academy-admin/0001_course_websites.sql`.

They are derived through `cleanSchemas` using all 39 source migrations, include the twelve Core fence/epoch triggers, preserve physical field ownership, and allow private NULL payload skeletons. Generated layout/column descriptors add only the new table entries, retaining all prior identifiers. Do not bootstrap/reseed, rebuild stores, export live databases or republish timetables.

Deploy the matching private split coordinator first, then Development API, then Academy website through the existing workflow. Preserve existing database IDs, `SPLIT_V1`, run digest, accepted head, variables, secrets and R2 bucket. No course website content is automatically published as part of deployment; Admins publish their own later edits.

## Verification

The course-specific checks exercise scoped list/get/save, read-only workspace denial, stale revisions, exact retry, private drafts, exact-course acceptance, asset byte checks and membership, live withdrawal under pinned heads, source conversion and real split ownership. Editor fixture checks cover explicit saving, queued saves/imports across Course switches and export recovery during save failures. The real Workers/DO/D1/R2 regression includes website PDF upload, draft isolation, publication, student download and pinned-head withdrawal.

Release checks also include the full backend regression suite, native shared-header/navigation tests, public asset boundary/build, matching versions and API dry-run. Hosted verification is limited to additive schema metadata, essential release/static assets and one API readiness check. Existing protected recordings and student uploads are not changed by release testing. Local browser visual testing remains unavailable under the managed browser's local-URL policy; any authenticated live visual review must use the existing user login.

# Academy course websites — design and integration plan

Status: local editor design, 27 October 2026. Branch: `feature/academy-course-website-builder`, based on V107.96. No migration, production endpoint or publishing connection has been implemented in this feature yet.

## Authoring and student experience

Add **Course website** to the authorised course Admin menu. Select an existing course and begin with the Surah Al Kahf template. Edit its home, ordered web lessons, journey, course materials, menu labels and appearance. Each lesson contains ordered sections and typed components: text, Arabic passage, ayah/translation, quotation, list, word study, reflection, image, source note and takeaway.

The student course uses the current Academy header and login, compact Contents, reading controls, progress and reflections. The same accepted course content serves mobile and wider screens. Combine sessions, recordings and notes in the existing two-column phone cards. Show the header Join now action only during the authorised live window. Keep downloads in Course materials and retain assessment release/submission/marking rules.

Canva is a source of exported images and downloadable PDFs. Upload and arrange those assets in the editor, and type native lesson text alongside them. Content stays readable on phones rather than becoming a single image of a page. Editable Canva document import and automatic PDF-to-lesson conversion are outside this first design.

Saving an Admin draft must not alter a student course. Preview uses that draft; **Publish course website** explicitly accepts only the reviewed course document and its referenced assets. Withdrawing a website must take effect even for an older accepted head. Timetables, lesson media, assessments and course roles continue to use their existing tools.

## Proposed course document

Persist a versioned, validated document keyed by the existing course activity key. The design's `model.mjs` provides a first format to refine during integration: home/settings, journey cards, ordered lessons/sections/components, menu/page flags and material references. Stable component IDs preserve lesson progress and reflections when content is reordered. Asset references contain opaque IDs, never object keys or arbitrary executable HTML.

The design's local draft IDs and copies are experimental authoring identifiers. Importing into a real course must bind the document and every uploaded asset to the currently authorised course on the server. Do not infer authority from the imported course ID or client-side preview.

## Proposed persistence and publication

Use dedicated course document and asset tables instead of a large `academy_settings` value. Generic setup reads and federation capture requested tables; adding full course documents to routine settings reads could enlarge unrelated operational requests and expose drafts through an overly broad settings path.

A proposed additive migration, not yet created or applied:

- `course_website_documents`: `activity_key` primary key, `document_json`, `schema_version`, `revision`, `enabled`, `updated_at`, `updated_by`.
- `course_website_assets`: `asset_id` primary key, `activity_key`, unique immutable `object_key`, `filename`, `mime_type`, `byte_size`, `sha256`, `created_at`, `created_by`. Index by course and asset ID.

Register the document/asset ownership and foreign-key scope in `d1/setup-schema.js`, then regenerate separation layout/column metadata from synthetic schemas. The presentation family owns draft definitions. Keep only the enabled/withdrawal guard in live Core state so a withdrawal wins over an older published head. Verify the exact split-store ownership before constructing a migration; do not blindly apply an unsplit schema to both stores.

Add a course-scoped `d1/course-websites.js` service using the existing management store, with a `COURSE_WEBSITE` scoped dataset. Draft save and upload use `acceptDefinitions: false`, expected-revision checks and existing operation receipts. Publication prepares a narrowly scoped feature change containing exactly the selected document row and referenced assets, then uses the current changes acceptance flow. Extend the management-store plan options to forward narrow entities and full-row capture where needed, rather than accepting every pending course draft. Superseded publication receipts must not publish stale content or consume unrelated drafts.

Existing reference points: `d1/management-store.js`, `d1/feature-change.js`, `d1/setup-publication.js`, `d1/setup-reader.js` and `separation/federation.js`.

## Proposed routes and access

Authoring routes under `/api/admin/platform/course-websites/`: get, save, upload, publish and withdraw. Reader routes under `/api/academy/course-websites/`: read and asset. These are proposed interfaces, not available endpoints.

Preserve the worker's workspace/repository selection guards. Authoring requires current Global Admin or the assigned Course Program Admin authority; read-only Admin Learn/class previews cannot write. Student delivery always uses the accepted repository, including when an Admin opens the student view. Check current course access, active course, live enabled state and accepted document before serving content. Asset delivery also verifies accepted document membership and same-course ownership. Do not return private storage keys.

The current Surah Al Kahf route and its publication/material access guard in `course-books/course-companion.js` remain a fallback during rollout. Generalising templates must not weaken that gate or change its protected materials accidentally.

## Upload storage

Reuse the existing streaming PDF storage validation and hashing in `d1/lesson-pdf-storage.js`, including when bytes deduplicate. Extract the bounded JPEG/PNG/WebP validation pattern from `d1/announcements.js`; verify signatures, size and server-side hashes. Upload handling runs before the ordinary small JSON-body parser and enforces its own bounded stream.

Use immutable, course-scoped R2 objects. Recheck authorisation in the metadata transaction after upload. Retain objects referenced by older accepted heads; replacing a draft image must not delete an asset that a published course still needs. Client size/type checks are only a convenience, not the authority.

## Verification and staged delivery

The local design has 19 passing fixture checks and a self-contained build. Browser visual checks are pending because the managed browser rejected local HTML URLs. The private hosted source export was separately rejected by automatic approval review as beyond feature-branch authorisation. Neither restriction has been bypassed. The user can review the standalone file locally; source export to private hosting requires explicit approval.

Before production integration is released, cover:

- Draft isolation, valid structured content and asset membership; exact-course publication and preservation of unrelated drafts.
- Wrong-course writes/reads, read-only class previews, revoked authority during upload and current course withdrawal against older heads.
- Revision conflict, retried/lost acknowledgements, superseded publication receipts and safe rollback to prior accepted content.
- Forged asset IDs/storage keys, malformed or oversized files, byte-validated deduplication and continued availability of immutable old assets.
- Existing Kahf course fallback, recording/join timing, assessment gates, protected downloads, account cleanup and separate learner reflections.
- Real split-store ownership and accepted-reader boundaries using disposable local fixtures; small, targeted hosted checks only for a separately authorised release.

Review the design first. Then implement and test the guarded persistence/publishing flow on this branch. A future release must have aligned API, website and any required coordinator/schema changes, a fresh version before pushing, and explicit deployment authorisation. The current deployed portal remains V107.96.

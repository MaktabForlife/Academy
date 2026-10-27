# Course Website Studio — working design

This local feature explores a reusable desktop Admin editor for Academy course websites. Course authoring is designed for a desktop workspace; the published student pages remain mobile first. It follows the Surah Al Kahf course structure and uses editable example text, with no student accounts or protected course readings embedded.

## Try the design

Open the generated `outputs/course-website-studio/index.html` file in your browser. This self-contained file includes the editor, student preview, fonts and sample cover; it needs no server. Browser storage availability for local files varies. Use **Save a copy** to keep a portable backup with your lesson text and uploaded files.

1. Choose **New course** or edit the example draft. Set its name, small course label, welcome and cover.
2. Open **Web lessons**. Type directly, add sections, then choose **Add a component**.
3. Use text, Arabic, ayah with translation, quotation, bullet points, word study, reflection, image, source note or key takeaway components.
4. Arrange lessons, sections, components, journey cards and materials with the up/down arrows. Dragging is also available; arrows provide a keyboard-accessible alternative. Undo restores the last structural edit.
5. Export designs from Canva as PNG/JPG/WebP or PDF. Upload images for covers or lesson components, and PDFs under **Course materials**. This design imports exported files; it does not import an editable Canva website.
6. Use the student preview beside the desktop editor, switching between **Phone** and **Wide** to check the student layout. Try Contents, text size, reading progress, reflections and Previous/Next lesson controls.
7. In **Sessions & recordings**, try Upcoming, Live lesson and Finished. The live example adds Join now in the course header. Session cards combine joining, recordings and notes, with two columns on phones. Example actions explain where the existing course tools will connect.
8. Set menu labels, page visibility and one of three course colour themes. Review the course, then save a copy. **Open a copy** creates an independent draft and restores its files.

Downloads appear only in Course materials. No print controls are included. The student reflection download is also there.

## What is connected

The design saves drafts and files in a separate browser IndexedDB database, `academy-course-studio-design-v1`. Student preview progress and reflections use separate course-scoped localStorage keys. There are no portal API requests, login tokens, real recordings or publishing actions. Device storage failure keeps the current files in memory and offers a portable copy; closing without saving a copy can lose those unsaved changes.

Images are limited to 5 MB each and PDFs to 16 MB. File checks use byte signatures. Imported copies have structural and size limits, validate embedded file bytes, and create fresh course/file identities. Typed content is rendered as text rather than executable HTML.

## Build and verify

From the repository root, with the backend development dependencies installed:

```sh
node --test designs/course-website-studio/*.test.mjs
node designs/course-website-studio/build-preview.mjs /absolute/path/to/course-website-studio/index.html
```

The build creates one self-contained HTML file. The 19 fixture checks cover model limits, safe text, file handling, editing, ordering, Undo, course switching, portable copies, storage failure and preview behaviour. They do not constitute browser visual testing. The managed browser refused local HTML URLs; phone/desktop visual review remains pending.

The production asset allowlist excludes this design directory, and no portal entrypoint imports it. Production integration is planned in `docs/ACADEMY-COURSE-WEBSITE-BUILDER.md`.

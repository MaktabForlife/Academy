# V107.25 — Admin setup publication, Phase 2

Separate editable setup from accepted reader references within the current D1 database. Add a scoped review, frozen manifest, dependency/name closure and atomic publication head; keep source drafts and immutable history. Route ordinary reader services through accepted definitions while checking current Core authority and immediate suppression. Pin related reader requests and caches to the accepted head, including separate public timetable snapshots. Retain the existing layouts, files, identities, receipt recovery and Program publication query budget. Add only migration 0032 and an explicit initial-reference bootstrap; no physical database split. Publish the matching feature website and `feature_worker` to preview. Continue through Phases 3 and 4 under the user's authorisation, then complete the required UI/Development checkpoint before Phase 5.

# V107.24 — Separate feature preview Worker

Add `feature_worker` for `feature-admin` with the Phase 1 permissions. Route only feature Pages builds to it; Development keeps its current API. Retain the same Development D1, R2, login limiter and existing Open Library coordinator. Keep encrypted authentication/Library bindings and the existing Hifz configuration. Do not add another scheduled job or migrate/copy data. Refresh the configuration asset cache and align the active release markers. No layout changes.

# V107.23 — Admin separation, Phase 1

Separate Admin at `/academy/admin/` and carry the selected Learn, Teach or Admin audience through shared and legacy APIs, raw uploads and protected files. Retain one sign-in and real actor. Admin readers receive student or ordinary Teacher fields; previews cannot create participant events or perform teaching work without genuine assignments. Scope caches and delayed responses to their workspace, retain unsaved guards and PDF tools, and keep the existing layouts and storage homes. Add Global-Admin-only app time-zone settings and close per-area time-zone overrides. No database migration, attendance reset or manual exception subsystem. Prepared on `feature-admin`; validation is recorded in [Phase 1](docs/academy-separation/phase-1.md).

# V107.22 — Attachment names and whole-Course PDFs

Add editable names beside each YouTube link, an optional PDF name on upload and a rename action for existing PDFs. Show names on media cards, attachment choices and viewer headings. Retain original filenames, R2 object keys and stable video references when saving names or lesson details. Add an independently published Course PDFs section above the session calendar, available across all sessions and weeks for that Course. Course/Global Admins manage it; enrolled learners and teachers read published files under existing access rules. Keep session PDFs, discussions and timetable publication independent. Apply additive migration 0031 after recording a Cloudflare recovery timestamp and running preservation checks. Verify name editing, old-client saves, exact retries, original downloads, publication/access revocation, private playback and desktop/phone flows with disposable data. Development only.

# V107.21 — In-place PDF text, editable saves and favourite colours

Replace the comparison's text popout with an on-page editor. Single-click existing text to edit; resize strokes and shapes, or adjust line endpoints. Use the pinned PDF.js annotation writer for editable FreeText, Ink and Highlight records, preserving supported annotation edits on reopen. Keep shape settings in validated per-annotation metadata; native PDF.js edits invalidate stale settings. Add editable favourite colour slots stored in this browser. Development comparison only; the normal reader and database are unchanged. [Validation and scope](docs/PDF-EDITING-107.21.md).

# V107.20 — Separate PDF annotation comparison

Add `/academy/pdf-compare/` for comparing existing PDF.js tools with a separate Academy toolbar over the same PDF. Includes local file opening, a two-page worksheet, labelled pen/text/highlight controls, box/oval/line/arrow shapes, selection, text editing, move/resize, whole-mark erasing, Undo/Redo, linked page navigation and annotated PDF download. Device PDFs and editable marks stay in the tab. Export preserves the original page content and adds a permanent image overlay. The current reader has no functional changes. [Verification](docs/PDF-COMPARISON-107.20.md).

# V107.19 — Active lesson card layout

Fix the active timetable card squeezing its name and In progress status into a narrow column beside Join lesson. Keep Details, Join and media actions in separate rows within the shared card; short time/title pairs remain compact and longer names wrap into the full card width. Apply the same layout to Program and Course cards in main and scoped timetables. Verify the previous layout fails the active-card check, then test students, teachers and Global Admins in LEARN/TEACH at nine desktop/tablet/phone widths, including long names, upcoming lessons, multiple active lessons and video/PDF actions. Development only; no schema or live data edits.

# V107.18 — Video/PDF actions on the main timetable

Add video and PDF icons to main LEARN/TEACH timetable lesson cards and preserve each lesson’s identity within combined Program cards. One attachment opens directly; multiple attachments offer a choice. Reuse authorised video playback/private PDF dialogs and recheck access at click time. Only published media within current roles and class membership appears; anonymous snapshots contain no media references. Add a visible Library link to both main workspaces. Batch attachment metadata without exposing recording URLs or R2 paths, invalidate old timetable caches, and retain Details/Join behavior. Verify Program/Course matching, learner/staff access, revocation and responsive layouts with disposable data. Development only; no database migration or live record edits.

# V107.17 — Weekly lesson media for Programs, Courses, LEARN and TEACH

Use one timetable-style Lesson media view across management and personal learning/teaching pages. Show dated lesson cards with video/PDF attachment icons and counts, week arrows, date jump, touch navigation, Program class filters and staff Course-offering selection. Staff open published Program lessons or saved Course sessions to attach media; learners receive only published accessible media and never draft timetable details. Retain older session media and the permanent Mothers of the Ummah recordings even when no current timetable lesson matches. Reuse current private uploads, video playback, discussion moderation, exact retries and unsaved-entry protection; calendar browsing is read-only. Verify scoped calendar access, creation/reopening, icon updates, downloads, discussions, swipe layouts and session changes with disposable data. Development only; no migration or live record edits.

# V107.16 — Program timetable review actions

Place Edit the timetable and Discard edits first in the Program Review & publish control row. Move Discard edits into the Timetable planning-board header immediately before Edit published timetable / Continue editing draft. Reuse the existing edit and confirmed-discard behavior; disable both discard controls when no unsaved timetable changes, pending save or tab conflict needs discarding. Report successful discard and preserve saved drafts and published snapshots. Verify cancellation, restoration, saved/published states and desktop/phone layouts with disposable data. Development only; no schema or live timetable edits.

# V107.15 — Separate controls for split PDFs

Keep document controls above their respective left and right PDF panes instead of moving the selected document’s controls into the shared header. Give each pane its own bookmarks and Focus actions, retain shared layout controls, and identify the active pane when interacting with native PDF editing tools. Preserve frames, reading positions, independent annotations and Whiteboard behavior across responsive layouts. Development only; no schema or live data changes.

# V107.14 — Timetable Edit button beside Save draft

Place Edit published timetable / Continue editing draft in the Weekly planning board header, immediately before Save draft, as requested. Retain editing access and explanatory text in Review & publish, along with existing save, locking and publication behavior. Verify desktop and phone layouts plus draft reopening and republishing against disposable data. Development only; no schema or live data changes.

# V107.13 — Academy PDF whiteboard

Port the legacy Reboot v99.1 Teaching Panel’s drawing, eraser, colour, history, clear, sharing and notes tools into the Academy reader. Provide a Whiteboard toolbar button, numeric line size, explicit PNG and UTF-8 notes downloads, desktop resizing and compact touch layouts. Keep both PDF frames mounted while showing the selected PDF beside the board; restore page locations and the previous split layout. Keep drawings and notes within the current reader tab, protect unsaved content when leaving, and preserve the existing PDF annotation/default/bookmark workflows. Development only; no database or legacy-site edits.

# V107.12 — Subject columns and correct volume labels

Replace the Library editor selector with alphabetical subject columns, Uncategorised first, and alphabetical titles within each column. Preserve search and unsaved resource edits; provide horizontal scrolling, phone swiping and navigation arrows. Saving a subject reclassifies the visible resource without changing its identity. Fix the filename parser reusing an explicit part number as a range endpoint: Yassarnal Quraan now shows Part 1 and Part 2 as separate choices. Keep real combined-part labels, original file links and volume numbers; repair duplicate labels from existing browser snapshots without forcing new network requests. Development only; no migration or live metadata edits.

# V107.11 — Period retiming and immediate clash highlights

Apply period start/end changes to the linked lesson boundaries across all weekdays and classes in the current Program, including outer boundaries of spanning lessons. Preserve lesson identities and independent gap breaks; update aligned breaks and restore the whole change with Undo. Highlight potential class, teacher/co-teacher, shared-learner, availability, hour-limit and break clashes on lesson cards without waiting for Validate. Existing validation and publication checks remain in force. Verify retiming, saving/reopening, conflict resolution and desktop/phone layouts against disposable data; published timetables remain unchanged until republished. Development only, with no schema migration or live timetable edits.

# V107.10 — Consistent Program timetable editing

Replace the current Copy to edit notice with Edit published timetable. Show the editing action in both Timetable and Review & publish; already editable saved and imported timetables show Continue editing draft. Preserve current working drafts instead of copying over them, and keep published snapshots unchanged until a reviewed revision is published. Verify all active synthetic Programs, desktop/phone layouts, saved draft reopening and a second publication. No schema migration or live timetable corrections.

# V107.9 — Media follows Review & publish

Move the Program Lesson media and Course Media tabs immediately after Review & publish, before Enrolment requests. Existing media, drafts and access rules are unchanged.

# V107.8 — Visible timetable validation editor

Fix the apparent freeze after opening a lesson from a validation issue in Review & publish. Select the visible Timetable workspace before opening the lesson modal, preserving the current draft. Verify desktop and phone correction, cancellation, saving and revalidation against a disposable database. Development only; no database migration or live timetable edits.

# V107.7 — Session lesson media

Extend the MOU lesson-media service to Programs and Courses. Media entries link to a dated published Program lesson or saved Course session, accept up to ten YouTube links and ten private R2 PDFs, and start as drafts. LEARN/TEACH expose the dedicated Lesson media tab. Assigned teachers and administrators manage their sessions; enrolled learners see published entries within their class/course scope. Retain MOU recordings, notes and discussions. Apply migration 0030 before deployment; it preserves existing media records and permits Course sessions without a Program class. [Release details](docs/ACADEMY-SESSION-MEDIA-107.7.md).

# V107.6 — Numeric PDF annotation controls

Replace the PDF.js text-size, line-thickness and freehand highlighter-thickness sliders with number fields and native step controls. Preserve their ranges of 5–100, 1–20 and 8–24 respectively. Temporary empty, fractional or out-of-range entries never reach the annotation editor and revert to the last valid value on blur. Verify direct entry, keyboard stepping, drawn/typed annotations, saved PDF sizes and phone layout. Development only; no database or content changes.

# V107.5 — PDF toolbar and full screen

Combine reader and selected-PDF controls in one row on large screens. Full screen hides the Academy brand and account headers, with a persistent exit button and Escape support. The PDF frames stay mounted, preserving reading position and annotations through header toggles and responsive layout changes. Phone layouts retain compact pane controls. [Verification](docs/ACADEMY-PDF-TOOLBAR-107.5.md).

# V107.4 — Library refresh

Fix shared-header Refresh delegating to CSS-hidden controls on the active visible page. The public Library now replaces its weekly browser snapshot on explicit Refresh, allowing new Archive resources to appear immediately. Hidden/inactive panels, disabled actions and existing draft guards retain their checks. No Library records, assignments, database schema or storage identities change. [Verification](docs/ACADEMY-LIBRARY-REFRESH-107.4.md).

# V107.3 — Header layout aligned with Hifz

Branding and dates share the left of the top banner; Home, Refresh and Login/Sign
out sit on the right. The second banner contains the profile and existing role
navigation. Academy has no Zoom control. Shared scripts preserve page actions and
their draft guards across standalone tools. Updated header assets use V107.3 cache
keys; the matching Development Worker changes only its health version. No database,
credential, profile or Hifz changes. [Verification](docs/ACADEMY-HEADERS-107.3.md).

# V106.82 — Development Academy cleanup

Promote V106.81 Academy features to the existing `development` branch and remove the unused legacy application, Google backend clients, private Drive handlers, old upload bridge, isolated feature packager and legacy deployment target.

Use the dedicated Academy Pages builder and D1 Worker entrypoint. Preserve the existing database, account credentials, sessions, role evidence, Library namespace, Durable Object class and all active storage bindings. Independent HifzHelper links remain; the cancelled shared-login integration is excluded.

Direct clean-runtime regression checks also correct Open Library expired-session responses to return 401. Offline import comparisons use the current public timetable contract. Legacy-only regressions remain recoverable in Git history; current D1, UI, media and recovery checks remain active.

No new branch, Worker, database or production environment is created. Legacy `main` and `rebootworker` are unchanged. [Full release record](docs/ACADEMY-DEVELOPMENT-CLEANUP-106.82.md).

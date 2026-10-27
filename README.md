# V107.89 — Surah Al Kahf course website

Surah Al Kahf opens a complete mobile-first course website from the Learn dashboard, using the existing Academy login. Eleven web lessons include selectable Arabic and English text, word studies, journaling, browser-local reflections and progress. Published recordings, session notes, course PDFs and assessments use the current protected Academy readers and permissions. PDF download and print stay available separately. Teacher editing and Admin tools retain their existing destinations.

Incorporates deployed V107.88, preserving its PDF toolbar, Library display and remembered-ID changes. Mobile checks pass at 320/390/430 px and in landscape; local access, revocation, account-switch and file-delivery tests pass. No schema, live material upload or private coordinator change. The user authorised deployment after confirming V107.88 was live. [Implementation and verification](docs/ACADEMY-SURAH-KAHF-COMPANION.md).

# V107.88 — PDF reader header, zoom and colour menus

Keep the Academy identity/date and Home/Refresh/account actions in the top banner. Put PDF Split, Full screen and Close on the lower account/workspace banner. Native PDF zoom shows AUTO and ACTUAL on a white field. Favourite colours stay inside the Border/ink dropdown; Fill offers the same saved palette and custom colour picker. Border and fill selections remain independent.

Preserve the V107.87 Library row correction, editable annotations, bookmarks, swipe scrolling, per-PDF controls, fullscreen recovery and existing permissions. No database or coordinator change. [Implementation and verification](docs/ACADEMY-PDF-TOOLBAR-10788.md).

# V107.87 — Library subject display correction

The PDF reader Library keeps complete subject headings and expanded book rows visible, with scrolling inside the list. This corrects clipping when bookmarks and many subjects exceed the available drawer height. The separate mobile-first feature is not included. No database migration or permission changes.

# V107.86 — Remember IDs by default

Remember my ID on this browser starts selected for Academy Login, personal-link login/PIN setup and Switch account, including Use another ID and subsequent sign-ins. Users can still untick it; an unchecked ID is not retained. Remove and Forget all continue to clear remembered IDs. Every account switch still requires fresh server PIN verification.

The user requested deployment to Development after verification. No database or coordinator change. [Implementation and verification](docs/ACADEMY-ACCOUNT-SWITCHING-10785.md).

# V107.85 — Remembered IDs and account switching

Optionally remember account IDs in this browser and choose them from Login or Switch account. Every switch requires a fresh PIN verified by the existing account service. Wrong PINs and cancellation keep the current account; successful switching ends its session, clears private cached information and opens the new authorised workspace across Academy tabs. Include local removal/forget controls and protect unfinished work.

Released from `feature/academy-account-switching`, incorporating V107.84. No database upgrade or coordinator change. [Implementation and verification](docs/ACADEMY-ACCOUNT-SWITCHING-10785.md).

# V107.84 — Permission and timetable/calendar read optimisation

Repeated permission proofs now reuse a server-verified database version while retaining live session, revocation, expiry and timed-grant checks. Accepted timetable/calendar reads capture only the requested publication components instead of unrelated history. Write guards, owner merging, published visibility and app responses are preserved.

Incorporates V107.83. The user authorised deploying the private coordinator before the matching Development API and website; no database upgrade, backfill or timetable republishing is required. Keep live checks small to limit database usage. [Implementation, local measurements and verification](docs/ACADEMY-PERMISSION-TIMETABLE-READS.md).

# V107.83 — Reuse identical lesson PDFs

Identical PDFs now share one stored file across separate lesson attachments and Teacher dated/recurring note versions. Attachment names, audiences, permissions and immutable history remain independent. File contents are streamed and verified even when the bytes are already stored. The same 16 MB limit and protected download checks apply; existing files remain readable. No additional D1 lookup is added for reuse.

Incorporates V107.82 planner and Admin dashboard changes. No database migration, private coordinator update or live file backfill is required. Timetable cards are unchanged, following the user's confirmation that this is no longer an issue. Keep live checks small to limit database usage. [Implementation and verification](docs/ACADEMY-SHARED-LESSON-PDFS.md).

# V107.82 — Teacher planner and Admin dashboard follow-ups

New Program plans start with one blank Teaching plan section, a Program subject/module chooser and a class chooser with a changeable default. Add subject appends sections without losing existing work. Revert to saved plan sits to the left of Load a plan and restores the saved version for the currently selected week.

Admin review queues show submitted registers with absentees and submitted lesson plans. The Global Admin inheritance banner is removed and Visit website is restored. The dashboard Imtehaan heading and links open the relevant Program/Course and register in Admin-Teach, retaining separate Program links for shared Imtehaan.

Preserve V107.81 Curriculum, Library PDFs, permissions and existing saved plans. No database migration or coordinator update. [Implementation and verification](docs/ACADEMY-PLANNER-DASHBOARD-10782.md).

# V107.81 — Curriculum management, Admin menu and Library lesson PDFs

Curriculum opens the renamed **Curriculum management** screen directly for Global Admins. Subjects & Modules, Programs and Courses remain connected through secondary tabs; the old Curriculum chooser redirects to the relevant management page. Scoped Admins open only their permitted Programs/Courses and retain the existing catalogue restrictions.

Subject status is editable as Active or Archived, including restoration of an archived subject. Saves retain the same identity, linked records, current Global Admin checks, conflict protection and exact retries. Central subject/module saves confirm only the edited catalogue definitions. The Global Admin dashboard workspace list contains exactly the nine requested items, in order, using its existing formatting.

Lesson PDF attachment forms now offer **Upload a PDF** or **Public Library**, including individual volumes. A selected public PDF uses the existing guarded upload, the same 16 MB limit and lesson/recurring audience. The public catalogue cache is reused; no new database lookup is added to ordinary navigation.

Preserve V107.80 session resources, plan policies, Quick tools, automatic homepage snapshot refresh and the Update timetable fallback. No database migration or private coordinator change is required. Keep live checks small to limit database usage. [Implementation and verification](docs/ACADEMY-CURRICULUM-10781.md).

# V107.80 — Session resources, plan requirements and simpler Admin tools

Teachers can attach one PDF to a dated lesson or every accepted occurrence of the same session, with current assignment checks on both listings and downloads. Session plan requirements inherit the Program/Course default; an Admin can save several overrides or restore inheritance from a future teaching day. Optional plans stay editable and saved history remains available.

Use the requested nine Admin destinations, with Curriculum grouping Subjects/Programs/Courses and Enrolments under Users. Admin Quick tools retain only Surahs and Duas Tracker, Library and Voice Recorder. Ordinary Save and feature Publish now complete their exact saved changes without a separate Review setup screen or popup; unrelated drafts, timetable publication, paper approval and marks/report release gates remain protected. Preserve automatic homepage refresh and the Update timetable fallback.

Deploy the compatible private coordinator before the matching Development API and website. No database migration or live data correction is required. Keep live checks small to limit database usage. [Implementation and local verification](docs/ACADEMY-UI-SESSION-10780.md).

# V107.79 — Refresh from standalone management pages

Load the shared refresh helper on all Academy workspace pages, including standalone Program/Course management and user profiles. Keep V107.78 automatic accepted-publication refresh, durable recovery and the Update timetable fallback. Local browser verification confirms that the actual Program Publish action warms the public snapshot; a regression check covers all 27 workspace pages. No database or private coordinator upgrade is required. Keep live checks small to limit database usage.

# V107.78 — Automatic homepage refresh after publishing

Restore immediate homepage snapshot refresh after a confirmed publication. Record pending work atomically with the accepted publication, coalesce duplicate callbacks, and retain durable recovery if refresh fails. Keep the Global Admin **Update timetable** button and existing permissions. No navigation polling or database upgrade is added. Keep live checks small to limit database usage.

Includes the authorised planning-image follow-up: retain PDF text size in one full-width PNG up to two A4 page heights. [Implementation and local verification](docs/ACADEMY-PUBLIC-REFRESH-10778.md).

# V107.77 — Share a plan as one image

Share the complete weekly plan as one continuous PNG image for compatible image-sharing destinations such as ChatShare. Download remains a paginated A4 PDF. Preserve all subjects, Arabic text and Admin notes; retain fresh-tap sharing, cancellation and clear download/error guidance. Very large plans receive PDF guidance rather than being cropped.

The user authorised deployment of the verified changes. No database migration, live correction or private coordinator change is required. [Implementation and verification](docs/ACADEMY-PLANNING-IMAGE-SHARING.md).

# V107.76 — Planning controls and PDF file sharing

Use one top action row with Save draft, Submit, Reload and PDF download/share icons. Load a saved plan by its week, then choose another Week starting date to save it as a new plan while protecting the original and existing target plans. Remove the marked teacher-screen information and overview input, retaining stored content. Remove the submission timestamp from exported A4 PDFs.

PDF sharing sends only the actual PDF file after a fresh Share confirmation. Unsupported file sharing downloads the PDF with attachment guidance; cancellation does not trigger a download. Preserve V107.75 sign-in improvements and V107.74 assessment permissions. The user authorised this deployment; no database migration, live correction or private coordinator change is required.

[Implementation and verification](docs/ACADEMY-PLANNING-10776.md).

# V107.75 — A smoother sign-in handover

Show a dashboard loading screen immediately while restoring sign-in or opening the selected workspace. Reuse verified sign-in roles to avoid building a timetable before changing workspaces, and share overlapping session restoration requests. Preserve V107.74 assessment workflows and all current permission checks. No database upgrade is required. Keep live checks small to limit database usage.

[Implementation and verification notes](docs/ACADEMY-SIGN-IN-10775.md).

# V107.74 — Imtihaan workflow and examiner access

Use the Imtihaan Register, its assessment table and Edit reports as the three assessment screens. Save table edits together, validate schedules and current PDF approvals, and publish eligible approved papers partially. Enter marks before moderation, generate and review private reports, then release marks for the whole Imtihaan, with reports together or later. Global Admin can explicitly override missing marks and unconfirmed receipts with an audited reason; missing marks stay Pending.

Only the assigned examiner and scoped Admins can open paper PDFs, attach papers, view and confirm submissions or enter marks. Other teachers see details and status. Released paper replacements require confirmation and retain existing answers. Learners retain PDF.js printing, guided answer upload, receipts and private results. Assignment due dates use 13:00 in the Academy timezone; schedule PDF sharing and downloads are corrected.

The user authorised deployment after V107.73. No migration, live data correction, notification send or private coordinator change is required. [Implementation and verification notes](docs/ACADEMY-IMTIHAAN-10774.md).

# V107.73 — Header recovery and daily Admin timetable cards

Retry unavailable Hijri dates automatically while retaining today's last valid date. Show one daily card per Program or Course in Admin, with a class/lesson picker for joining. Preserve scoped access, live join checks and joining windows. No database upgrade or additional dashboard queries are required. Keep live checks small to limit database usage.

[Implementation and verification notes](docs/ACADEMY-HEADER-DASHBOARD-LOCAL.md).

# V107.72 — Fewer repeated configuration and assessment reads

Reuse fixed published time-zone settings and shared published assessment definitions. Keep current readiness, sessions, permissions, marks, submissions and paper release/timing checks. Preserve V107.71 assessment tables and learner submission tools. No database upgrade is required. Keep live checks small to limit database usage.

[Implementation and verification notes](docs/academy-separation/READ-OPTIMISATION-FOLLOWUP-LOCAL.md).

# V107.71 — Assessment rows, learner support and submission review

Edit assessment details and control checkboxes inline and save an Imtihaan batch once. Publish the currently approved papers without waiting for the remaining papers. Replace released PDFs before student availability, with fresh approval. Confirm external marks moderation before revealing Enter marks, then release marks once for the Imtihaan, leaving blanks pending.

Group Teach/Admin-Teach assessments across authorised classes. Add expandable submission progress with access/submission timestamps, elapsed time, PDF review and receipt confirmation. Learners get cached tables with background refresh, Open PDF with native Print, scanning help, local answer preview and confirmed submission receipts. Hide View results until personal results are released. No schema migration or live record correction.

[Implementation and verification notes](docs/ACADEMY-ASSESSMENT-TABLE-107.71.md).

## V107.70 — PDF reader and Library improvements

Edit beside Zoom restores swipeable multi-page reading when switched off while preserving annotations. Document actions sit beside the PDF name; panes close independently, Split Page is global, favourite colours stay visible, and Public Library offers subjects plus bookmarks. Manage Library retains readable titles through catalogue failures. Share uses the common connected-nodes artwork. See [release notes](RELEASE-NOTES.md).

# Umm Abbad Academy — V107.69

## V107.69 — Scoped browser messaging

Connect the existing dashboard Messages card to a personal inbox and scoped sending for Students, attached Teachers, Program/Course Admins and Global Admin. Include recipient review and de-duplication, drafts, scheduling, independent opened and acknowledged receipts, personal archiving, canonical lesson/Class Note links and retained reports. Use an additive Core-only messaging schema and a bounded delivery queue. Preserve deployed V107.68 videos and V107.67 read optimisations. FMA, PWA/push, email and learning-event automation remain deferred.

[Release and verification notes](docs/messaging-local-preview.md).

## V107.68 — Session MP4 recordings

Manual MP4 uploads attach recordings to existing sessions, using the same session permissions and publication flow. Play uploaded MP4s and YouTube videos in the app. Stop MP4 playback fourteen days after upload, show Recording expired, and omit expired-only sessions from the learner media rail while preserving session records and other links.

Use native R2 expiry only for the recording prefix. Includes a store-specific attachment schema upgrade preserving existing assets, references, indexes and triggers. Automatic Zoom imports remain deferred. Retains the deployed V107.67 read optimisations.

[Implementation and verification notes](docs/session-video-local-preview.md).


## V107.67 — Fewer database reads and batched assessment setup

Reuse private, permission-aware snapshots for dashboard timetables, assessment summaries, calendars and sign-in permission data. Refresh them when relevant published data, enrolments or permissions change, while retaining current session, account and access checks. Materialize repeated JSON table projections once per query. Calculate teacher workload only when Admin opens teacher availability.

Stage assessment schedule edits locally, save the full batch together, and validate and publish the complete Imtihaan against current data. Preserve V107.66 manual marks and grouped paper publication. Includes the additive Core snapshot counter upgrade; existing learning records remain intact.

[Implementation and verification notes](docs/academy-separation/READ-OPTIMISATION-LOCAL.md). Keep live release checks small to limit database usage.

## V107.66 — Manual marks and one paper publication

Add Enter marks to each Teacher and Admin assessment row. Open a popup with students grouped by class and sorted alphabetically, save numeric marks without an answer upload, and keep saved or corrected marks private until Admin uses Release marks. Retain scoped permissions, zero marks, exact retries, conflict checks and report results.

Use Review paper to open and approve each paper individually. Approval no longer starts setup publication. Enable Publish papers once all remaining papers in the Imtihaan are approved, then publish the complete selection through one confirmation before releasing it. Preserve V107.65 dashboard timetable links. No migration or live data correction is required.

[Release and verification notes](docs/ACADEMY-MANUAL-MARKS-107.66.md).

## V107.65 — Dashboard Imtihaan timetables

Add Assessments directly below For your attention on Learn, Teach and Admin dashboards. Group current and upcoming Imtihaan into links to their existing timetable, using each workspace’s authorised data. Learners see released schedules; staff can also see assigned draft schedules. Cache timetable summaries immediately and refresh them in the background. Exclude past, completed, cancelled and archived Imtihaan and assignments.

Admin Coming up next shows Courses only; active Program/Course management tiles, assessments and review queues keep their existing scope. Rename Review plans to Review Lesson Plans. No migration or live data correction.

[Release and verification notes](docs/ACADEMY-DASHBOARD-ASSESSMENTS-107.65.md).

## V107.64 — Assessment controls in rows

Keep Student, Teacher and Admin assessment controls in their timetable rows. Open assessment opens the paper directly in PDF.js. Students submit PDF answers through an attachment popup and see their own released mark in the same row; results and reports remain available in a popup.

Add Publish papers above the Admin list, Close submissions and Release marks in each row, with shared actions applying to every selected class. Use compact moderation and replacement-paper popups. Select the examiner from active Program/Course teachers and record the PDF uploader separately. Delete the former assessment detail screen, learner submissions/marking panel, screen handlers, answer-review dialog and unused styles. Retain stored learner records, existing release validation, exact retries and scoped permissions. No migrations or live data corrections.

[Release and verification notes](docs/ACADEMY-ASSESSMENT-ROWS-107.64.md).

## V107.63 — Shared assessment rows for All classes

Show a shared assessment once in an All classes Imtihaan timetable, with All classes and one set of paper, moderation and assessment actions. Use the original shared selection from creation events or receipts; keep independent matching assessments and differing paper definitions separate. Preserve per-class submissions and results behind the existing class picker, and summarise differing result stages without duplicating identical paper rows. Shared list identities are returned only when the complete group is within current Admin access. No migrations or live data corrections.

## V107.62 — Admin paper moderation

Allow Global Admins and scoped Program Admins to upload and moderate the same assessment PDF, including shared papers across their authorised classes. Expose Approve paper in the attachment and Moderation views for that account. Keep paper moderation permission separate from marking moderation, require current Admin workspace access and exact PDF review evidence, preserve explicit confirmation and audit history, and keep student paper release separate. Program Admin authority stays within assigned Programs/Courses; Teacher permissions remain as before. No migrations or live data corrections.

## V107.61 — One Imtihaan table and paper moderation links

Open an All classes Imtihaan as one assessment table headed with the Imtihaan name and All classes. Keep each class assessment and its actions, add a Class column, and order the combined entries by date, subject and class. Keep single-class and learner/teacher timetable views scoped as before.

Make the Admin Paper status badge open that exact assessment in Moderation and focus its paper controls. Retain the pencil icon for the attachment popup and recheck current access before opening. Confirm paper approval explicitly after reviewing the attachment; cancelling keeps it unapproved, and student paper release remains separate. Includes the validation-first release controls, contextual All classes publish label and disabled Publishing button. No migrations or live data corrections.

## V107.60 — Validate schedules before release

Add Validate schedule beside Release schedule in each unreleased Imtihaan Register row, with its validation result directly below. Enable Release only after successful schedule validation for that entry; clear validation when its data refreshes or changes, and recheck current data on the server during release. Apply the same sequence inside the schedule.

For an all-class assessment publication, replace Academy shared setup with the selected Program/Course name followed by All classes. Dim and disable Publish immediately and show Publishing… until completion. Preserve separate paper/results releases, access rules, exact retries and existing assessment data. No migrations or live data corrections.

## V107.59 — Untimed assessment schedule validation

Fix Imtihaan schedule validation so untimed exams and assignments can move from Registered to Scheduled. Use assignment opening and optional due times instead of requiring an exam date, and require a duration only for timed assessments. Show separate validation requirements for names/subjects, dates, timing and total marks. Preserve explicit schedule release, separate paper/result releases, scoped permissions, exact retries and existing assessment data. No migrations or live data corrections.

## V107.58 — Assessment table and paper attachments

Use Due date in assessment timetables and remove the Duration and Total mark columns from the table. Add a paper edit icon beside Paper status that opens the existing scoped attachment, moderation and publication controls in a popup. Keep full assessment access, unsaved-file checks, exact retries, shared-class paper controls and PDF preview. Show Results status only after the assessment is marked Ready for assessment; rows that are not ready remain blank when another row enables the column.

Remove Share image from the Imtihaan Register. Use accessible share and download icons for its existing Draft/Final PDF actions. Preserve V107.57 dashboards, Course timetable card text, permissions, learner work and explicit releases. No migrations or live data corrections.

## V107.57 — Connected workspace dashboards

Open normal sign-in at the highest authorised workspace: Admin, Teach, then Learn. Show active Programs and Courses only, linked next-session rows, the existing timetable and the Academic Calendar. Display saved dashboard data immediately while checking for updates in the background.

Teacher attendance and lesson-plan deadlines use fixed-height scrolling boxes beside the calendar; Admin has Review attendance and Review plans. Calendar Terms and Teaching hours open in dialogs, with scoped teacher-availability editing. Individual activity pages no longer repeat the shared dashboard support panels. Existing Class Notes, joining, assessment and media tools retain their permissions and draft guards. No migration or live data correction is required.

[Dashboard release and verification notes](docs/ACADEMY-DASHBOARDS-107.57.md).

## V107.56 — Lesson-linked Class Notes

Add Class Notes beside Timetable to reveal note tools inside the existing swipeable lesson cards. Save multiple long-text notes with the author, due date and retained corrections. Default to the next accepted session for the same class, subject/module and Teacher, or select a fixed date. Due lesson reminders open the original note. Students correct their own notes; responsible Teachers and scoped Admin can correct, relink or withdraw with history. Admin-Learn stays read-only.

Keep FMA, messaging, dashboard changes and alerts for later. This release adds three Core operational tables through the additive SPLIT_V1 migration in `backend/migrations/academy-core/0001_class_notes.sql`; it does not rebuild or import existing records.

## V107.55 — Lesson details on Program timetable cards

Within a Program timetable, show the module or subject as the card heading, followed by the current Teacher names and the lesson time. Keep the Program name in the timetable heading. Inherited Admin rollups show their distinct lesson titles and Teachers together with the lesson count. Preserve individual assigned lessons, joining, attachments and the V107.54 metadata caches. No database changes.

## V107.54 — Cached Home, timetables, announcements and Library

Show saved metadata immediately while checking for updates on Home, personal and Admin timetables, curriculum timetables, announcements, Course lists and Library catalogues. Keep a bounded 30-minute session cache, reuse checks for one minute and combine simultaneous requests. Refresh forces a check. Preserve cached content on temporary failures with a saved-information message. Separate private entries by account, workspace, selected Admin-Learn class and request scope; clear them on account/access changes and invalidate after successful writes/publication. Keep public announcements independent of session restoration. Preserve active editors during background timetable updates.

Use opt-in revision validators before rebuilding authenticated Home/timetable/catalogue projections. Keep fresh session and permission checks and current accepted setup; skip unchanged projection queries. Public timetable snapshots continue using their existing durable/edge cache, and shared public Library metadata stays in its existing coordinator. Do not cache meeting URLs, signed file access, credentials, PDF bytes or editable forms. Joining lessons and opening protected media still rechecks current access. No polling, migrations, reloads or live data corrections.

## V107.53 — Individual lessons for assigned students and teachers

Show each assigned lesson separately across Home, Learn, Teach and every Program/Course curriculum timetable, including an Admin’s own student or named teacher lessons. Only inherited Admin teaching access may roll up sessions, with the existing room, learning area, day and Program continuity boundaries. Check real enrolments, dated class membership and named/co-teacher IDs independently of the Admin reader audience. Refresh the daily timetable cache to remove previous grouping. No database migration or live data corrections.

## V107.52 — Compact lesson media and cached background updates

Remove the week/date/offering toolbar and swipe-help text from lesson media. Keep compact rail arrows beside Refresh and browse saved lesson media across dates, with an explicit Load earlier lessons action for longer histories. Retain whole-Course PDFs, equal-sized cards and Admin editing.

Show previously loaded media metadata from a bounded, 30-minute session cache while checking for updates. Separate entries by account, personal/Admin workspace, selected Admin-Learn class, learning area and Course offering. Clear affected entries on access denial and media changes; discard delayed prior-account/workspace responses. Check the current accepted publication and use a server revision to skip unchanged media/schedule/note queries. Opening files, videos and editors still checks current access. No file-byte caching, polling, database migrations or live data corrections.

## V107.51 — Shared assessment process across selected classes

Upload one PDF paper for a multiple-class assessment. The original class selection shares paper details, review, schedule, readiness, submission settings and explicit whole-class releases. Switch class submissions from the shared assessment screen; learner answers, attempts, marking, selected-learner decisions and results remain class-specific. Store one immutable PDF and enforce current authority for every selected class. Recover V107.50 selections from their saved creation receipt, never matching titles. Batch group writes within the existing split coordinator query budget. No migrations, database reloads, automatic result releases or new editable masters.

## V107.50 — Multiple-class assessments and Admin media cards

Choose one or more classes when adding an assessment. Apply the shared details in one atomic, retry-safe operation while retaining each class's own paper, learner work, marking and explicit release controls. Admin lesson media uses the shared swipeable card rail with Edit on each card. The compact editor has date/teacher details and Save/Close in its header, plus one Attachments section for videos and PDFs. Save title, summary, video links, PDF names and staged removals together; upload PDFs explicitly. Preserve stored files and their identities. Fix new Course session media to reference its existing offering without treating the offering as a Program class. No migration, live data correction, enrolment or automatic schedule/paper/result release.


## V107.49 — Responsive timetables and workspace navigation

Use date columns on one swipeable timetable row throughout Home, Learn, Teach and Admin. Mobile Home opens at today or the next lesson while the week starts on Sunday; week arrows sit beside the heading without duplicate range labels. Mobile Quick links uses compact cards and self-paced courses use a continuous rail. Update Library labels and its mobile right-hand menu; restore the existing My links panel. Add the scoped Curriculum chooser, rename the Admin tab Subjects, put Voice Recorder after Library in Reboot, retain Admin context in embedded calendars and provide Close to Admin Home across management tools. Preserve unsaved-work guards, the Core/Admin stores and the PDF changes. No database migration or live data corrections.


## V107.48 — Academy tools are the PDF editor

Remove PDF.js annotation controls, the native editor bridge and its setup. Disable its editing modes, shortcuts and editing feature preferences throughout the app; retain the PDF.js renderer for documents and existing annotations. Academy tools remain available through the pencil. The tools preview opens Academy first and offers the original PDF as a reference. Verify text/shape exports, bookmarks, unsaved changes, phones, split PDFs and Whiteboard using local disposable data. No database changes.

## V107.47 — Open Academy tools from the PDF pencil

The reader pencil opens the shared Academy editor from the comparison page, with freehand/sketch, shapes, colours and in-place editable text. Keep its annotations visible when the editing row is hidden. Transfer the current PDF and page without changing the selected book, volume or bookmark identity. Preserve unsaved-edit checks on file replacement, navigation and leaving the reader. Split/Whiteboard retain their existing phone restriction. No database changes.

## V107.46 — Compact publication confirmation

Show Confirm publish, the selected areas, and Cancel / optional Review changes / Publish. Remove the long explanation. Timetable Publish requires a saved, valid unpublished draft; publishing in another tab updates its read-only status and clears stale ready labels. Preserve the PDF updates released in V107.45.

## V107.45 — Compact PDF headers and markup comparison

Use compact reader banners and named icon actions, with the volume beside the title. The pencil opens a hidden final annotation row. Select a page from an editable list or type its number. Split PDF and Whiteboard sit at the right of page/zoom controls on tablet and desktop, and remain hidden on phones. Keep the existing PDF.js reader, Library/bookmark controls and unsaved-work protection. The separate comparison page adds Preview-style sketch/freehand/shapes, in-place editable text, independent fill/ink colours and editable favourites. No database or access changes.

## V107.44 — Direct Voice Recorder access

Open the image selector directly from Home for every signed-in role, Admin Home and the Reboot Program’s Learn/Teach tools. Preserve the current personal or Admin workspace. Retire the intermediate recorder page and remove its duplicate selector heading/back link; retain recording controls and the shared Academy Home action. No enrolments, learner-work writes or database changes.

## V107.43 — Course and Program media rails

Replace media day columns with matching horizontal rails of equal-sized cards. Show dated Course/session identities, Teacher names for Programs, framed play and PDF icons with file names, and a Chat coming soon message. Keep date/class selectors, Course-wide PDFs, Admin curation, Teacher notes, private file delivery and PDF.js.

## V107.42 — Single PDF view on phones

Remove Whiteboard and Split Page controls on phones, including touch landscape. Keep normal PDF viewing, annotations, Download and full screen. Tablet and desktop retain both features. Responsive changes keep PDF documents and annotations mounted, retain whiteboard drafts, and restore desktop split reading.

## V107.41 — Retire the separate visitor timetable screen

Open legacy signed-out timetable addresses on the complete Academy Home page, retaining announcements, course information, quick links and its public timetable. Keep the shared timetable for signed-in Learn, Teach and Admin workspaces. Reuse the current public snapshot without adding API requests.

## V107.40 — PDF.js reading on phones and desktop

Repair the malformed PDF reader markup and open Course/lesson PDFs, assessment PDFs and Academy announcement attachments in PDF.js. Keep Download as an explicit choice. Preserve current file permissions, private byte delivery, manual answer confirmation, public-only bookmarks, annotations, split reading and the whiteboard. Reported on mobile; desktop occurrence was unconfirmed.

## V107.39 — Reliable announcement loading

Load the anonymous public announcement list independently of sign-in restoration and workspace changes, using the server's current accepted publication. Show “Loading announcements…” throughout initial loading and every retry; retain a retry action for actual failures and discard older refresh replies. Preserve the announcement layout and all authenticated workspace guards. The original report is confirmed on mobile; desktop occurrence was unconfirmed.

## V107.38 — Development Core/Admin cutover

Deploy the reviewed Admin/personal workspaces to Development using dev-academy-core and dev-academy-admin. Preserve preview credentials, roles and work, reconcile final original-source sign-in changes, restore Hifz/Library/My links and scheduled recovery, and retain the original database and its files for recovery. Feature preview uses the same Development stores after this switch. [Cutover record](docs/academy-separation/phase-5.md#development-cutover--v10738).

## V107.37 — Personal workspaces from Admin Home

Restore Personal Learn, Personal Teach and Admin choices on Global Admin Home, and clearly label personal choices for scoped Admins too. Keep Admin-Learn and Admin-Teach inside the Admin workspace. Reduce every Admin context banner to its workspace label and description; use Home to return to personal choices. Personal views retain only genuine own access and may be empty. Preview only; no database or permission changes.

## V107.36 — Global Admin navigation

Hide ordinary Learn and Teach switches for Global Admin outside the Admin workspace. Keep ADMIN-LEARN and ADMIN-TEACH inside Admin, with the existing explicit personal exit links. Program Admin, Teacher and Student navigation retains its current behaviour. Preview only; no access, data or layout changes.

## V107.35 — Verify Admin banners against the signed-in account

Show Admin workspace banners and labels only after the server verifies current Admin authority. Return students, ordinary teachers and unassigned accounts from retained Admin addresses to personal Academy home; discard verification from a previous account. Signed-out Admin entry shows Admin sign-in. Home explicitly opens normal Academy home, while the Admin workspace link retains the separate management entry. Keep layouts and publish to preview only.

## V107.34 — Distinct Admin-Learn and Admin-Teach

Keep personal Learn/Teach tied to the account’s own enrolments and teaching assignments. Open inherited Admin access only through explicitly labelled Admin-Learn and Admin-Teach under the Admin address, with a persistent context banner, separate request permissions and isolated caches. Carry the selected Admin view through reader tabs and reject delayed responses across changes. Preview only; no database changes. [Access and verification](docs/academy-separation/admin-inheritance.md).

## V107.33 — Refresh inherited-role labels

Refresh the Users screen script cache so returning browsers receive the inherited Admin/Teacher role labels introduced in V107.32. Keep the new teaching permissions, Learn class selector and current layouts. Preview only.

## V107.32 — Inherited Admin teaching and student class viewing

Global Admin teaches every session globally; Program/Course Admin teaches every session in their assigned area. Derive eligibility from current Admin authority, preserve named examiners and management-only actions, and record the real Teacher actor. Add a Learn class selector for read-only student viewing without creating learner memberships or work. Preserve the current layouts and split preview limits. [Access and verification](docs/academy-separation/admin-inheritance.md).

## V107.31 — Phase 5 on the Admin feature preview

Promote the Phase 5 implementation after Phase 4 review to `feature-admin` and its matching `feature_worker`, using the existing fresh `dev-academy-core` and `dev-academy-admin` stores. Development retains the verified Phase 4 V107.28 release and original database. Preserve preview data, layouts, direct manual Admin controls and the isolated preview limits on shared-service writes. [Promotion record](docs/academy-separation/phase-5.md).

## V107.30 — Separate Core and Admin preview

Route definitions and private drafts to Admin, and identities, permissions, learner work, release controls and accepted content to Core. Add guarded cross-store commits and recovery, keeping layouts and direct manual Admin controls. Phase 5 uses its own preview on `feature-split-db`; Development and feature-admin remain at the V107.28 review checkpoint. [Phase 5 record](docs/academy-separation/phase-5.md).

## V107.29 — Inactive fresh database preparation

Create and verify `dev-academy-core` and `dev-academy-admin` from active/unarchived source records on `feature-split-db`. Preserve exact current account/Hifz authority, disable policies, required reference evidence and original retry outcomes. Old Development data and R2 bytes remain unchanged. This is a preparation checkpoint; owner-aware writes, cross-store recovery and a compatible isolated split preview remain outstanding. Current Development and feature-admin stay at V107.28. [Phase 5 record](docs/academy-separation/phase-5.md).

The `development` branch in `MaktabForlife/Academy` contains the Cloudflare D1 Academy application. Legacy Reboot remains in the separate `MaktabForlife/Rebootyourmaktab` repository.

- Website: https://maktab4life.org/academy/
- Pages: `academy-maktab4life`, connected to `MaktabForlife/Academy` → `development`.
- API: https://devrebootworker.maktab4life.workers.dev/
- Databases: `dev-academy-core` and `dev-academy-admin`. Original `maktab-academy` is retained for recovery, with its application activation gate closed.
- HifzHelper keeps its separate Worker and D1; Academy provides profile and PIN updates plus a short-lived sign-in handoff.

## V107.28 — Phase 4 Development checkpoint

Enable the completed Admin separation in Development with the matching Worker and existing layouts. Shared migrations 0033–0035 are approved/applied and every original row is preserved. Include the active/legacy database carry-over register for future schema selection. Deployment verification is attested by the Phase 4 checkpoint tag; Phase 5 work is isolated and its merge into feature-admin waits for the user’s Phase 4 review. [Checkpoint](docs/academy-separation/ui-development-checkpoint.md).

## V107.27 — Media and Library separation, Phase 4

Keep the current lesson calendar and protected readers. Teachers can Post, replace and withdraw verified own PDF notes; general media and Course-wide collection curation stays in Admin. Retire discussion controls while preserving history. Add private owner-only My links, retain old Course material under current entitlement, and preserve upload recovery and PDF tools. Shared migration approval and preview verification precede the complete-UI Development checkpoint. No physical database split. [Phase 4 record](docs/academy-separation/phase-4.md).

## V107.26 — Learning operations, Phase 3

Add native sparse attendance, reviewed Course delivery rosters and exact session substitute access. Support timed/untimed assessments, future assignment due dates, late acceptance, the manual Ready warning, and direct Admin upload/mark/finalise/release controls. Preserve released results until Admin explicitly changes them. Keep existing layouts and the Phase 4 UI/Development checkpoint. [Phase 3 record](docs/academy-separation/phase-3.md).

## V107.25 — Accepted setup, Phase 2

Save Admin setup privately and publish a reviewed complete change to Learn and Teach. Keep immutable accepted references in the existing database, stable lesson/class/module IDs, immediate current access controls, and unrelated drafts/history. Existing Publish actions open the setup review; reader requests and caches follow one accepted publication. Feature preview only at this stage. The UI/Development checkpoint follows Phase 4, before any database split. [Phase 2 record](docs/academy-separation/phase-2.md).

## V107.24 — Feature preview Worker

`feature-admin` Pages builds call the separate `feature_worker` API. Development builds continue to use `devrebootworker`. Both Workers retain the existing Development D1 database, uploaded files and Open Library metadata. Preview edits therefore affect the same test data. The feature Worker has no background schedule; the existing Development schedule continues. Publish its code with `npm --prefix backend run deploy:feature`. Authentication and Library secrets remain encrypted Worker bindings. No migration, data copy or layout change.

## V107.23 — Admin separation, Phase 1

Add a dedicated `/academy/admin/` entry with the existing layouts. Learn uses the student audience and Teach uses the Teacher audience, independently of Admin authority. Apply the boundary to direct requests, uploads, downloads and retries; previews stay read only while genuine own participation remains available. Global Admin alone manages the app time zone. Keep the current database and file stores. Manual exception workflows remain out of scope. [Phase 1 verification](docs/academy-separation/phase-1.md).

## V107.22 — Named media and Course PDFs

Give each session video and PDF an editable display name, shown on Lesson media cards and when opening attachments. Preserve the original PDF filename and existing video identities across edits. Add a separate Course PDFs collection in Course Media for resources shared across every session and week. Course administrators manage the collection; enrolled learners and teaching staff read published files with the existing access rules. Migration 0031 adds display-name and media-scope fields without replacing stored files or lessons.

## V107.21 — Editable PDF annotations and favourite colours

The separate [PDF comparison](https://maktab4life.org/academy/pdf-compare/) now opens and edits text directly on the page. Text, strokes and shapes save as real editable PDF annotations and reopen in Academy tools or native PDF.js. Add a browser-saved favourite palette using **Edit favourites**. The normal reader is unchanged. [Details](docs/PDF-EDITING-107.21.md).

## V107.20 — Separate PDF tools comparison

Try [PDF tools comparison](https://maktab4life.org/academy/pdf-compare/) with the same sample or device PDF in the current PDF.js viewer and a separate Academy annotation canvas. Compare labelled drawing and text controls, Arabic/English text, shapes, moving/resizing, Undo/Redo and downloading an annotated copy. The current reader remains the normal Library reader. Development only; no database or account changes. [Details and limitations](docs/PDF-COMPARISON-107.20.md).

## V107.19 — Readable active timetable cards

Give Join lesson its own full-width row so active cards cannot squeeze the lesson name and status between the clock and Join. Let time/title details wrap according to the available width for both Programs and Courses, including grouped lessons, staff outlines and media actions. Verify active and upcoming cards across nine screen sizes in LEARN and TEACH. No database changes.

## V107.18 — Main timetable media and Library

Show clickable video and PDF icons on the main LEARN and TEACH timetable cards, including grouped lessons and Courses. Multiple attachments open a choice; playback and private PDF access are checked when opened. Add a Library button beside the main workspace actions in both modes. Read published attachment references in a bounded batch with the existing role and class rules; retain lesson details and joining. No migration or live data edits.

## V107.17 — Lesson media timetable

Replace the lesson-media card ribbon with a shared weekly timetable in Program management, Course management, LEARN and TEACH. Browse dates with week arrows, swipe the week heading or scroll across days; filter Program classes and select Course offerings. Select a lesson to attach or manage media, with video/PDF icons and counts on its card. Learners open only published media within their existing access. Preserve permanent recordings, discussions, private R2 PDFs, exact retries and older saved media when the current timetable changes. No database migration or live data correction.

## V107.16 — Program Review & publish controls

Start the Program Review & publish control row with Edit the timetable and Discard edits. Discard is disabled when there are no unsaved timetable edits; confirmation restores the last saved draft and retains published history. In the Timetable tab, place Discard edits immediately before the planning-board Edit action. No database changes.

## V107.15 — Controls above each PDF

Each PDF keeps its Library, Open file, volume, bookmark and Focus controls directly above its own pane on every screen size. Split Page, Whiteboard and Full screen stay in the shared layout row. Pane labels identify PDF 1 and PDF 2, and Focus expands the selected document while retaining both PDFs and their annotations. No database changes.

## V107.14 — Timetable editing action placement

Move the timetable Edit action into the Weekly planning board header immediately before Save draft. Keep draft continuation, published timetable protection and the Review & publish editing action. The controls wrap on smaller screens. No database changes.

## V107.13 — PDF whiteboard

Bring Reboot’s v99.1 Teaching Panel into the Academy PDF reader as Whiteboard. Draw or erase with colour and numeric line-size controls, Undo/Redo and Clear; save/share a PNG or type and download lesson notes. The panel resizes beside the selected PDF and opens over it on phones. Split PDFs remain mounted with their pages and annotations intact. Closing the board retains its contents in the reader tab; exports keep a local copy, and leaving with unsaved work uses the existing reader confirmation. No backend persistence, schema migration or live data changes.

## V107.12 — Library editor by subject

Manage Library replaces the long resource dropdown with horizontally scrollable subject columns. Uncategorised comes first for resources without an Academy subject assignment; other subjects and resource titles are alphabetical. Search preserves the current edit, subject saves move the resource to its new column, and switching resources protects unsaved changes. Correct the Archive PDF filename parser so single parts show Part 1 / Part 2 while genuine combined parts retain their range. Repair the old duplicate labels in cached catalogues without changing PDF links, IDs or cache expiry. Verified desktop/phone editing and PDF/bookmark workflows using disposable data.

## V107.11 — Period times and clash highlights

Changing a planning period updates lesson times across every weekday and class in that Program. Spanning lessons retain their outer boundaries, aligned breaks follow period changes, and independent gap breaks remain in place. Highlight potential class, teacher, shared-learner, availability and break clashes immediately. Undo restores the period and affected lessons together; save and publish retain the existing draft workflow. Verified desktop/phone retiming, save/reload, validation and immutable publications against disposable data. No migration or live timetable corrections.

## V107.10 — Edit Program timetables

Timetable and Review & publish expose Edit published timetable for published boards and Continue editing draft for existing work. Opening a published timetable retains its publication and prepares an editable draft; continuing a saved or imported draft keeps its content. Verified saving, reopening and republishing across all active Program states without live database changes.

## V107.9 — Media tab order

Program and Course management place Lesson media / Media immediately after Review & publish, followed by Enrolment requests.

## V107.8 — Timetable validation editor

Opening a validation issue now switches to the Timetable tab before displaying the lesson editor. This prevents a hidden modal from blocking the whole page on Review & publish. Drafts and published lessons are retained; no database changes are required. Desktop and phone browser checks cover correction, saving and validation.

## V107.7 — Session lesson media

Programs and Courses attach YouTube videos and private R2 PDFs to saved sessions from their Media tab. LEARN and TEACH include a Lesson media tab. The permanent Mothers of the Ummah collection and discussions are retained. Staff publish each entry explicitly; current enrolment and class permissions protect playback and PDF downloads. [Release details](docs/ACADEMY-SESSION-MEDIA-107.7.md).

## V107.6 — Numeric PDF annotation controls

PDF.js now uses number fields for text size (5–100 points), line thickness (1–20) and freehand highlighter thickness (8–24), with up/down arrows for small adjustments. Empty or invalid entries restore the last valid value when leaving the field. Existing annotations, split panes and downloads retain their behaviour.

## V107.5 — Compact PDF toolbar and full screen

Large screens put the current PDF’s title, volume, bookmarks and file controls in one row with the reader actions. **Full screen** hides both Academy headers and restores them with **Exit full screen** or Escape. Reading position, annotations and split panes remain in place. [Release details](docs/ACADEMY-PDF-TOOLBAR-107.5.md).

## V107.4 — Header Refresh updates the Library catalogue

The shared Refresh button now invokes the current page’s refresh action even when its duplicate button is hidden by the shared header styles. Public Library Refresh fetches newly added Archive resources instead of reloading the existing weekly browser snapshot. [Release details](docs/ACADEMY-LIBRARY-REFRESH-107.4.md).

## V107.3 — Header layout aligned with Hifz

The top banner groups Academy branding and dates on the left and Home, Refresh,
Login/Sign out on the right. The second banner keeps the profile and authorised
LEARN/TEACH/ADMIN navigation. Academy has no Zoom button. The shared layout applies
to the main site and connected tools, including phones. Development only; no PIN,
profile, database or Hifz changes. [Release details](docs/ACADEMY-HEADERS-107.3.md).

## V107.2 — Hifz production and separate development entry

Academy delivers profile and PIN updates to Hifz production at `hifz.maktab4life.org`. Development remains at `hifzhelper-dev.pages.dev`; its optional Academy entry uses a separate fixed receiver and return address. [Rollout details](docs/HIFZ-PRODUCTION-107.2.md).

## V107.1 — Direct HifzHelper entry in LEARN and TEACH

LEARN and TEACH show only the HifzHelper shortcut for Hifz. The duplicate Academy Hifz workspace and its old navigation links are removed, including shared menus. Long workspace titles wrap in a narrower column, giving the Programs and Courses boxes more width. Hifz lessons remain in the combined timetable and administrators retain Program management. [Release details](docs/HIFZ-WORKSPACE-107.1.md).

## V107.0 — Shared PIN and Academy-to-Hifz sign-in

Signed-in Hifz members open their journal from Academy without entering another PIN. Both development systems verify the same stronger PIN credential; new/reset PINs are chosen and confirmed in Academy. Direct Hifz visits still ask for a PIN. [Security and rollout details](docs/HIFZ-SIGNIN-107.0.md).

## V106.96 — Contact Admin and cleaner Learn/Teach pages

The homepage button now reads **Contact Admin**. It continues to open WhatsApp with the existing editable message. LEARN and TEACH no longer show the bottom shortcut-pill row below My Timetable. [Release details](docs/ACADEMY-HOME-WORKSPACE-106.96.md).

## V106.95 — Academy-branded Hifz address

Academy's Hifz links use `https://hifz.maktab4life.org/` with the current account login ID. Hifz remains hosted independently and continues to use its development Worker and D1. [Hosting details](docs/HIFZ-DOMAIN-106.95.md).

## V106.94 — Account navigation on every Academy screen

Enroll now, the PDF reader and the older Program Library pages now use the same second header as the rest of Academy. Home, Refresh, Sign out and the authorised LEARN/TEACH/ADMIN workspaces remain available across standalone pages. The reader keeps its PDF controls and fills the remaining viewport. [Release details](docs/ACADEMY-SHARED-HEADER-106.94.md).

## V106.93 — Enrolment tabs, visible Course actions and alphabetical Library

Manage Academy has an **Enrolments** pill opening **Manage Enrolments**. Manage Programs and Manage Courses include a selected-area **Enrolment requests** tab after **Review & publish**. Course lifecycle actions appear as individual buttons and keep their confirmations. Both Library views sort by subject, then displayed card title, irrespective of source or module. [Release details](docs/ACADEMY-MANAGEMENT-LIBRARY-106.93.md).

## V106.92 — Enable deployed Hifz profile delivery

Use the redirect mode supported by the Cloudflare runtime so Academy can deliver updates to Hifz. Pending profile updates remain queued and are delivered after the fix. [Verification](docs/HIFZ-DELIVERY-106.92.md).

## V106.91 — Durable Hifz profile and PIN-reset delivery

Development queues linked Hifz profile changes in the same D1 transaction, then sends authenticated updates after saving. Failures remain queued for retry. PIN resets clear Hifz credentials without sharing hashes. [Schema and rollout](docs/HIFZ-PROFILE-SYNC-106.91.md).

## V106.90 — Academy repository and development domain

Cloudflare website and existing Worker builds use the Academy repository’s `development` branch. `maktab4life.org` and `www.maktab4life.org` use the existing development API and test database. Future production will use a fresh database and separate deployment. [Deployment details](docs/ACADEMY-DOMAIN-106.90.md).

## V106.89 — Contact Admin to join, existing-user enrolment

**Contact Admin to Join Academy** opens WhatsApp directly with an editable generic message. Phone and email are available if WhatsApp cannot be used. Signed-in **Enroll now** offers website requests or WhatsApp, using the existing profile without name/number fields. Anonymous website submissions are blocked. [Release details](docs/ACADEMY-JOIN-ENROL-106.89.md).

## V106.88 — Enrolment feedback and picture announcements

Learners use **Enroll now** and a country selector (South Africa by default). The compact request form shows larger instructions, phone-format guidance, errors beside Send request, and a confirmed-send popup with OK/Cancel. Admin edits catalogue rows inline and prepares editable WhatsApp welcome messages after manual registration. Homepage announcements fill their block as picture bricks, opening the complete poster, text and links. [Release details](docs/ACADEMY-ENROLMENT-BRICKS-106.88.md).

## V106.87 — Editable copied enrolments and full announcements

Program and Course copies can include existing learners as an editable draft roster. Program class memberships and Course dates/sessions are copied with fresh local IDs; learner access stays closed until activation/publication. Clicking an announcement picture opens its full image, complete message and clickable links/PDF in one pop-up. [Release details](docs/ACADEMY-DRAFT-COPIES-ANNOUNCEMENTS-106.87.md).

## V106.86 — Copy an existing Program or Course

**New Program** and **New Course** can start blank or copy an existing learning area into a separate editable draft. Schedule settings are optional; Course dates and sessions are cleared and Programs require a new effective date at publication. Copies retain reusable structure and public cards, with fresh local IDs and no learners, access grants, enrolment catalogue/requests, attendance or progress. [Release details](docs/ACADEMY-LEARNING-COPY-106.86.md).

## V106.85 — Join the Academy and manual enrolment requests

The homepage **Join the Academy** button and Learn **Open for Enrolment** button open a shared catalogue and request form. Admin controls each Program/Course enrolment year, cost text and visibility. The editable inbox supports the Paid filter, linking or manually registering users and opening the existing enrolment tools. Payment advice goes directly to WhatsApp. Requests do not grant access or change subscriptions. [Release details](docs/ACADEMY-ENROLMENT-106.85.md).

## V106.84 — Learn and Teach layout

Programs and Courses use wider panels on desktop. The Academy label and LEARN/TEACH title match the timetable heading typography, and the marked helper sentence is hidden in these two views. Phone layouts retain stacked blocks. [Implementation and verification](docs/ACADEMY-WORKSPACE-LAYOUT-106.84.md).

## V106.83 — Teaching overview and upcoming Courses

Teach and Learn show separate Programs and Courses blocks. Global Admin navigation includes unpublished active learning areas; assigned teachers can see their own upcoming Courses. The Teach overview lists future Course dates with shortcuts to the starting timetable week and the correct planning offering. Draft details remain private to authorised staff; published sessions and live records are unchanged.

[Implementation and verification](docs/ACADEMY-UPCOMING-COURSES-106.83.md).

## Resolved issues

- **Mobile announcements on first load — reported 23 October 2026, addressed in V107.39.** The home page sometimes showed “Announcements could not be loaded”; selecting **Try again** then loaded them. The report covered Development and the former feature preview, before the database cutover. Desktop occurrence was not confirmed. An isolated check reproduced session restoration interrupting the public request. The public list now loads independently, with a loading message on initial load and retry; genuine failures retain **Try again**.

## Development and deployment

Install the pinned backend dependencies with `npm --prefix backend ci`. Run `npm --prefix backend test` and `npm --prefix backend run check:academy-boundary` before release.

Cloudflare Pages uses `npm --prefix backend ci && node backend/tools/academy-pages-build.mjs`, output `.academy-pages`, repository root, branch `development`. Development builds call the existing Development API. The `feature-admin` build calls `feature_worker` on its branch alias and immutable Pages deployment addresses.

Deploy the matching API with `npm --prefix backend run deploy:development`. The default deploy command also selects Development. This branch contains no deployment configuration for the legacy production Worker.

Development remains at the Phase 4 V107.28 checkpoint on `devrebootworker` and the original `maktab-academy` database. The Phase 5 `feature-admin` preview uses `feature_worker` with `dev-academy-core`, `dev-academy-admin` and the private split coordinator. The earlier `feature-split-db` preview uses its separate version URL against those same preview stores. Preview edits therefore affect both preview sites, independently of the current Development database.

## Storage and recovery

Retain the original Development D1 database for the Phase 4 site and recovery. Phase 5 preview uses the two new D1 stores. Keep the existing assessment and lesson-media buckets, shared public-media bucket, login rate limiter and `PROGRAM_TIMETABLE_COORDINATOR` binding. Its deployed class name remains stable to preserve Open Library metadata. The split preview retains shared-service write holds, stores new object keys under `dev-split-v1/` and suppresses physical object deletion while the split is reviewed. `ACADEMY_OPEN_LIBRARY_STORAGE_KEY` stores the complete existing Cloudflare object name and has no Google dependency.

Offline snapshot validation, import verification, provenance and recovery tools remain under `backend/tools/academy-migration/`. They read saved snapshots; the online Google capture client has been retired. No database migration runs during ordinary deployment.

[Cleanup scope, checks and infrastructure inventory](docs/ACADEMY-DEVELOPMENT-CLEANUP-106.82.md). Earlier implementation history is retained in `docs/` and [the archived README](docs/archive/README-through-10681.md); historical instructions are not current deployment guidance.

## Connected workspace dashboards

The `feature/academy-role-dashboards` checkout adds Learn, Teach and Admin landing
pages connected to existing Academy readers and tools, with cached background
refresh, Program/Course tiles, the existing timetable and calendar. See
[the implementation notes](docs/ACADEMY-DASHBOARDS-LOCAL.md). Development deployment was authorised on 25 October 2026.

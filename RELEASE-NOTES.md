# V107.111 — Complete course readings and recording cards

Use the supplied PDF teaching text as the main Tafseer and Surah Al Kahf lessons, with spelling/reference and extraction corrections recorded during preparation. Keep summaries in optional expandable asides and retain editable headings and reflections. Link Course materials to the existing protected Lesson media PDFs rather than importing duplicate files. Default to plain access cards; Admin can choose original PDF artwork or upload a replacement image, and choose dark or light text. Light text uses a contrasting darker card surface.

Connect each Surah reader to explicitly named, published native lesson-media cards, preserving each parent lesson’s paid-month, class, publication and playback checks. Actual Global and own-scope Program Admin authority grants reading across personal and Admin views without granting editing in personal Learn. The private prepared importer also supports the existing Kahf Course. No schema/coordinator upgrade or subscription activation.

# V107.110 — Private prepared course import

The Tafseer website editor can import the eight prepared module packages from the Academy’s private storage, using current scoped Admin authority. Imported lesson text and files follow the existing private Save draft and explicit Publish flow. Published reader/PDF permissions and public Foundations remain unchanged. No schema or coordinator upgrade.

# V107.109 — Tafseer Admin card actions

Global Admins and scoped Tafseer Program Admins receive website-management links while the Surah register is empty and editor links for unpublished websites. Published sites still open their lessons. Students and public visitors retain their existing access rules. Refresh the Lesson media integration asset so existing browsers load the Surah register, and include its table stylesheet in the embedded Program tools. No schema or subscription changes.

# V107.108 — Tafseer Admin website access

Tafseer Program Admins can open every published Surah website and its Course materials across Learn, Teach and Admin without a paid-month subscription. Global Admins have the same access across all Programs. Other Program Admins remain scoped to their own Programs, and student paid-month checks and private-draft/publication gates remain enforced. No schema, coordinator or live data changes.

# V107.107 — Tafseer website cards and Admin card table

Show the approved Tafseer cards on the Academy home page and every dashboard, with Foundations first and public after publication. Other public/unentitled cards open their editable Contact Admin popup; eligible dashboards use the V107.105 access links.

Admin → Programs → Public card now has timetable settings on the left and a matching Surah website cards table on the right. Add cards, edit text, upload optional images, arrange/show cards and edit each contact message, then save the complete table once. Timetable edits save independently. Published-only image delivery, scoped Admin writes and live paid-month website/media checks remain enforced. No migration, reseeding or real content publication.

# V107.102 — Save lesson plan requirements together

Stage changes to Plans required on the Admin Lesson plans page, then apply the whole selection with **Save changes**. **Discard** restores the saved checkboxes. Unsaved selections survive refresh within the same signed-in browser session, with navigation protection. Save is one scoped atomic operation: a conflict or invalid entry prevents the whole selection from being saved. Preserve manual Submit plan, private drafts, existing documents and Teach access controls. No database migration or coordinator update is required. [Verification](docs/ACADEMY-PLAN-SAVE-ALL-107102.md).

# V107.101 — Manual lesson plans

Admin Lesson plans opens a compact alphabetical table of active Programs and Courses, with a Plans required checkbox and Open plans shown only when required. Open plans retains the teacher-by-week grid with submitted documents and neutral empty cells. Turning plans off hides planning throughout Teach and blocks direct planner access while preserving saved work.

Save draft stays private. The manual **Submit plan** button shares the selected version with Admin; later drafts remain private until submitted again. Remove automatic status/deadline calculations, reminder queues, session overrides, extensions and feedback workflow. Retain creation, saved history, PDF/image sharing and viewing. No database migration or private coordinator update is required. [Implementation and verification](docs/ACADEMY-MANUAL-LESSON-PLANS-107101.md).

# V107.99 — Course websites

- Add a desktop Website builder under Admin → Course websites, with a scoped list of existing course websites and course templates.
- Edit the eleven existing Al Kahf lessons as native components, or author another course directly. Support Arabic, ayahs/translations, quotations, lists, word study, reflections, images, source notes and takeaways, plus arranged course PDF/image downloads.
- Keep drafts private until explicit publication. Preserve exact revision/retry checks, scoped Admin authority, immutable accepted versions, current withdrawal and same-course file membership. Course switching cancels queued work for the prior course; portable copies preserve text when saving fails.
- Use the existing student login, combined session cards, live-only header joining, recording playback, Teacher note PDFs and assessment tools. Downloads remain in Course materials, with no print controls. Existing Kahf links use the edited website after its first explicit publication; its original PDF publication gate remains in force.
- Upgrade only the two additive course website tables in each split store, then deploy the matching private coordinator, Development API and Academy website. Preserve V107.97 and all existing data, accepted heads and hosted course publications.

## V107.98 — Shared header, Menu and Imtehaan cards

Rebuild the shared header to the supplied reference, highlighting only the username. Use the white Menu/hamburger design throughout navigation and keep Close in a separate position. Admin Coming up next shows four compact cards in a 2×2 grid. Dashboard Imtehaan uses two-column cards for published exams and assignments, excluding draft, complete, cancelled and archived registers. Assignment opening/due windows restore Reboot's missing Imtehaan. Global Admin's Admin-Learn and Admin-Teach timetables group each day's lessons into one Program/Course card with full information-dialog details. Preserve current permissions, joining and draft safeguards. [Implementation and verification](docs/ACADEMY-HEADER-MENU-IMTEHAAN-10798.md).

# V107.97 — Dashboard and mobile reading refinements

Compact Admin headers and workspace navigation; right-side dashboard and Program Contents menus; management and upcoming-session card grids; small Quick tools and Notes icons; two-day timetables focused on today; complete assessment cards on phones; and course-scoped Library selection. Remove duplicate review buttons, plan-review status labels and redundant helper text. Preserve V107.96 course features, current access/publication gates and unsaved-work safeguards. No schema, hosted data or private coordinator changes.

# V107.96 — Live course joining and recording controls

Add Join now beside the course title on phones and in the desktop course header, only while the scheduled lesson is live and a join reference is available. A local clock updates the header and session cards at the existing early-join, start and end boundaries without polling the course feed. Joining still requires the existing fresh API permission/window check. Use uniform highlighted recording controls, dates without visible years, and no time on finished sessions, including older media in the course timezone. Reuse the app header Refresh through the shared content-refresh hook. Preserve account cleanup, publication gates and download placement. No migration, live data/settings change or private coordinator deployment.

# V107.95 — Surah Al Kahf course refinements

Use one card per session for dates, times, joining, recordings and notes, with two columns on phones. Remove the home page schedule strip and its two repeated heading rows. Add a small BOOTCAMP label beneath the course name and make Contents text larger with compact rows and 44px touch targets. Local checks verify that joining and recording actions remain attached to the correct session when older media is loaded. Existing account, course permissions, publication gates and Course materials downloads remain in place. The user confirmed live recordings and PDF downloads worked before this release and explicitly requested deployment. No schema, live data or private coordinator changes.

# V107.93 — Mobile Learn and Teach

Release the phone-tested Learn/Teach layout to Development, incorporating deployed V107.89. Use one reading column on phones, a compact Contents menu and wider layouts built on the same content. Include compact headers, the Admin badge, standard X Close controls, the clearer Refresh arrow, contained date fields and the four planner icon actions. Preserve saved drafts, permissions and all V107.89 account, PDF reader and Surah Kahf features.

Build the matching Development API and Academy website without schema, data or coordinator changes. Sample preview sign-in routes and accounts remain isolated from Development. Verified with all 134 backend regression files, 38 checks each in Chrome/WebKit, and PDF, Library and PIN-switching browser checks.

# V107.92 — Clearer Refresh icon

Use an open circular arrow with a distinct arrowhead for the shared Refresh control, following the supplied example. Keep existing accessible labels, touch targets and refresh behaviour. Update only the isolated sample preview, preserving saved test data.

# V107.91 — Sample Admin preview

Add Open Admin to the isolated mobile preview, using the existing sample Global Admin account and opening Admin-Teach so the badge is immediately visible. Learn, Teach and Admin switches remain available. Preserve existing preview data and credentials; Development/live services are unchanged.

# V107.90 — Compact headers and Admin badge

The phone Learn/Teach header uses less space with inline dates and compact action icons. Replace the extra Admin context banner with an account badge that retains Curriculum access and the read-only Learn description. Standardise Close as a 44px top-right X on phone and desktop, retaining existing draft safeguards. Deploy only the isolated sample preview; existing preview drafts and live Academy services are preserved.

# V107.89 — Compact mobile planner controls

Correct iPhone date-field overflow and oversized planner action rows in the isolated Learn/Teach preview. Preserve native date pickers, full accessible names, clear short captions, 44px tap targets, saved drafts and all existing actions. Chrome and WebKit responsive checks pass. No Development/live, storage, schema or account changes.

# V107.88 — Mobile Learn/Teach preview

Deploy the V107.84-based mobile feature to a dedicated synthetic preview. Provide Learn and Teach sample sign-in links, isolated D1/R2 storage, a same-origin API and a noindex landing page. No live Academy service or data changes.
# V107.89 — Surah Al Kahf course website

Surah Al Kahf opens a complete mobile-first course website from the Learn dashboard, using the existing Academy login. Eleven web lessons include selectable Arabic and English text, word studies, journaling, browser-local reflections and progress. Published recordings, session notes, course PDFs and assessments use the current protected Academy readers and permissions. PDF download and print stay available separately. Teacher editing and Admin tools retain their existing destinations.

Incorporates deployed V107.88, preserving its PDF toolbar, Library display and remembered-ID changes. Mobile checks pass at 320/390/430 px and in landscape; local access, revocation, account-switch and file-delivery tests pass. No schema, live material upload or private coordinator change. The user authorised deployment after confirming V107.88 was live. [Implementation and verification](docs/ACADEMY-SURAH-KAHF-COMPANION.md).

# V107.88 — PDF reader header, zoom and colour menus

Keep the Academy identity/date and Home/Refresh/account actions in the top banner. Put PDF Split, Full screen and Close on the lower account/workspace banner. Native PDF zoom shows AUTO and ACTUAL on a white field. Favourite colours stay inside the Border/ink dropdown; Fill offers the same saved palette and custom colour picker. Border and fill selections remain independent.

Preserve the V107.87 Library row correction, editable annotations, bookmarks, swipe scrolling, per-PDF controls, fullscreen recovery and existing permissions. No database or coordinator change. [Implementation and verification](docs/ACADEMY-PDF-TOOLBAR-10788.md).

# V107.87 — Library subject display correction

Prevent the PDF reader Public Library grid from shrinking subject rows below their contents. Preserve complete labels, expanded books and bookmarks, and scroll the list within its existing drawer. Based on V107.86; mobile-first development remains separate. No schema, data or coordinator changes.

# V107.86 — Remember IDs by default

Remember my ID on this browser starts selected for Academy Login, personal-link login/PIN setup and Switch account, including Use another ID and subsequent sign-ins. Users can still untick it; an unchecked ID is not retained. Remove and Forget all continue to clear remembered IDs. Every account switch still requires fresh server PIN verification.

The user requested deployment to Development after verification. No database or coordinator change. [Implementation and verification](docs/ACADEMY-ACCOUNT-SWITCHING-10785.md).

# V107.85 — Remembered IDs and PIN-protected account switching

Login can remember verified IDs on this browser. Choose a remembered ID or enter another from Switch account in the shared header, then authorise with a fresh PIN. Keep the current session on failed or cancelled attempts; end it and clear private account state after success. Reopen all Academy tabs in the new account's authorised workspace and block switching during unfinished work. Sign-out retains the optional ID list; Remove and Forget all work locally.

Preserves V107.84. No database migration, coordinator change or new authentication bypass. [Implementation and verification](docs/ACADEMY-ACCOUNT-SWITCHING-10785.md).

# V107.84 — Reduce permission and timetable/calendar reads

Repeated coordinator reads reuse a server-verified permission proof only while live account/session validity, database version and timed grants still match. Writes retain full authority verification and atomic guards. Accepted timetable/calendar queries capture only the requested publication components from both stores, preserving owner merging, live visibility and published behaviour.

Local verification passed all 130 backend regression files and 66 final targeted checks, including real Workers RPC. Synthetic D1 benchmarks returned identical results with fewer reads. The user authorised coordinator, Development API and matching website deployment; no database migration or republishing is required. Keep live checks small to limit database usage. [Implementation and verification](docs/ACADEMY-PERMISSION-TIMETABLE-READS.md).

# V107.83 — Reuse identical lesson PDFs

Identical PDFs now share one stored file across separate lesson attachments and Teacher dated/recurring note versions. Attachment names, audiences, permissions and immutable history remain independent. File contents are streamed and verified even when the bytes are already stored. The same 16 MB limit and protected download checks apply; existing files remain readable. No additional D1 lookup is added for reuse.

Incorporates V107.82 planner and Admin dashboard changes. No database migration, private coordinator update or live file backfill is required. Timetable cards are unchanged, following the user's confirmation that this is no longer an issue. Keep live checks small to limit database usage. [Implementation and verification](docs/ACADEMY-SHARED-LESSON-PDFS.md).

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

# V107.76 — Planning controls and PDF file sharing

Use one top action row with Save draft, Submit, Reload and PDF download/share icons. Load a saved plan by its week, then choose another Week starting date to save it as a new plan while protecting the original and existing target plans. Remove the marked teacher-screen information and overview input, retaining stored content. Remove the submission timestamp from exported A4 PDFs.

PDF sharing sends only the actual PDF file after a fresh Share confirmation. Unsupported file sharing downloads the PDF with attachment guidance; cancellation does not trigger a download. Preserve V107.75 sign-in improvements and V107.74 assessment permissions. The user authorised this deployment; no database migration, live correction or private coordinator change is required.

[Implementation and verification](docs/ACADEMY-PLANNING-10776.md).

# V107.75 — A smoother sign-in handover

Replace the public home-page flash with a neutral loading screen during sign-in and session restoration. Use verified D1 session contexts to choose Admin, Teach or Learn before fetching its timetable, avoid the discarded personal timetable on Admin entry, and remove duplicate initial/overlapping session restoration. Keep explicit Visit website addresses and existing deep links. Errors expose the existing retry or sign-out controls, and reduced-motion settings are respected.

Includes V107.74 Imtihaan workflows and examiner permissions. The user authorised deployment on 26 October 2026. No database migration or private coordinator change is required; current server permission checks remain intact. Keep live checks small to limit database usage.

[Implementation and verification notes](docs/ACADEMY-SIGN-IN-10775.md).

# V107.74 — Imtihaan workflow and examiner access

Use the Imtihaan Register, its assessment table and Edit reports as the three assessment screens. Save table edits together, validate schedules and current PDF approvals, and publish eligible approved papers partially. Enter marks before moderation, generate and review private reports, then release marks for the whole Imtihaan, with reports together or later. Global Admin can explicitly override missing marks and unconfirmed receipts with an audited reason; missing marks stay Pending.

Only the assigned examiner and scoped Admins can open paper PDFs, attach papers, view and confirm submissions or enter marks. Other teachers see details and status. Released paper replacements require confirmation and retain existing answers. Learners retain PDF.js printing, guided answer upload, receipts and private results. Assignment due dates use 13:00 in the Academy timezone; schedule PDF sharing and downloads are corrected.

The user authorised deployment after V107.73. No migration, live data correction, notification send or private coordinator change is required. [Implementation and verification notes](docs/ACADEMY-IMTIHAAN-10774.md).

# V107.73 — Header recovery and daily Admin timetable cards

Automatically retry failed/unavailable Hijri date lookups after one minute while visible, preserve any valid current-day date during refresh failures, stop repeat requests after recovery and reject responses from the previous day. The public date route remains independent of D1.

Group each Program or Course into one card per day in Admin. Open the card to choose a class/lesson, retaining current permission and publication checks and the existing joining window. Bind an open choice to its original lesson across background grid refreshes. Global Admin sees all areas; scoped Admin sees only authorised areas. Personal and individual Program timetable views retain their existing grouping.

The user authorised this deployment on 26 October 2026. No database migration or coordinator change is required. Local header, permissions, role dashboards, five distinct lesson joins and desktop/phone checks passed; release verification remains small.

[Implementation and verification notes](docs/ACADEMY-HEADER-DASHBOARD-LOCAL.md).

# V107.72 — Fewer repeated configuration and assessment reads

Cache fixed published time-zone settings by deployment/publication and read current readiness directly from Core. Prepare a shared private assessment-definition snapshot at publication, reuse it for learner lists/details, and limit current assessment facts to the learner's IDs. Preserve current access, revocation, release, timing and personal result checks, with safe database fallbacks. Avoid transferring irrelevant Admin settings when Core combines write counters.

Includes deployed V107.71 assessment tables and learner submission tools. No migration, live data correction or binding change. The user authorised deployment on 26 October 2026; matching website, API and private coordinator must be released together. Keep live checks small to limit database usage.

[Implementation and verification notes](docs/academy-separation/READ-OPTIMISATION-FOLLOWUP-LOCAL.md).

# V107.71 — Assessment rows, learner support and submission review

Edit assessment details and control checkboxes inline and save an Imtihaan batch once. Publish the currently approved papers without waiting for the remaining papers. Replace released PDFs before student availability, with fresh approval. Confirm external marks moderation before revealing Enter marks, then release marks once for the Imtihaan, leaving blanks pending.

Group Teach/Admin-Teach assessments across authorised classes. Add expandable submission progress with access/submission timestamps, elapsed time, PDF review and receipt confirmation. Learners get cached tables with background refresh, Open PDF with native Print, scanning help, local answer preview and confirmed submission receipts. Hide View results until personal results are released. No schema migration or live record correction.

[Implementation and verification notes](docs/ACADEMY-ASSESSMENT-TABLE-107.71.md).

# V107.70 — PDF reader and Public Library controls

Edit is a labelled button beside Zoom. Switching Edit off opens the normal multi-page PDF.js reading view, including a preview of unsaved annotations; returning to Edit preserves editable marks and follows the reading page. Downloads remain explicit, and closing/replacing a PDF still checks for unsaved work.

Document actions follow each PDF title. Download is the last action; saved-book bookmarks use a disk icon. Split Page is global, Whiteboard belongs to each PDF, and each pane can be closed independently. Redundant pane tabs and Focus controls are removed. Favourite ink colours are visible in the editing toolbar, and Zoom matches the Page field height. Native duplicate controls no longer appear transiently.

The reader’s Public Library lists alphabetical subjects with expandable alphabetical titles and account bookmarks above them. Manage Library removes learner navigation and remembers readable public catalogue titles across refresh failures, always preferring an assigned Academy title. Shared Share artwork uses connected nodes, including embedded profile/register controls. LIB-05 is already completed in V107.69 and is not reimplemented. No database migration or live record correction is required.

Validation: all 115 regression files pass (four local-runtime checks were rerun with local-server permission). Synthetic browser checks cover desktop and phone finger scrolling after Edit is off, preserved/visible unsaved annotations, editable PDF downloads, bookmarks, independent pane closing, whiteboard, and Library title-cache recovery at 1440px, 390px and 320px. Website and API dry-run builds pass. Development website and matching API deployment authorised on 26 October 2026.

# V107.69 — Scoped browser messaging

- Add the dashboard inbox, class/session and multi-area sending, recipient review, drafts and scheduling.
- Save separate opened/acknowledged receipts, personal archives, immutable issued content, linked corrections and authorised audit reports.
- Keep operational messages and resumable delivery in Core; add the reviewed messaging schema without changing existing learning records.
- Preserve the swipeable timetable, V107.68 recordings and V107.67 read optimisations. Keep FMA, PWA/push, email and event automation deferred.

# V107.68 — Session MP4 recordings

Manual MP4 uploads attach recordings to existing sessions, using the same session permissions and publication flow. Play uploaded MP4s and YouTube videos in the app. Stop MP4 playback fourteen days after upload, show Recording expired, and omit expired-only sessions from the learner media rail while preserving session records and other links.

Use native R2 expiry only for the recording prefix. Includes a store-specific attachment schema upgrade preserving existing assets, references, indexes and triggers. Automatic Zoom imports remain deferred. Retains the deployed V107.67 read optimisations.

[Implementation and verification notes](docs/session-video-local-preview.md).

# V107.67 — Fewer database reads and batched assessment setup

Reuse private, permission-aware snapshots for dashboard timetables, assessment summaries, calendars and sign-in permission data. Refresh them when relevant published data, enrolments or permissions change, while retaining current session, account and access checks. Materialize repeated JSON table projections once per query. Calculate teacher workload only when Admin opens teacher availability.

Stage assessment schedule edits locally, save the full batch together, and validate and publish the complete Imtihaan against current data. Preserve V107.66 manual marks and grouped paper publication. Includes the additive Core snapshot counter upgrade; existing learning records remain intact.

[Implementation and verification notes](docs/academy-separation/READ-OPTIMISATION-LOCAL.md). Keep live release checks small to limit database usage.

# V107.66 — Manual marks and one paper publication

Add Enter marks to each Teacher and Admin assessment row. Open a popup with students grouped by class and sorted alphabetically, save numeric marks without an answer upload, and keep saved or corrected marks private until Admin uses Release marks. Retain scoped permissions, zero marks, exact retries, conflict checks and report results.

Use Review paper to open and approve each paper individually. Approval no longer starts setup publication. Enable Publish papers once all remaining papers in the Imtihaan are approved, then publish the complete selection through one confirmation before releasing it. Preserve V107.65 dashboard timetable links. No migration or live data correction is required.

[Release and verification notes](docs/ACADEMY-MANUAL-MARKS-107.66.md).

# V107.65 — Dashboard Imtihaan timetables

Add Assessments directly below For your attention on Learn, Teach and Admin dashboards. Group current and upcoming Imtihaan into links to their existing timetable, using each workspace’s authorised data. Learners see released schedules; staff can also see assigned draft schedules. Cache timetable summaries immediately and refresh them in the background. Exclude past, completed, cancelled and archived Imtihaan and assignments.

Admin Coming up next shows Courses only; active Program/Course management tiles, assessments and review queues keep their existing scope. Rename Review plans to Review Lesson Plans. No migration or live data correction.

# V107.63 — Shared assessment rows for All classes

Show a shared assessment once in an All classes Imtihaan timetable, with All classes and one set of paper, moderation and assessment actions. Use the original shared selection from creation events or receipts; keep independent matching assessments and differing paper definitions separate. Preserve per-class submissions and results behind the existing class picker, and summarise differing result stages without duplicating identical paper rows. Shared list identities are returned only when the complete group is within current Admin access. No migrations or live data corrections.

# V107.62 — Admin paper moderation

Allow Global Admins and scoped Program Admins to upload and moderate the same assessment PDF, including shared papers across their authorised classes. Expose Approve paper in the attachment and Moderation views for that account. Keep paper moderation permission separate from marking moderation, require current Admin workspace access and exact PDF review evidence, preserve explicit confirmation and audit history, and keep student paper release separate. Program Admin authority stays within assigned Programs/Courses; Teacher permissions remain as before. No migrations or live data corrections.

# V107.61 — One Imtihaan table and paper moderation links

Open an All classes Imtihaan as one assessment table headed with the Imtihaan name and All classes. Keep each class assessment and its actions, add a Class column, and order the combined entries by date, subject and class. Keep single-class and learner/teacher timetable views scoped as before.

Make the Admin Paper status badge open that exact assessment in Moderation and focus its paper controls. Retain the pencil icon for the attachment popup and recheck current access before opening. Confirm paper approval explicitly after reviewing the attachment; cancelling keeps it unapproved, and student paper release remains separate. Includes the validation-first release controls, contextual All classes publish label and disabled Publishing button. No migrations or live data corrections.

# V107.60 — Validate schedules before release

Add Validate schedule beside Release schedule in each unreleased Imtihaan Register row, with its validation result directly below. Enable Release only after successful schedule validation for that entry; clear validation when its data refreshes or changes, and recheck current data on the server during release. Apply the same sequence inside the schedule.

For an all-class assessment publication, replace Academy shared setup with the selected Program/Course name followed by All classes. Dim and disable Publish immediately and show Publishing… until completion. Preserve separate paper/results releases, access rules, exact retries and existing assessment data. No migrations or live data corrections.

# V107.59 — Untimed assessment schedule validation

Fix Imtihaan schedule validation so untimed exams and assignments can move from Registered to Scheduled. Use assignment opening and optional due times instead of requiring an exam date, and require a duration only for timed assessments. Show separate validation requirements for names/subjects, dates, timing and total marks. Preserve explicit schedule release, separate paper/result releases, scoped permissions, exact retries and existing assessment data. No migrations or live data corrections.

# V107.58 — Assessment table and paper attachments

Use Due date in assessment timetables and remove the Duration and Total mark columns from the table. Add a paper edit icon beside Paper status that opens the existing scoped attachment, moderation and publication controls in a popup. Keep full assessment access, unsaved-file checks, exact retries, shared-class paper controls and PDF preview. Show Results status only after the assessment is marked Ready for assessment; rows that are not ready remain blank when another row enables the column.

Remove Share image from the Imtihaan Register. Use accessible share and download icons for its existing Draft/Final PDF actions. Preserve V107.57 dashboards, Course timetable card text, permissions, learner work and explicit releases. No migrations or live data corrections.

# V107.56 — Lesson-linked Class Notes

Add Class Notes beside Timetable to reveal note tools inside the existing swipeable lesson cards. Save multiple long-text notes with the author, due date and retained corrections. Default to the next accepted session for the same class, subject/module and Teacher, or select a fixed date. Due lesson reminders open the original note. Students correct their own notes; responsible Teachers and scoped Admin can correct, relink or withdraw with history. Admin-Learn stays read-only.

Keep FMA, messaging, dashboard changes and alerts for later. This release adds three Core operational tables through the additive SPLIT_V1 migration in `backend/migrations/academy-core/0001_class_notes.sql`; it does not rebuild or import existing records.

Validation: all 107 regression files pass. Class Notes has 11 focused domain/split-store checks and six real-browser acceptance groups covering mobile widths, retained swipe position, Arabic/English text, exact retry after a lost response, concurrent-edit review, selected dates, canonical reminders, staff withdrawal and account isolation. The website and Worker builds pass.

# V107.55 — Lesson details on Program timetable cards

Within a Program timetable, show the module or subject as the card heading, followed by the current Teacher names and the lesson time. Keep the Program name in the timetable heading. Inherited Admin rollups show their distinct lesson titles and Teachers together with the lesson count. Preserve individual assigned lessons, joining, attachments and the V107.54 metadata caches. No database changes.

# V107.54 — Cached Home, timetables, announcements and Library

Show saved metadata immediately while checking for updates on Home, personal and Admin timetables, curriculum timetables, announcements, Course lists and Library catalogues. Keep a bounded 30-minute session cache, reuse checks for one minute and combine simultaneous requests. Refresh forces a check. Preserve cached content on temporary failures with a saved-information message. Separate private entries by account, workspace, selected Admin-Learn class and request scope; clear them on account/access changes and invalidate after successful writes/publication. Keep public announcements independent of session restoration. Preserve active editors during background timetable updates.

Use opt-in revision validators before rebuilding authenticated Home/timetable/catalogue projections. Keep fresh session and permission checks and current accepted setup; skip unchanged projection queries. Public timetable snapshots continue using their existing durable/edge cache, and shared public Library metadata stays in its existing coordinator. Do not cache meeting URLs, signed file access, credentials, PDF bytes or editable forms. Joining lessons and opening protected media still rechecks current access. No polling, migrations, reloads or live data corrections.

Validation: all 105 regression files pass. Local browser checks cover immediate cached rendering, conditional updates, account-change races, temporary failures, new Library items and the shared Refresh control, with Home checked at 320/390/768/1440px. Existing Admin editing and learner/Teacher media workflows pass. The physical split-store Home fixture uses 38 SQL queries for a full projection and 10 for an unchanged check; these are local query counts, not measured live row-read savings. Both builds pass. Final hosted verification is limited to two release health requests.

# V107.53 — Individual lessons for assigned students and teachers

Show each assigned lesson separately across Home, Learn, Teach and every Program/Course curriculum timetable, including an Admin’s own student or named teacher lessons. Only inherited Admin teaching access may roll up sessions, with the existing room, learning area, day and Program continuity boundaries. Check real enrolments, dated class membership and named/co-teacher IDs independently of the Admin reader audience. Refresh the daily timetable cache to remove previous grouping. No database migration or live data corrections.

# V107.52 — Compact lesson media and cached background updates

Remove the week/date/offering toolbar and swipe-help text from lesson media. Keep compact rail arrows beside Refresh and browse saved lesson media across dates, with an explicit Load earlier lessons action for longer histories. Retain whole-Course PDFs, equal-sized cards and Admin editing.

Show previously loaded media metadata from a bounded, 30-minute session cache while checking for updates. Separate entries by account, personal/Admin workspace, selected Admin-Learn class, learning area and Course offering. Clear affected entries on access denial and media changes; discard delayed prior-account/workspace responses. Check the current accepted publication and use a server revision to skip unchanged media/schedule/note queries. Opening files, videos and editors still checks current access. No file-byte caching, polling, database migrations or live data corrections.

Validation: all 103 regression files pass. Local browser checks cover 320/390/768/1440px Program and Course rails, delayed cached rendering, conditional updates, older-page retention, scroll position, temporary failures, denied access, account-change races, Admin editing and PDF/video access. Physical split-store checks preserve private versus accepted media and bounded coordinator operations. Both website and Worker builds pass. Hosted verification uses only the two release health endpoints.

# V107.51 — Shared paper and assessment process for selected classes

A multiple-class selection is one shared assessment process. Upload the PDF once; all selected class assessments reference the same immutable file and R2 object. Apply paper details, moderation, schedule publication, readiness, assignment due/close settings, whole-class marks/feedback/script releases and unused-assessment deletion to the complete original selection in one validated transaction. Keep each class's learner view, attempts, submissions, marking, finalisation and selected-learner decisions separate. Add a class-submissions selector and identify the scope of the shared controls.

Use immutable creation-event membership for new assessments and exact V107.50 creation receipts for existing selections; do not group other papers by matching names or registers. Validate all class authority, expected revisions and exact-file evidence. Reject a replacement once any class has released its paper or received answers. Preserve manual finalisation and explicit release; uploads, marks and readiness do not release results. Retries recover the same result without another PDF upload or partial class changes.

Batch independent class statements and bounded roster/status reads at the assessment service. Preserve the private Core/Admin coordinator and owner routing. Include only a new shared assessment's missing parent register in setup publication; unrelated drafts remain private, and every parent area must be in the reviewed selection. No migrations, reloads or live data corrections.

Validation uses disposable local data and blocked external browser traffic. Shared 2-class learner isolation, rollback, stale revision, exact retry, original receipt recovery and scoped authority checks pass. A 50-class physical split-store workflow covers creation, one stored paper, schedule publication, exact-file approval, paper release and readiness within the existing per-coordinator query budget. All 102 regression files, shared and existing assessment browser workflows, mobile/desktop layouts and both builds pass. Hosted verification is limited to release health endpoints.

# V107.50 — Multiple-class assessment selection and Admin lesson media

The Add assessment form accepts individual class checkboxes, Select all and Clear. Validate every selected class against current Admin authority and the Imtihaan's allowed areas/classes, then create the class schedules in one atomic operation with an exact retry receipt. Reuse one bounded class-authority query and the loaded register instead of repeating those reads per class. Retain single-class clients, class-specific paper/submission/marking records, native untimed assignments and future due dates. Creating assessments does not publish schedules, papers or results and does not create learner work or enrolments.

Admin Program/Course media uses the shared rail of equal-sized cards with Edit opening the editor. Put date/teacher details and Save/Close in the compact header. Replace duplicate status/metadata and preview actions with a combined Attachments section containing named videos, YouTube links and PDF filenames, plus Add video and Add PDF. Header Save commits title, summary, video changes, PDF names and staged attachment removals together. Failed or uncertain saves retain the draft and retry identifier; Close guards unsaved edits. PDF uploads remain explicit. Preserve existing R2 bytes, asset identity, Teacher note ownership and Library/PDF tools. New Course session media retains its offering and session references, with no invalid Program-class foreign key.

New-client capability checks prevent a partially updated API from silently accepting only the first class or ignoring attachment edits. Both items queued during V107.49 are completed here. Core/Admin owner routing and the private coordinator remain unchanged. No migrations, database reloads, live corrections or new editable masters are part of this release.

Validation: all 102 regression files pass, including new rollback/retry, revocation, native assignment, PDF-byte preservation and physical split-store cases. Actual mobile/desktop assessment and Program/Course media pages pass at 320, 390, 768 and 1440px; existing media workflows and both builds pass. Tests use disposable local databases and R2. Final hosted verification is limited to release health endpoints.

# V107.49 — Responsive timetables and Admin navigation

Show timetable dates in one horizontal row across Home, personal and Admin workspaces and their Program/Course views. Keep Sunday as the start of every week. On mobile, scroll Home to today or the next date with a lesson; desktop initially shows Sunday. Keep week arrows on the heading row and remove duplicate week labels/ranges. Mobile Quick links fits about three to four compact cards; self-paced opportunities become a continuous rail.

Rename Library views This course, Public library and Bookmarks, with a right-hand mobile menu. Fix the existing My links tab rendering after its availability response. Add an alphabetical, scoped Curriculum chooser with current active areas on mobile; rename the existing Admin tab Subjects. Place Voice Recorder immediately after Library in Reboot Learn/Teach and remove it from Manage Academy. Embedded calendars carry the exact Admin-Learn/Admin-Teach context, class and accepted setup. Add Close to Admin Home across Admin sections and connected management tools, preserving draft guards. Preserve the V107.48 PDF work and Core/Admin ownership. No migrations, live data corrections or new editable masters.

Validation uses disposable local databases/storage and blocked external browser traffic. Passed all 101 backend regression files, 48 Home/workspace browser checks, 16 recorder checks and the new menu/calendar/Admin exit browser checks, including active-area filtering and unsaved Planning protection. Website and Development Worker dry builds pass. Live release verification uses only the website and Worker health endpoints.

Next review batch (requested during this build): allow one assessment to be selected for multiple classes; show Admin lesson media in the same swipeable cards as Learn/Teach, with Edit opening the editor. Apply the supplied editor annotations: compact date/teacher header and header Save action, remove duplicate status/metadata and Video/Discussion actions, and combine video/PDF entries under Attachments with the existing add/remove and file controls.

# V107.48 — Remove native PDF.js editing tools

Academy supplies all annotation editing. Remove the native PDF.js editing row and bridge, and disable its editor modes at viewer initialization so stored preferences cannot turn them back on. Disable the associated comments, signatures and floating editing buttons. Existing PDF annotations still display, and page navigation, zoom, search, print and download remain available. The Academy pencil, in-place text, drawings, shapes and editable exports remain. Open the tools preview in Academy mode with an optional original-document reference. No database/schema or account changes.

Validation: local browser acceptance checks cover disabled native editing despite saved editor preferences, removal of native controls, Academy text edits and shape downloads, bookmarks, unsaved replacement guards, retained annotations when tools are hidden, phones, split PDFs and Whiteboard. No hosted data was used.

# V107.47 — Reader pencil opens Academy editing tools

Replace the pencil's PDF.js editing-row action with the same Academy annotation controller and markup used on the comparison page. Opening editing transfers the current PDF, current page and any existing PDF annotations. Hiding the tools preserves marks and the mounted editor; reopening editing retains them. Book and volume changes continue to guard unsaved work, and downloads save an editable copy. Page navigation continues to update the existing bookmark controls. Preserve desktop/tablet split PDFs, Whiteboard and full screen, with Split and Whiteboard hidden on phones. The separate comparison page remains available. No database/schema, login or role changes.

# V107.46 — Compact publication confirmation and timetable Publish state

Replace the long setup confirmation with Confirm publish, Areas to publish together, and Cancel / Review changes / Publish. Review details are optional; direct Publish prepares the same checked, frozen change and applies it only on the explicit click. Retain current scope/access checks, source/head checks, replay protection and accepted setup routing. Changing the selection invalidates the earlier review. No unpublished changes leaves publication unchanged.

Require a saved, valid unpublished timetable draft before enabling Publish. Share published/read-only status and publication labels across timetable tabs along with the revision, so publishing in one tab disables Publish and removes stale ready labels in the others. A server rejection of a published timetable refreshes its status while retaining local edits. Existing history, scheduled versions, draft copies and manual effective dates remain. No database corrections or schema changes. Preserve the complete V107.45 PDF release.

Verification: 53 focused setup, timetable, workspace and release checks pass. The local confirmation suite covers direct Publish, optional review, cancellation, no changes, changed scope, stale reviews and accepted Admin-Learn reads. The Program suite checks publication in a second tab, saved drafts, published history, editable copies, preview/class guards and phone/tablet/desktop layouts. Functional checks use disposable SQLite/R2 fixtures and block external traffic. Source boundary and matching website/Worker dry-run builds pass.

# V107.45 — PDF controls and annotation comparison

Compact the normal PDF.js reader header, using the existing identity, date and workspace access. Keep full screen exit and Library return reachable. Book actions use icons with hover names; the volume picker follows the title. A pencil reveals the final editing row. The shared page chooser supports both typed page numbers and selection from the page list. The revised Split PDF icon has no stand; Whiteboard retains its easel. Both workspace tools are on the right of the page/zoom row and remain unavailable on phones. Preserve PDF documents, annotations and whiteboard drafts through responsive layout changes.

Keep the alternative drawing/text tools on the separate comparison page. Add compact Preview-style menus, freehand and shape-tidying sketch, shapes with separate fill and border colours, shorter in-place text boxes, PDF text selection and editable favourite colours. Saved annotations remain editable when reopened. Normal PDF.js rendering is retained. No database/schema, account, role or PIN changes.

# V107.44 — Direct Voice Recorder access

Replace the recorder intermediary with direct image-selector links from Home, Admin Home and the verified new Reboot Program. Show Home’s local recorder tool to all signed-in account roles without requiring Student enrolment. Preserve personal Learn/Teach and verified Admin/Administration reader contexts, including Admin-Learn class context, through the recorder address. Saved #recorder links redirect directly. Remove the Academy back link and duplicate selector heading while retaining the shared Academy header/Home action and the recording/preview page-switch controls. The standalone recorder keeps its selector heading. No database, storage, enrolment or learner-work changes; the existing two-minute recording, preview, Share and Download behavior is unchanged.

Verification: 30 focused navigation, workspace, Admin inheritance and release checks pass. Twenty isolated browser checks pass at 390px and 1440px across Student, Teacher, Global/scoped Admin, Reboot Learn/Teach and Admin readers. Saved recorder links, selected-page return, retained unsaved-work guards, unchanged standalone heading and absence of duplicate Admin navigation are checked. Image selection makes no API requests. Source boundary and matching website/Worker dry-run builds pass. All functional checks use disposable local accounts and block external traffic; no real microphone recording or live database access is used. Unfinished PDF header and annotation drafts remain held.

# V107.43 — Course and Program media rails

Use the same horizontal card rail for Course and Program media in learning, teaching and management views. Each rail has equal-sized cards with dates in DDD dd mmm yy format. Course cards show the Course name and chat icon; Program cards show session and Teacher names with chat. Named video/PDF actions open the existing protected player and PDF.js viewer directly. The user-selected video icon is a play triangle in an outlined frame. Chat opens a local Coming soon message. Retain week/date, offering and class selectors, explicit Admin management, Teacher own-note contributions, Course-wide PDFs and all file/access boundaries. Browsing the rail itself adds no API requests. No database or storage changes.

Verification: 22 focused media, access and release checks pass. Local browser suites pass for eight Course/Program rail layouts at 320/390/768/1440px, current separated media/own-note/PDF.js delivery, and compatibility management, draft guards, protected playback, retry and account-change cleanup. Check three-letter month formatting, equal card sizes with many attachments, chat without requests and rail browsing without requests. Source boundary and matching website/Worker dry-run builds pass. Header compaction and unfinished annotation work remain separate from this release.

# V107.42 — Mobile PDF reader controls

Hide Whiteboard, Split Page and their related controls on phone layouts, including touch landscape. Keep a single active PDF with its existing tools, Download, Library and full screen. Preserve tablet/desktop whiteboard and split reading. Changing to phone size closes the whiteboard without discarding its drawing or notes and retains both PDFs and their annotations for the wider layout. No database, storage or API changes.

Verification: 17 focused PDF/release checks pass. Local PDF reader and whiteboard browser suites pass, covering 320px/390px/767px portrait, 844px/932px touch landscape, tablet and desktop. Downloads, editable annotations, bookmarks, split restoration and unsaved drafts remain intact. Source boundary and website/Worker dry-run builds pass. Browser tests block external traffic and use disposable local fixtures.

# V107.41 — One public Home page

Retire the separate signed-out timetable view and its unused menu entry. Legacy visitor timetable addresses return to the complete Home page with its existing public timetable, announcements and other features. Keep the shared signed-in Learn/Teach and Admin timetable component and existing permissions. Navigation reuses the public snapshot and adds no API requests. No database or storage changes.

Local verification: navigation, entrance, workspace boundary, Admin inheritance and release integrity checks pass. All 48 isolated Home browser checks pass across phone, tablet and desktop widths, including saved timetable addresses, cold entry, public joining, and signed-in Student/Teacher/Admin navigation. Website and matching Worker dry-run builds pass. No live D1 or Worker requests were used for these checks. Development deployment authorised by the user.

# V107.40 — PDF.js opening and reader repair

Move the setup script out of the whiteboard divider’s opening tag, restoring the PDF reader and its tools. Course and lesson PDF previews and assessment review use the bundled PDF.js renderer; assessment PDF read actions open a viewer with an explicit Download choice. Announcement attachments and local Academy PDF links open the Academy reader. Keep existing authenticated byte routes, exact workspace checks, publication rules, file identities, public-only bookmarks and explicit assessment confirmation. Preserve reader context in its address and discard delayed public-document loads after selecting another PDF. No database or storage changes. Reported on mobile; desktop occurrence was unconfirmed.

Local verification: all 101 regression files pass. Isolated phone and desktop browser checks render real PDF pages for Course/lesson files, announcement attachments, assessment papers and answer review. Explicit assessment downloads preserve exact bytes; opening never confirms, marks or releases work. The reader checks retain editable annotations, bookmarks, split panes, local device files and whiteboard drawing/notes, including 320px/390px touch layouts. Website and matching Worker dry-run builds pass. Development deployment authorised by the user.

# V107.39 — Announcement loading and retry

Keep the anonymous public announcement GET independent of session restoration, Admin verification and client publication-head startup. The server continues to select the current accepted publication. Show “Loading announcements…” with an accessible busy state for every load and retry; display Try again only after a failed request, validate the list response and discard older refresh replies. Authenticated requests and all other routes retain their workspace guards. The original issue was reported on mobile; desktop occurrence was unconfirmed. No schema, database, storage or layout change.

Verification: all 100 regression test files pass, including the local-listener runtime checks with the required permission. Fourteen isolated browser checks pass, covering visitor and restored Student sessions at 320px, 390px and desktop widths, failed-request retries, complete posters, links and keyboard controls. Website and matching Development Worker builds pass.

# V107.38 — Development Core/Admin cutover

Promote the reviewed feature UI to Development and bind devrebootworker to dev-academy-core and dev-academy-admin through the existing split coordinator. Reconcile original-source sessions and revocations while preserving newer preview credentials, roles and business records. Restore existing Hifz handoff/profile delivery, Open Library/My links and the recovery schedule; keep original Library object identity and buckets. Scheduled cache recovery writes its Core-owned markers without impersonating an Admin and still respects the commit fence. Retain original database and referenced file bytes for recovery; current uploads retain ordinary cleanup within dev-split-v1/. Preview and Development share these new stores after activation.

# V107.37 — Personal navigation from Home and one-row Admin banners

Supersede V107.36: Global and scoped Admin Home offers Personal Learn, Personal Teach and Admin, each clearly labelled. Remove the second navigation row from all Admin, Admin-Learn and Admin-Teach banners; retain the first workspace label/description and existing Home action with draft guards. Personal workspaces retain their separate permissions and actual assignments, including an empty Personal Teach when none are assigned. Feature preview only; no database changes.

# V107.36 — Global Admin navigation

Hide plain Learn and Teach switches for Global Admin on personal Home and connected reader pages. Keep explicitly labelled ADMIN-LEARN and ADMIN-TEACH inside Admin, plus the existing personal exit links. Preserve Program Admin, Teacher and Student navigation, access checks and layouts. Feature preview only; no database changes.

# V107.35 — Correct signed-out and student Admin banners

Verify real current Admin authority before opening Admin workspaces or displaying their banner. Hide the banner during sign-in/verification and immediately on account changes; send ordinary accounts from Admin addresses to personal Academy home. Keep Admin-Learn and Admin-Teach distinct for verified Global/scoped Admins. Make Home an explicit return to the normal Academy homepage, retain existing draft guards, and keep PDF labels consistent. Preview only; no database changes or Development cutover.

# V107.34 — Keep Admin readers separate from personal workspaces

Separate Admin-Learn and Admin-Teach addresses, labels, request contexts and caches from personal Learn and Teach. Inherited class viewing and teaching apply only in the explicit Admin readers, within current Admin scope. Personal contexts retain genuine enrolments/assignments and ordinary public Course access. Persistent banners and reader context labels identify the active view; crossing realms is intentional navigation and retains unsaved-work guards. Preserve existing layouts, manual assessment controls and the fresh preview databases. Deploy only feature-admin and feature_worker; Development stays V107.28.

# V107.33 — Inherited-role label cache

Refresh the Users screen script version so existing browsers receive the V107.32 inherited Teacher labels. Retain the verified Admin teaching and student class-view behavior, layouts and preview isolation. Update website/API release markers together; Development remains V107.28.

# V107.32 — Admin teaching inheritance and student class views

Give Global Admin actual Teacher access to all sessions, and scoped Admin actual Teacher access to all sessions in their assigned Program/Course, without persisted per-session assignments. Retain ordinary examiner, note ownership, current access and Admin-workspace checks. Add a class selector to Admin Learn views and carry that class through timetable, assessments, media and PDF readers. Student class viewing creates no learner records or participant events. Publish only to feature-admin and its split Worker; Development stays at the Phase 4 checkpoint.

# V107.31 — Phase 5 Admin feature preview

Promote Phase 5 into `feature-admin` and deploy the matching default `feature_worker` against the prepared fresh Core/Admin databases. Keep current Development on the verified Phase 4 V107.28 release and original database. Retain current preview data, encrypted bindings, layouts, direct manual assessment controls, shared-service write holds and protected object storage. No database reload, new migration or Development database cutover.

## V107.29 — Fresh database preparation; activation held

Prepare verified active/unarchived copies in fresh dev-academy-core and dev-academy-admin on feature-split-db. Preserve current authority, disable policies, required accepted references, original retry outcomes and exact file metadata while excluding retired import/discussion/attendance workflows. Verify hosted table hashes and source preservation; keep private recovery outside Git/assets. This checkpoint does not activate new owners or publish a split preview. Owner write routing, cross-store recovery and hosted workflow checks remain before Phase 5 completion; merge/current Development cutover also waits for the user's Phase 4 review.

## V107.28 — Development UI checkpoint and database handover notes

Enable accepted setup, native attendance, assessment controls, media separation and private My links on the Development website and matching Worker after verified preview. Record exact source/deployment/recovery evidence at the Phase 4 checkpoint. Add a table/view carry-over register that distinguishes active use, live legacy dependencies, retained history and default exclusions. Phase 5 is authorised only after Phase 4 completion, on isolated feature-split-db; its merge into feature-admin waits for the user’s review. The user specified fresh dev-academy-admin and dev-academy-core with active/unarchived records only; current Development routing and Phase 5 merge wait for Phase 4 review. No physical split is performed by this release.

## V107.27 — Phase 4 media and Library separation

- Teacher own-note contribution uses verified authorship and immutable file versions, without general media editing or changing parent publication. Admin retains curation and current suppression.
- Metadata and original file bytes share the same current audience. Course-wide files and old deliveries remain available under current entitlement; attendance membership grants no material access.
- My links stays private to its owner in the existing R2 home, including retained access after role loss. Retire media discussions while preserving their records. Keep existing reader, calendar and mobile layouts.
- Shared migration 0035 is separately approval-gated. Complete preview verification and the required Development checkpoint before any Phase 5 database work.

## V107.26 — Phase 3 learning operations

- Native sparse attendance starts with new recorded days, retains legacy records, seals dated rosters and supports reviewed Course delivery rosters and exact substitute windows.
- Timed/untimed assessments and future assignments have separate opening/due/closure controls. Late work remains open as agreed; Ready is manual with the unchecked Admin warning.
- Direct Admin upload, marking, finalisation and explicit category/learner release preserve actual actors, previous answers and already released results. Reports show achieved marks only and bind reviewed output/source references.
- Existing layouts remain. Shared migrations 0033/0034 are separately approval-gated; the physical database split remains after Phase 4 and the Development checkpoint.

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

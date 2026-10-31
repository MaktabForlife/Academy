# Offline Academy workspace GUI rebuild

This branch prepares a compact, intuitive Learn / Teach / Admin interface for local review. It is an isolated GUI project; the released Academy and ongoing Studio migration continue independently.

## Workspace and baseline

- Branch: `feature/academy-workspaces-ui`.
- Checkout: project `work/Academy-workspaces-ui/`.
- Starting commit: `67000f231305ca52f8ef0ea89d16f00c0f2dfa91` (released V108.7 code plus the completed Tafseer/Kahf handover receipt).
- Runtime baseline: Academy `b65d2b8b8fde229dc09008c080dc0e7eeee76886`, as recorded in `outputs/academy-studio-handover-20261031/release-verification.json` at the project root.
- The existing Circles homepage/course/editorial work remains in its original checkout. Held Kahf `890d994` and the MOU migration are not included as new GUI scope.

The first local styling pass is complete. Native screens and controls are retained; a shared theme and compact programme navigation are layered over the released source. The isolated review harness runs the actual native runtime with disposable sample records.

## Confirmed design direction

The interface should be intuitive, elegant and compact. Preserve the current content and functions; do not add new content or capabilities without asking first.

**Desktop Learn / Teach:** aim for one screen per programme. Keep programme and class context visible. Arrange routine programme work within that workspace; reveal details in place through compact panels, tabs or drawers as appropriate. This is a design target to test against the existing functions, not permission to remove them or flatten their access boundaries. Dense detail can open in a bounded panel while the programme workspace remains available.

**Mobile:** Learn and routine Teach remain mobile-first. Admin is reviewed screen by screen. Record whether a screen supports full mobile use, a useful limited set of mobile actions, or desktop-only work. Make these decisions with the owner as the screens develop. Do not assume every desktop control must appear on a phone. Some teaching operations may also require desktop treatment when necessary.

## Offline review approach

Use clearly fictional sample records, local assets and local view-state for the first screen prototypes. Keep the prototype's data adapter separate from the native service adapters. The review harness must not sign in to the real app, make production API/database calls, submit messages, publish lessons, change permissions or fetch private media. Prototype saves remain explicitly local.

Use the current native screens and source as the content/function inventory. The earlier Circles `academy-workspaces.html` demo may inform visual direction, but its illustrative content and workflows are not evidence of current native functionality. Do not copy its invented records into the Academy or treat every demo feature as approved scope.

Validate navigation, screen density, readable text, keyboard/focus behaviour and narrow layouts in the local prototype. Use synthetic native fixtures for any later adapter checks. Full functional integration and publication require a separately reviewed connection to the current Academy/Studio baseline; an offline screen cannot establish real permissions or server-side gates.

## Boundaries to preserve

- Current master identity, login, account switching, scoped staff roles, programme/class allocation, assessment and publication gates.
- Tafseer and migrated Course website access in Studio, with no short-Course website delivery rebuilt in Academy Learn/Teach.
- Separate MOU monthly-access and published-timetable work; existing MOU PDFs/recordings remain in Academy under that project's current plan.
- Current native header/dashboard/Library/PDF return behaviour and the per-offering ownership state; no blanket authority switch.
- Existing data, source files, drafts, rights and media references. Do not seed or reset real records for visual review.

## Review order

Start by inventorying one retained programme's current Learn and Teach functions, then build a shared desktop programme shell using those functions. Review its phone adaptation and navigation before extending the pattern. Review Admin task groups and mobile limitations alongside each screen rather than imposing a global desktop-only rule.

Keep a per-screen review record of the existing functions, proposed layout, mobile support, unresolved decisions and later adapter dependency. Record questions as they arise; routine layout choices may progress without repeated approval. This setup does not authorise deployment, live integration changes, hosted operations or Git push.


## First review checkpoint — 31 October 2026

Implemented locally on this branch; no deployment, push, production login, hosted request or live data change.

### What changed

- Shared Circles styling in `css/m4l-workspace-theme.css`, loaded by 23 native entry pages. Local DM Sans and Libre Caslon Display fonts; warm cream, muted plum, sage, rose and restrained borders.
- Compact header: a single identity/account/workspace row on large desktops, two rows at smaller desktop widths, and the existing accessible mobile header/history controls.
- Programme tools stay visible above the active panel on desktop at 70rem and above. The original Menu drawer remains on compact screens. Resizing an open drawer to desktop returns the original tools and focuses the selected tab.
- One bounded programme reading/work area on desktop. Notes, attendance, planning, assessments and lesson media keep their original routes, controls, class context and draft/save/review flows.
- Attendance registers and day summary sit side by side on desktop. Media cards are shorter on desktop, with their own file scrolling. The planner's Revert label no longer squeezes into a 44px column.
- Learn/Teach programme launchers and personal timetable exclude standalone Course delivery. Tafseer cards remain out of Learn/Teach. Admin retains Course management and compatibility routes; this is a UI boundary, not a change to permissions or ownership.
- No lesson text, real records, access policy, server adapter, migration, publication or live joining logic was changed.

### Screen coverage

| Screens | Local review | Mobile treatment / review note |
| --- | --- | --- |
| Learn / Teach programme timetable | Desktop and 390px; 7-day desktop rail and phone day rail | Full routine use; native date and Join gates retained |
| Programme Menu and Class Notes | Native drawer, desktop tabs, class chooser, saved sample note, correction/history/withdraw actions | Drawer retains focus and Escape behaviour; no role controls added |
| Learner assessment / teacher assessment shell | Native register and disabled/unavailable states | Full routine viewing; wide registers scroll within their card |
| Attendance | Real synthetic registers and unknown-before-submission summary | Routine phone controls retained; desktop summary moved beside registers |
| Planning | Teacher editor and Admin teacher-by-week review board | Editor fits 320/390px; weekly matrix remains a contained horizontal table |
| Lesson media | Learner empty state and teacher session-card rail | Existing media/edit access retained; external playback unavailable offline |
| Dashboard | Learn, Teach and Admin shells | Compact cards; programme context and scoped native tools retained |
| Users | Existing user details table; native section tabs retained | Contained table scrolling, 44px phone controls; bulk matrix work needs owner review |
| Curriculum / subjects / modules | Shared catalogue and programme curriculum | Tables scroll inside their sheet |
| Programme administration | List, details, classes, curriculum, participants, timetable, review/publish, media and enrolment shells | Existing controls retained; dense timetable authoring and publication review are desktop candidates |
| Course administration | Native list and unified management shell | Kept under Admin; not inserted into Learn/Teach |
| Enrolment | Request inbox and catalogue | Phone filters and contained table; access/payment meaning unchanged |
| Announcements | Existing editor and file fields | Two-column editor on desktop, stacked phone layout |
| Library | Native Library and management shell; isolated Open Library editor | Phone reading/search retained; bulk resource editing remains a review candidate |
| Calendar | Existing monthly calendar and native details | Fits phone width |
| PDF defaults | Native controls and preview | Fits phone width; report/PDF canvas authoring not redesigned |
| Settings / messages | Native settings form and shared dialog styling | Existing actions and states preserved |
| Memorisation | Shared theme on main Academy/management components | Fixture has no complete memorisation dataset; detailed tracker workflows require a suitable offline fixture before claiming full acceptance |

No mobile action was disabled in this pass. The suggested desktop candidates above are review notes, not implemented restrictions. The external HifzHelper app and website lesson readers are outside this GUI pass.

### Validation

- 27 checks passed across `academy-workspace-client.test.mjs`, `academy-course-dashboard.test.mjs` and `academy-entrance-ui.test.mjs`. They cover account/workspace isolation, delayed-response guards, native roles, class context, joins, timetable grouping, draft guards and website-course separation. Updated the historical Course-card expectations to the owner's current programme-only Learn/Teach direction.
- JavaScript syntax checks and `git diff --check` passed.
- Browser review at 1440px desktop, 390px phone and 320px planner width. Checked programme Menu open/close, route focus, resizing an open drawer to persistent desktop tools, saved note/class context, and contained Admin table scrolling. User, assessment, calendar, enrolment, PDF defaults and programme/planner screens did not overflow the phone document.
- Large desktop header measured 82px; phone header measured about 216px. Preview screenshots are at the project `outputs/academy-workspaces-ui-20261031/` folder.
- No claim of real integration or production acceptance is made from the synthetic preview. PDF upload/rendering, external video playback, live joining, actual publications and complete memorisation data remain separate integration checks.

### Local review

Run `node backend/tools/academy-workspace-ui-preview.mjs` using Node 24 with its built-in SQLite support, then open `http://127.0.0.1:9031/`.

The root opens the released Circles public website homepage. Log in opens the local sample-account chooser; choosing an account enters the shared dashboard. The sample-account bar also offers direct entry for review. These are synthetic accounts; preview edits and saves affect only memory and are reset when the server restarts. Each role change clears storage on this preview origin only. Other app ports and browser accounts are untouched.

The server binds only to loopback, uses a same-origin CSP, rejects foreign hosts/origins, blocks external navigation/fetch and live Join endpoints, stubs external date lookup and serves only the necessary local UI assets. Open Library uses an additional disposable native coordinator fixture. No real credentials, database snapshots or copied private media are present.

### Integration handoff / next owner review

Hold this branch for the owner's visual review. Do not merge or deploy it as part of the active Circles migration. Review the shared theme and native UI diffs against the then-current released Academy before connecting. Preserve the separate MOU monthly-access/timetable project, frozen website assets and Studio ownership boundaries. In particular, do not use this GUI branch to move MOU media, link recordings, change enrolment/access or re-run a migration.

Owner review can settle programme density, which bulk Admin tasks should have limited phone actions, and the desktop treatment of timetable/report design. No new teaching content or new feature is proposed in this checkpoint.


## Circles home correction — 31 October 2026

The owner requested the current Circles dashboard as the home for Learn, Teach and Admin. The local role homes now follow the released V108.7 `public/shared/circles-dashboard-view.mjs` and `public/circles-login.css` presentation: Your Academy heading, full-width attention/Imtehaan panel, then paired Coming up next, Messages, programme continuation, timetable, calendar and Quick tools panels. Programme launchers are compact rows with Open links. All roles use the same home structure; native role and class scoping stays authoritative.

The existing native timetable and calendar remain functional inside their Circles panels instead of introducing a second API/auth integration. Programme actions and Home return keep their original role routes. The existing Menu drawer is available on desktop as well as phone, and Admin management remains available through its retained links. Website Tafseer cards no longer extend these role home pages; Course websites management remains available under Admin.

The upcoming panel includes authorised programmes as well as Courses under Admin and shows three programme/day entries in time order. The Imtehaan section excludes expired date windows, matching the current Circles upcoming section. No roles, content, publications, database adapters or access ownership changed.

The preview root now opens Learn directly. Its slim sample-account bar switches to each role home; it replaces the invented role-choice landing page. This is only disposable preview navigation, not a replacement sign-in or permission mechanism. Embedded calendars do not repeat the preview banner.

Validation: all 27 existing workspace/entrance/dashboard checks pass, including updated upcoming scope and expired exam expectations. Browser checks cover Learn and Teach programme entry and Home return, Admin Menu → App settings → Home, next-week timetable refresh, desktop two-column layout at 1440px, and single-column layout at 390/320px with no document overflow. The phone heading now occupies its own row above the action buttons. Existing integration limits above still apply. Keep this checkpoint local for owner review; no deploy, push, migration change or live data check.


## Single-hub navigation clarification — 31 October 2026

This supersedes the earlier role-home checkpoint. The owner clarified that login opens one Circles hub for everyone. Programme Learn, programme Teach and programme Admin are destinations beneath that hub. Global Admin enters Admin-Learn, Admin-Teach or Management from the hub.

- The home route is `#dashboard`: `/academy/#dashboard` for personal accounts and `/academy/admin/#dashboard` within the retained verified Admin realm. These use the same hub UI and neutral “Your Academy dashboard” heading. The separate Admin path preserves existing authority checks; it is not a second Learn/Teach home.
- A member's programme cards show the applicable Learn, Teach and Admin entry links together. Navigation metadata comes from the existing verified account/session response, detached in memory and hidden immediately when its owning account changes. A projected summary audience cannot invent personal roles or hide an actual teaching programme.
- Global Admin has three hub gateways: Admin-Learn and Admin-Teach each open the existing programme chooser; Management opens the retained native management space. Programme Admin has scoped programme entries. All destination APIs retain their native permissions, class, read-only and publication checks.
- Home, brand, programme-change and management-close links return to the hub. Older role-home/Hifz URLs lead there. The role-home buttons are replaced visually with one Dashboard link; existing compatibility hooks remain. Admin-Learn and Admin-Teach show their selected context beneath the account name.
- The hub keeps the existing scoped summary/timetable/calendar readers. A teacher's verified default reader can supply its summary without a separate home address. No new combined cross-audience summary API, Studio identity bridge or role grant is introduced. A future combined Learn/Teach summary contract remains integration work for the migration owner.
- The approved, account-bound external Circles return connector is unchanged. When connected, preserve that real Circles hub as Home rather than publishing an additional competing hub. The local native fallback is for this isolated UI review; do not deploy these frontend changes independently of the existing integration.
- Sample-account links are now labelled Student account, Teacher account and Global Admin account so they cannot be mistaken for production role switches. All use disposable fixture accounts and enter the hub.

Validation: 40 checks pass across the workspace, login, dashboard, entrance, shell and remembered-account suites. Added coverage for mixed real programme roles, scoped programme administration, the shared Home address, account-change rejection of old hub context and the existing HifzHelper handoff. Browser checks covered Student → programme Learn → Home; Teacher → programme Teach → Home; Global Admin → Admin-Learn → class selector → Home; Global Admin → Admin-Teach → native teaching tools → Home; Management → Home; desktop at 1440px and single-column 390/320px with no document overflow. All work remains local, with no deploy, push, live sign-in, migration or MOU data/media change.


## Public homepage correction — 31 October 2026

The owner clarified that the preview must start at the Circles website homepage, rather than the old native Academy public overview or an automatically signed-in dashboard. The root now renders the exact released public Circles entry and its approved single-circle composition from the frozen V108.7 prepared assets. That separately owned bundle is read-only. Set `WORKSPACE_UI_CIRCLES_ROOT` to an equivalent prepared public directory if its local checkout moves; the default is the sibling `AcademyStudio-handover-1087/local-content/release-1087/public` directory.

Only the local preview server adapts that entry: the Studio authentication module is replaced with an explicitly labelled sample-account chooser. Choosing Student, Teacher or Global Admin enters the existing synthetic shared hub. Signing out or opening the native entrance without a sample session returns to the public Circles website. Signed-in Home links remain dashboard links. No native production homepage, login authority, Studio connector, rights or migration adapter changed.

The server allowlists the homepage scripts, styles and public images. Lesson JSON/PDF payloads and the real Studio login module are excluded. No third-party requests are enabled; the remote font import is removed in the served response, and existing local DM Sans/Arabic fonts are supplied. The serif uses its existing offline fallback. Remote prospectus flyer images, external links and standalone website readers remain outside this offline workspace review; they are not evidence of live Studio integration.

Validation: the three preview adapter checks cover the public-only file boundary, symlink/traversal exclusion, explicit replacement of Studio authentication, signed-out returns, and preservation of signed-in dashboard/public reader routes. Browser verification confirms root → public Circles homepage → Log in → sample account → shared dashboard → Sign out → public Circles homepage. Desktop proof is saved in the parent outputs folder. No deploy, push, hosted sign-in or production API/database request.


## Owner-operated homepage editing — 31 October 2026

The owner requested direct text editing and moving elements. The public local preview now includes a fixed Homepage editor toolbar: Edit text, Move blocks, Save locally, Export edits, Reset edits and Done. Text editing preserves the existing surrounding typography and inline emphasis; pasted values remain plain text. Static homepage copy is editable, including the central circle and programme blocks. Rotating catalogue/tracker card data, flyer artwork, navigation destinations, roles and teaching material are excluded.

Move blocks supports the circle and all five surrounding programme blocks on desktop. Pointer dragging accounts for the scaled composition, and arrow keys move a focused block by one pixel (Shift: ten). The approved full and compact desktop layouts remain separate profiles, with draft offsets added to the original positions. Phone presentation remains untouched.

Edits autosave to the local preview origin's `academy-workspace-homepage-v1` browser key. The synthetic account selector preserves only this homepage draft while clearing account/session storage; draft copy is never authority or enrolment data. Export edits downloads `umm-abbad-homepage-edits.json`, with original/revised text, draft offsets, viewport and the base layout identifier for later review. This does not update any source teaching text or publish the homepage. Reset edits restores the supplied text and layout.

Browser validation covered an actual copy edit, refresh persistence, pointer drag (24px right / 16px down), persisted offsets after refresh, Teacher sample login, sign-out and preservation of both draft changes. The test changes were reset and the delivered tab is left in Move blocks mode. Proof: `outputs/academy-workspaces-ui-20261031/circles-public-home-editor.png` in the parent project. The three preview boundary/entry/return checks and JavaScript syntax/diff checks pass. All changes remain offline on this feature branch.


## Header, combined worship card and usable navigation — 31 October 2026

The owner requested the identity byline directly below the logo/title, centred Log in, and one combined Tafseer/MOU block. The local review overlay now moves the existing narrow-screen byline above the login row. Log in is centred: 160px on desktop and up to 390px in a narrower window. The combined sage card reads “Worship with understanding”, typed Arabic `التفسير والتدبر`, “MOU”, and “Bringing knowledge into practice.” The separate Classrooms/MOU card is removed from this homepage. Tafseer and MOU retain independent links and visitor-access choices; their access/ownership has not been combined.

The owner reported that navigation was blocked. The cause was the editor consuming every click in the website while an editing mode was enabled. Only a text field or a completed pointer drag now consumes its click; ordinary menus and links work and leave editing mode automatically. A five-pixel drag threshold separates a click from dragging. Homepage drafts are not applied to other rendered views. Original text keys are restored before moving existing header nodes, and the new combined card uses its own scoped text keys. Existing owner text edits and positions remain intact. The approved compact/full arrangement is reapplied to the replacement card before draft offsets.

Browser checks: the header at 640px places the byline at y104 above the centred login (centre x320), with no document overflow. Desktop login is centred in its row. Edit text → website menu → Your learning home → Teacher sample login → hub → programme Teach → Sign out all work. A MOU link clicked while Move blocks was active opens its own visitor-access dialog. A real 24px/16px drag remained editable without navigation and was reversed to its prior position. The supplied owner draft was not reset. Screenshots in the parent output folder: homepage-header-combined-640.png and homepage-combined-worship-desktop.png. All three preview adapter checks, JavaScript syntax checks and diff checks pass. This remains local; no deploy, production content, role, Studio recording or migration change.


## Dragging linked cards and images — 31 October 2026

The owner reported that Move blocks moved the circle but not the surrounding cards. Reproduced on the Academia anchor: a 24px/16px pointer drag left the offsets at zero. Native browser link/image dragging was cancelling the pointer stream. Move mode now temporarily disables HTML dragging on each block and its descendant links/images, prevents native `dragstart`, and applies the browser's no-native-drag CSS. Original draggable attributes are restored when leaving Move mode.

Browser validation used actual pointer drags on Academia text, the Hifz image, the Arabic Adventures image and the combined card's Arabic link. Each moved by 24px/16px without navigation, then was dragged back to its prior position. A regular MOU click still opened its visitor-access dialog and restored native draggable attributes. No owner draft reset, copy/style change, permission change or deployment. Syntax and diff checks pass; the local screenshot is in the parent outputs folder as homepage-all-blocks-draggable.png.


## Owner reference arrangement — 31 October 2026, 18:42

The owner supplied Screenshot 2026-10-31 at 18.42.23.png and asked to edit the blocks and arrangement. This now supersedes the prior local card positions/copy: a round plum circle in the centre; Hifz to the upper left; a muted mauve worship/Tafseer/MOU block to the upper right, partially behind the circle; terracotta Academia to the lower right; Arabic Adventures to the lower left. The website's cream background is retained. The reference's dotted editing-canvas background is not added as website decoration.

The copy follows the reference. Hifz uses typed `معهد أروى لتحفيظ القرآن`, with its HIFZ ACADEMY label above and lifetime commitment beneath. Worship has English/Arabic Tafseer & Tadabbur (`التفسير والتدبر`) and Mothers of the Ummah (`أمهات الأمة`) rows with independent visitor-access links, followed by the italic practice line. Academia puts the three existing programmes before “Learn with depth and purpose.” The circle uses the reference's three-line heading and centred two-line italic tagline. No new teaching programme or content was invented.

The desktop composition uses one 1246px coordinate frame and scales as a whole. The circle is 535px square, and all four cards overlap it at the reference positions. The same arrangement is used in full and compact desktop windows; browser drag offsets remain additional per-profile edits. The existing mobile flow uses the same revised copy and colours. Moving a programme card remains native-drag-safe.

Layout identifier: `20261031-reference-184223`. Before dropping old positional offsets, the preview keeps the previous browser draft at `academy-workspace-homepage-v1-before-20261031-reference-184223`. Other homepage text edits remain in the primary draft, while the newly requested block copy has separate scoped keys. Both current and backup homepage draft keys survive the synthetic account switch. The original released asset bundle remains read-only.

Validation: three preview adapter checks and JavaScript/diff checks pass. Browser review at 1440px, 1024px and 390px shows no document overflow; the circle measures 535×535px at full size and 413.9165×413.9165px at 1024px. A 24px/16px drag in the scaled desktop window moved the card by exactly those rendered distances and was reversed. New bilingual copy remains editable; the Mothers link opens its own visitor-access dialog. The local draft was saved. Proof: parent outputs/academy-workspaces-ui-20261031/homepage-reference-184223-desktop.png and homepage-reference-1024.png. No deploy, push, live API/auth, migration, ownership or teaching-material change.


## Verified V109 continuation and actual circle hub — 31 October 2026

This supersedes the earlier identification of the native Academy grid as the Circles dashboard. The owner's 19:06 screenshot is the existing signed-in ROOT homepage transformation, confirmed by Circles migration in parent `notes/CIRCLES-V109-UI-BASE-2026-10-31.md`. It is already built. Its released circle, programme cards, account controls, mode selection and panels are reused without rebuilding or copying their markup.

The owner held UI work until V109 deployed. The saved final receipt confirms DEPLOYED_AND_VERIFIED at maktab4life.org, with Source runtime `18ed9708`, Target runtime `e14e5b9` and 161 frozen reviewed assets. The old UI branch/checkpoint `193943a6` is intact. New local branch `feature/academy-workspaces-ui-109` in sibling `Academy-workspaces-ui-109` carries the prior draft onto verified Source `60ca4db4`. Rebase conflicts retained the V109 history/integration files and current frontend version links. No backend runtime, migration, binding, version marker or real account-bound return connector differs from that Source baseline.

The preview at port 9031 now reads the immutable prepared Target `AcademyStudio-launch-109/local-content/release-109/public`. The real `circles-login.mjs`, block navigation, dashboard view, purchased-course row, account-history and header-date modules run locally. Only the served API fetch and one-use continuation boundaries are replaced by explicitly local adapters. All five local preview checks cover exact allowlists, private lesson/editor exclusion, native role separation, denied cross-programme/Admin navigation, unavailable tools and retained generation guards. The prior 40 native workspace checks also pass.

The transport authenticates disposable native fixture tokens with the existing native account reader, uses its unprojected authority for navigation, and calls the existing native dashboard summary/choice functions. Current native readers continue to protect destination pages. Student opens Learn; Teacher opens Teach; Global Admin's programme chooser offers Admin-Learn, Admin-Teach and scoped management. The released Admin dashboard's existing continuation opens Management. No extra production API mode or authority grant was added. Known fixture mappings cover the two synthetic native programmes and Mothers; the absence of other sample programmes is not a change to real membership.

Sample login returns to the root circle. Native Home/close returns there too. A loopback-only HttpOnly display-preference cookie keeps the signed-in composition across refresh after the prototype normalises its URL; the cookie grants no authority and contains no identity or credential. Sign-out clears the sample session and restores the public draft. Public artwork/editor changes remain separate from the signed-in circle. Owner draft and backup storage keys survive sample-account selection. The real PIN form is disabled, credential exchange is unavailable, and unsupported Studio/content links show an explicit offline notice.

No live sign-in, hosted request, deployment, content publication, access/media change or Git push was performed. The V109 branded router, direct server transport, 43200/43200/60 checks and exact production return connector remain unchanged. The prepared Target assets are read-only and no preview adapter/editor is a deployment asset. Free cards remain intentionally inactive. The local Hijri fallback is intentionally unavailable rather than invented; actual production date recovery is untouched. Reconcile any later reviewed UI overlay with the then-current runtime before seeking a separate release approval.

Browser verification: public Log in opens the sample chooser, then the existing signed-in circle. Student enters programme Learn; Teacher enters Teach. Global Admin enters Admin-Learn with its read-only class selector, Admin-Teach with its retained tools, and native Management; Home returns to the root circle. Reload preserves that signed-in view. Visit website restores the public editor/draft without losing the sample session; its account controls still work. Sign-out restores the public draft. Unsupported Tafseer opens the offline notice. At 1440px the settled circle is 560px square; at 1024px it remains square with no document overflow. Screenshot: parent outputs/academy-workspaces-ui-20261031/v109-existing-circle-dashboard.png. The sample catalogue lacks Hifz/Arabic Intensive assignments, so no fictitious cards or roles were added to match the screenshot's broader account.

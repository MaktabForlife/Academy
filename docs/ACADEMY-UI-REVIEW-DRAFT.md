# Academy UI review — release scope, 13 October 2026

The user authorised building and deploying all reviewed changes on 13 October 2026. The held local draft is included in V106.43; deployment verification is recorded in the release notes.

## Navigation and Hifz

- Website, Learn and Teach drawers use compact plain lists with names only, without Program/Course labels or boxes.
- The public Hifz page opens from the main website menu only and keeps the heading **Surahs and Duas**. It uses the shared banners and a compact page heading. Existing `#hifdh` and `#progress` bookmarks still work.
- Learn and Teach link directly to the external HifzHelper app for the signed-in account, subject to existing Hifz assignments and Global Admin inheritance. Neither menu opens the internal Hifz Program page or public tracker.
- Learner Program pages no longer contain a shortcut to the public tracker. Protected class progress and tracker management remain separate.
- Home and Refresh icons have visible captions. Admin remains highlighted throughout central management pages.
- The banner is the only ordinary Refresh control. It uses each active page's existing refresh action, preserving its cache invalidation, current selection and edit safeguards. Retry and conflict-recovery controls remain available. The distinct admin action is labelled **Update public timetable**.
- Both legacy shortcut rows stay hidden on the logged-in home page at mobile and desktop sizes.

## Management pages

- Main Admin headings follow **Manage X**: Manage Users, Manage Programs, Manage Courses, Manage Assessments, Manage Library, Manage Subjects & Modules, Manage Attendance and Manage Surahs and Duas. The central page is Manage Academy.
- Redundant Academy administration headings, links beside the Subjects and Modules heading, and the Program introduction/Ready message are removed.
- Manage Courses also omits the old administration return line and extra Refresh Courses button; the banner provides navigation and page refresh.
- Courses starts with **Select a course** and does not choose a default. Explicit Course links still open the requested delivery. Filtering clears a selection that is no longer visible; unsaved edits require confirmation first. Cancelling keeps the edits and previous filter. Refreshing an empty view does not select a Course, and late responses cannot restore a selection cleared by filtering.
- The Admin Attendance pill opens its own Coming soon page. Teaching registers remain available through teaching routes.
- User profiles uses compact table rows, labelled Reset PIN buttons, and adjacent Add user/Save all buttons. The extra Refresh button is hidden; the shared banner provides page refresh. PIN reset confirmations and account protections are retained.
- Assessments omits its duplicate internal heading and Refresh control. On mobile its pills form one swipeable row with Help at the right. Shared Refresh retains the active assessment workspace and uses the existing unsaved-change confirmation.

- Manage Programs has one **Program List / Timetable / People** navigation row, retains the selected Program and existing unsaved-change warnings, and omits duplicate inner tabs and back links.
- Manage Courses uses one **List of courses / Details / Sessions / Participants / Media / Review & publish** tab row. Returning to the list keeps the current draft, and selecting another Course asks before discarding it.
- Manage Users separates **User Details / Programs / Courses**, keeping the name column, search, filters, unsaved entries and shared Save all controls.

## Verification

- 124 browser checks passed across phone, tablet and desktop layouts using isolated synthetic accounts and data, including one Refresh control per page, preserved unsaved profile edits after refreshing records, and Course empty-selection/filter behavior.
- Public preview, saved-progress privacy, profile editing, PIN reset confirmations, catalogue and Library editor checks passed.
- The earlier 143-file regression run passed 142 files, then an assertion expecting the old Academy administration heading was updated and that file passed on rerun. The latest 9 Course UI tests pass, including explicit selection, filtering, unsaved-edit confirmation, scheduling links and retained publication workflows.
- The added banner-refresh tests verify active-page selection, busy/disabled guards, connected pages, assessment refresh and the full-page reload fallback. Affected Library, Attendance, profile, catalogue, Program management and memorisation tests were rerun after consolidation.
- Local browser evidence: `artifacts/academy-local-review/mobile/acceptance.json` and screenshots in that directory.
- No live records, permissions, migrations or deployment settings were changed.

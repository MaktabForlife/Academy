# Dashboard and mobile refinements — V107.97

The user authorised deploying the accumulated refinements after confirming V107.96 was deployed. This release incorporates `168a4698`, preserving Surah Al Kahf live joining, recordings, course access and account cleanup.

## Behaviour

- Admin identity uses a yellow name/Admin pill. Phones place Back and Forward around the compact workspace row; wider screens keep them in the header. Home retains its existing position. Navigation follows actual browser history and existing unfinished-work safeguards.
- Admin Dashboard has a right-side Menu in place of the workspace sidebar. Remove duplicate review buttons, routine explanations and plan-review status labels. Keep the submitted-plan and absent-register filters, nine management destinations and Visit website.
- Management cards use three columns, an Open icon and one highest role, labelled Admin for administrators. Quick tools use small labelled icons. Coming up next uses two phone columns and three wider columns without timezone captions.
- Program Contents opens next to its title in a right-side dialog with an X, Escape/backdrop dismissal, keyboard focus handling and the same authorised destinations. Course website destinations remain available.
- Personal and Program timetables show two swipeable days, focus today initially and offer Today recovery alongside the weekly arrows. Empty days remain cards; today says No lessons today. Manual browsing and saved memorisation return positions are retained.
- Remove + Note; the remaining Notes icon opens the existing Class Notes dialog, including Add Class Note and its correction/history/draft protections.
- On phones each assessment becomes a complete card, one per row. Desktop tables and all assessment permissions, release gates and actions remain intact.
- Course/Program Library links carry the selected activity. This course intersects that selection with current authorised learning-area references and metadata assignments. General Library entry retains all assigned resources. No default Public Library, Source control or warning-text changes are included following the user's cancellation of that earlier request.

## Verification

All checks use disposable local SQLite/R2 fixtures and synthetic accounts; browser runs block external traffic.

- Chrome and WebKit: 108 checks each, 320–1440 px, 200% text, menu focus/dismissal, navigation/draft guards, today recovery, two-day rails, card layouts and existing reading/planning tools. No page errors.
- Dashboard runtime/browser regression: 16 checks, including actual submitted plans without badges, absent-register filtering, course destinations, cached refresh and account/workspace boundaries. No page errors.
- Class Notes browser regression: six checks covering posting, uncertain-response retry, correction/history, draft cancellation, reminder/conflict review, staff withdrawal and sign-out cleanup.
- Targeted shell, workspace, navigation, Library, course dashboard and page-action tests: 41 passing. Additional course companion, reader-session, Open Library access and isolated-preview checks: 15 passing.
- Academy source boundary check: 150 modules, no Google backend clients, source tree clean.
- Development API dry-run and website asset build pass. Website output contains 785 files, targets the existing Development API, and sets synthetic-only mode to false. Active version markers agree on 107.97.

## Deployment scope

Deploy the matching Development API and Academy website through the existing workflow. No schema migration, database correction, hosted material upload, timetable publication, settings/binding change or private coordinator deployment is required. Hosted verification is limited to release metadata, essential static assets and one API readiness request.

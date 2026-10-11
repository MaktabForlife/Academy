# V106.19 — Academy Attendance integration

Prepared on the released V106.18 baseline. The owner authorised deployment of the Attendance integration on 11 October 2026 to `feature/105.3.4.13` and the existing Academy development website and service. No schema migration or live database correction is required. The owner confirmed there is no attendance history to verify and will verify the real roster after deployment.

## Website integration

The public `/programs/attendance` and `/programs/attendance.html` page now loads the retained editor and its styles. Tests run against that public page rather than a separate editor fixture. Program pills select the teaching scope; each relevant class has its own column, lesson selector (including All lessons), submit button and learner list. Present remains the initial selection for an unsubmitted learner, while the saved attendance remains Unknown until submission. Existing differing lesson marks remain Mixed in All lessons until explicitly changed.

The existing D1 attendance service remains authoritative for rosters, assigned classes and lessons, teacher/administrator permissions, breaks and cancellations, separate class registers for shared lessons, register completion, day summaries, immutable correction history and transactional saves. No attendance or reporting rules changed. Earlier dates correct existing submissions; this release does not create missing historical registers.

Teachers have Academy home, Back to Program and My account navigation. Administrators retain the shared four-tab Program management header, Home icon and selected-Program return. Changing an Attendance Program pill updates the address, management header, tab destinations, return link and Academy activity highlight. The management header reuses its validated current-session Program list when switching scopes; session changes and restored pages revalidate it. Requests for an unavailable Program display an access message instead of silently opening another Program. Student-only Programs are excluded from the Attendance selector.

Class columns scroll within the page on narrow screens. Lesson selectors fit their columns, learner names wrap, and attendance selectors have touch-sized controls. Library remains Coming soon.

## Submission and recovery

An uncertain save keeps its exact operation ID, base register IDs, date and exceptions in browser session storage. Its storage key is bound to the authenticated session and Program. Editing, date changes and Program switches are locked while confirmation is pending. Reloading restores the pending date and Retry resends the same operation; D1 returns the original receipt when the write already completed. Failure to preserve retry details stops the save before any request is sent.

Unsubmitted changes warn before changing Program/date, refreshing or leaving the page. Refresh explicitly discards those changes. Rejected or outdated forms require a successful refresh before another new submission; failed reads keep saving disabled and their error remains visible. A draft for another class retains its original register revision when a different class is saved, so a refresh cannot silently move the base underneath that draft. A selected lesson removed by a newer publication resets to All lessons on refresh.

Sign-out, account replacement and restored pages clear the editor and start a fresh scoped load. Delayed reads or save responses from the prior session cannot restore its roster or pending submission.

## Verification

- All **139/139 local regression files** pass. The added D1 integration test exercises the actual public page with shared class registers, one/all lesson submission, active class membership, Unknown/completion behavior, lost acknowledgement and receipt replay, competing forms, imported-roster historical correction, and Student/Teacher/Program Admin/Global Admin scopes.
- Expanded editor tests cover mixed marks, navigation, unsaved changes, previous dates, exact retries across reload, session isolation, stale revisions, storage/read failures, replaced lessons and delayed responses after sign-out. Shared navigation tests cover changed Program destinations and activity highlighting without an extra account lookup.
- Synthetic Chrome checks pass at desktop and mobile widths for the actual page and local D1 interface: one/all lessons, separate shared-class registers, completion, interrupted save/reload/retry, conflicting edits and refresh, historical correction, administrator scoping, student denial, unavailable Program selection and selected-Program navigation. No browser script errors were observed.
- The development Worker dry-run build, JavaScript syntax, release-version consistency and diff checks pass. No live account or database record was used for browser testing or changed by this work.

## Remaining acceptance and policy work

The owner will verify real class memberships and teacher assignments after deployment. There is no real attendance history to verify; no history migration or backfill is required for this release. Historical correction tests use synthetic records to retain regression coverage.

Attendance percentages, date-range/term reports, learner/class reports and exports remain outstanding. The reporting treatment of Excused and the Academy timezone policy remain unresolved. The existing all-excused day result and Johannesburg attendance date boundary are unchanged and the date boundary is explained on the screen.

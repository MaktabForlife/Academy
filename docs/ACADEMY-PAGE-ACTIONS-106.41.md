# V106.41 — Page controls and Admin teaching access

The central Admin heading includes a Teach button. It opens the teaching Program/Course chooser for the current account, including Global Admin's inherited access and only the assigned areas for scoped admins.

A shared visible action group provides Home, Refresh and the page's existing Sign out button on signed-in Academy views, connected tools and account pages. Connected tools move Sign out out of the collapsed mobile website menu. Authentication and revocation handlers are reused, preserving D1 and Sheets behaviour and standalone recorder isolation. Sign out remains available for a stored account when connected navigation cannot load. Visitors retain Home and Refresh on public connected pages, with Sign out hidden.

Refresh reloads the current address, retaining Program/Course selection and the active tab, and clears the daily Academy timetable snapshot so the new page can request current data. Existing browser unsaved-change warnings and Academy Home route guards remain in place. Controls have text labels and 44-pixel touch targets and fit on narrow phones.

No database migration or live-data correction is required. Deploy only the development website and devrebootworker through feature/105.3.4.13.

Validation: 159 real Chrome browser checks passed against the actual frontend/Worker and an isolated synthetic database. Coverage includes Global Admin and scoped Admin teaching access; visible controls across Academy views, connected tools and personal account pages at 320, 390, 768 and 1440 pixels; retained addresses on Refresh; a fresh Academy timetable request; Home navigation; connected and personal-account sign-out; and cancellation of unsaved User profile edits on both Home and Refresh. All 143 backend regression files passed. The matching development Worker dry-run build passed at 1715.16 KiB / 346.89 KiB gzip. Diff whitespace and active version markers were checked.

Publication follows the feature-branch push, followed by live file hashes, version/health and public phone/tablet/desktop verification. Protected acceptance uses synthetic accounts and data.

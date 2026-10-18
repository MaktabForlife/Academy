# V107.3 — Academy header layout

The shared top banner groups the existing brand and dates at the left and page
actions at the right. There is no Zoom control. The second banner keeps the signed-in
profile and the existing authorised LEARN/TEACH/ADMIN navigation. On phones, branding
and dates sit above the right-aligned page controls so they fit without overlap.

The same Home, Refresh, Login and Sign out elements are moved, retaining their
listeners and permissions. Refresh continues to use each tool's existing draft
guards. Connected pages use the same shared layout; embedded tools keep their
parent header without adding another. Existing date availability is unchanged.

Publication targets `MaktabForlife/Academy:development`, its existing Pages project
and `devrebootworker`. The Worker changes only its reported release version. No
schema migration or live profile, credential, journal or Hifz change is required.

Validation: all 75 backend test files passed across the full run and the two release
marker rechecks. Both the Development Worker dry run and the 723-asset Pages build
passed. Browser checks covered signed-in and visitor headers, desktop and 390/320px
phone widths without horizontal overflow, and Home/Refresh on the enrolment page.
The top banner contains the controls; the profile banner contains no duplicate
controls. All verification uses synthetic accounts or unauthenticated static/health
reads; real users' PINs are not used.

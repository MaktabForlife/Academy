# V107.100 — Compact course reading

The user authorised deployment on 27 October 2026, following review of the feature-branch implementation.

The shared account row keeps the profile and action icons on one line. Remove the original Al Kahf page's full-width phone action override and duplicate badge rules. Admin authority is a plain label, and Curriculum stays in the normal Admin tools menu.

Both course readers use smaller lesson headings, less header spacing and a shared Full screen reading control. This page-level view works on iPhone without requesting browser fullscreen: app headers, course sidebars and bottom navigation hide, while Menu, text sizing and a sticky Exit control remain. Reading position is preserved. Escape, leaving lessons, sign-out and account changes restore the app headers; an open dialog receives Escape first. Course content, reflection storage and permission checks are unchanged.

Validation uses disposable functional fixtures for reading-mode entry/exit, account cleanup, dynamic lesson rendering and existing course/session/PDF behaviour, plus the shared navigation and release-integrity suites. Browser visual review remains pending under the local-browser policy. Hosted checks are limited to matching static assets/versions and one API readiness response.

Deploy the existing Development API and Academy Pages targets with their current bindings and secrets. No migration, private coordinator deployment or live content publication is required.

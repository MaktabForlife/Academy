# V106.94 — Shared account header across Academy

Every standalone Academy entry point loads the shared brand and account headers. Enroll now was missing the account-controls script and stylesheet; the PDF reader and the two older Program Library information pages now load the complete shell too. The old Teaching address redirects to the shared Academic Calendar and also carries the shell for its fallback content.

The second header provides Home, Refresh, Login or Sign out, account name and role, and the workspaces authorised by the account session. Global Admin sees LEARN, TEACH and ADMIN; other accounts retain their existing scoped access. Visitors retain Home, Refresh and Login. Enroll now selects LEARN.

PDF reader controls sit below the shared headers. The PDF workspace fills the remaining viewport; split panes, phone tabs, focus and the Library return control remain available. Embedded PDF viewers and calendars rely on the parent screen's header rather than duplicating it inside a tool.

Coverage checks discover all standalone HTML entry points so new pages cannot omit the shared assets. Browser verification covers all routes on phone, tablet and desktop, visitor/member/staff roles, navigation controls, persistent headers and PDF layout. No schema migration, live data correction or new infrastructure is required.

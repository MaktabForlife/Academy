# V106.17 — Independent HifzHelper access

Hifz Program learners and staff can select **HifzHelper ↗** in their Learn or Teach row. The link opens `https://maktab.hifz-helper.app/<UNIQUEID>` in a new tab, leaving Academy open. HifzHelper retains its own PIN sign-in, permissions, journals, Worker and database. The user has paused the shared-login and data integration pilot.

The button uses the stable Hifz Program ID and existing Academy roles, including inherited Global Admin access. Teaching-directory status alone does not grant Hifz access. The destination uses the verified login/session response, rather than an entered or remembered ID; it disappears on sign-out or session replacement. Only an alphanumeric UNIQUEID is included in the path. No PIN, bearer token or other Academy credential is sent to HifzHelper. Existing Academy requests supply the information; no Hifz probe, additional account lookup or background refresh is introduced.

The journals' appearance and functioning are unchanged. User and role edits, PIN resets, sign-out and attendance remain independent in the two applications. HifzHelper's own server continues to enforce access.

## Release checks

- Academy entrance tests cover Student, Teacher, Program Admin and inherited Global Admin access; unrelated Programs/Courses; missing assignments; personal destinations; invalid/missing IDs; sign-out; and existing-cache reuse without Hifz requests.
- Academy login tests cover verified identity reuse, sign-out, token removal/replacement, rejected account mismatch and temporary session-validation failure.
- All 138 local regression test files pass, including shared navigation and unified workspace checks. The development Worker dry-run build, JavaScript syntax, version consistency and diff checks pass.
- No live Hifz PIN, journal request or database change was used for this button release. Browser visual testing was not performed.
- Active release markers and updated asset cache arguments use V106.17. The Worker change only synchronises its health version; no backend behaviour, configuration or database migration is changed.

The owner explicitly authorised pushing this release to the existing feature branch on 11 October 2026. The broader integration remains paused.

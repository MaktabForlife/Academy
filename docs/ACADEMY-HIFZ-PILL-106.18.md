# V106.18 — HifzHelper shortcut in the Hifz pill

The Academy's top activity strip now includes **HifzHelper ↗** inside the Hifz pill. The Hifz title and role still open its Academy page; the separate shortcut opens the signed-in user's `https://maktab.hifz-helper.app/<UNIQUEID>` in a new tab. The same shortcut appears in the homepage's Hifz activity pill. The existing Learn/Teach button remains available.

Both entry points share the existing verified identity and Hifz role checks. Students, Teachers, Program Admins and inherited Global Admins can see the shortcut. Teaching-directory membership alone does not grant Hifz access. Missing or invalid IDs, unrelated Programs, and signed-out accounts receive no personal shortcut. No background requests or extra database reads are introduced; HifzHelper continues to handle its own PIN and permissions. The integration pilot remains paused.

## Release checks

- All 138 local regression test files pass. Added cases cover both pill locations, preserved Academy navigation, separate sibling links, current identity, inherited access, invalid IDs, absent assignments, sign-out and cache reuse without extra requests.
- JavaScript syntax, release-marker consistency and diff checks pass.
- The development Worker dry-run build passes. Its only source change is the health version; no backend behaviour, configuration or database migration changes.
- Updated entrance script and stylesheet cache arguments use V106.18. Existing release notes are preserved.
- Browser visual testing was not performed. No live Hifz PIN, journal or database request was used for this change.

The owner authorised pushing this update to the existing feature branch on 11 October 2026.

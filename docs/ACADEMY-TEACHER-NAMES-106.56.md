# V106.56 — Current teacher names on timetable summary cards

## Cause and fix

Published Program rules and Course sessions retain the teacher name captured at publication. Profile edits updated the account correctly, but timetable summary details continued using those saved labels.

The Academy display now resolves referenced teacher account IDs to their current profile names. D1 reads only account ID, display name and active state for referenced teachers, with one indexed query for an authenticated timetable load. Anonymous marketing responses perform no teacher-profile lookup and retain their existing redaction.

Program summary cards, Program lesson details, Course details and the older account timetable use the same current labels. Multiple-teacher order is preserved, identifiers are case-insensitive, and missing profiles retain the published label. Inactive referenced teachers retain their identity label without gaining any authority or new lesson assignments.

Published snapshots, publication hashes, teacher assignments, timings, class references, join keys, attendance and planner history remain unchanged. Renaming a teacher does not require republishing.

## Browser caches

V106.56 uses a fresh daily timetable cache key, replacing previously cached old labels. Successful profile edits issue a browser-local label revision; reopening Academy or navigating to an uncached activity cannot restore a timetable stored under an older revision. An already open summary can be refreshed using the shared Refresh control. Changes made in another device are read on Refresh.

## Verification and release

- 32 affected tests pass: rename through the account API; Program/Course summary and detail labels; compatibility account timetable; unchanged publications and join/access metadata; multiple-teacher order and fallback; anonymous privacy; migration parity; profile authority and browser cache behaviour.
- 6 local Chrome checks pass on synthetic accounts: current summary label, renamed label after Refresh, 390/1440 px dialogs, persisted-cache invalidation after a profile revision and unchanged publication snapshots.
- Worker build, syntax, release version checks and whitespace checks pass.
- Based on Features V106.55. Deployment uses the standing Development release authorisation. No schema upgrade or real account changes are required; the relevant live profile/publication discrepancy was verified with read-only queries.

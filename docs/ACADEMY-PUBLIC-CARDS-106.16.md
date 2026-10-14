# V106.16 — Public timetable card layout

The public homepage preview previously placed time, title/description and the joining label in one flex row. Narrow day columns left the text only a few pixels wide, producing a very tall card with individual letters on separate lines.

Each public Program or Course card now places its title and optional description at full width. Time and joining controls sit together beneath the text, wrapping when necessary. Open joining cards retain a contrasting, readable time inside their white clock badge. No entered card values are derived or replaced; optional bold descriptions remain escaped and supported.

The change preserves the existing shared public snapshot, browser clock updates, server-checked joining, Free/Paid rules and signed-in timetable layouts. It adds no queries, polling, storage or paid Cloudflare features. Worker code changes only synchronize the release version. No schema migration or hosted account/data edit is required. The earlier loading-error proposal is excluded at the owner's request.

## Verification

- All 138 local regression files pass. The first full run passed 137; the remaining login test expected the previous website badge. Updating that release assertion and rerunning the login and version/router tests passed.
- Synthetic headless Chrome uses the actual homepage HTML, script and CSS at widths 1920, 1440, 1024, 768, 390 and 320 pixels. Checks verify full-width text, controls below the text, no card overflow, unchanged explicit card text, bold descriptions, Free/Paid controls and readable open-card time. Steps to My Rabb measures approximately 92 pixels high on desktop and 139 on narrow mobile, instead of a vertical text column. Visual desktop/mobile screenshots were inspected.
- Browser tests use one mocked public snapshot without visitor polling or hosted data requests. Existing UI tests verify local joining transitions and the click-time server check.
- The development Worker dry-run build passes. All active release markers and changed asset cache arguments use V106.16.

The owner authorised pushing the card fix to `feature/105.3.4.13`. Existing unfinished private media, subscriptions and teaching tools remain as recorded in the handoff; this release does not change those workflows.

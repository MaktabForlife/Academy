# V106.25 — Compact Progress Admin settings

The Programs and Courses panel is capped at 720 pixels. Its settings rows use a shared grid with fixed switch and learner-limit columns, so names of different lengths cannot shift the controls. Rows have less vertical padding. On small screens the learner-limit field moves below the name and switch, with its selector aligned to the switch column.

This is a presentation update. Existing inclusion settings and learner limits retain their save, permission and recovery behaviour. No schema migration or live data correction is required. The cancelled module-monitor work is omitted.

The owner authorised build and deployment when ready. Validation passed: affected Academy entrance, router/version and D1 memorisation regressions (14 tests across three files); synthetic Chrome checks at 1920, 1440, 1024, 768, 600, 390 and 320 pixels; alignment and overflow measurements; inclusion and learner-limit saves; the Worker dry-run build; JavaScript syntax and diff checks. Browser screenshots and measurements are retained in the local progress-v10625 artifacts.

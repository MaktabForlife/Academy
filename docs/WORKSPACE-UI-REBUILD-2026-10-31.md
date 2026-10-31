# Offline Academy workspace GUI rebuild

This branch prepares a compact, intuitive Learn / Teach / Admin interface for local review. It is an isolated GUI project; the released Academy and ongoing Studio migration continue independently.

## Workspace and baseline

- Branch: `feature/academy-workspaces-ui`.
- Checkout: project `work/Academy-workspaces-ui/`.
- Starting commit: `67000f231305ca52f8ef0ea89d16f00c0f2dfa91` (released V108.7 code plus the completed Tafseer/Kahf handover receipt).
- Runtime baseline: Academy `b65d2b8b8fde229dc09008c080dc0e7eeee76886`, as recorded in `outputs/academy-studio-handover-20261031/release-verification.json` at the project root.
- The existing Circles homepage/course/editorial work remains in its original checkout. Held Kahf `890d994` and the MOU migration are not included as new GUI scope.

No GUI screen has been replaced at this setup checkpoint. Existing source is retained so each new screen can be compared against its current functions and connected later through the correct existing data and permission contracts.

## Confirmed design direction

The interface should be intuitive, elegant and compact. Preserve the current content and functions; do not add new content or capabilities without asking first.

**Desktop Learn / Teach:** aim for one screen per programme. Keep programme and class context visible. Arrange routine programme work within that workspace; reveal details in place through compact panels, tabs or drawers as appropriate. This is a design target to test against the existing functions, not permission to remove them or flatten their access boundaries. Dense detail can open in a bounded panel while the programme workspace remains available.

**Mobile:** Learn and routine Teach remain mobile-first. Admin is reviewed screen by screen. Record whether a screen supports full mobile use, a useful limited set of mobile actions, or desktop-only work. Make these decisions with the owner as the screens develop. Do not assume every desktop control must appear on a phone. Some teaching operations may also require desktop treatment when necessary.

## Offline review approach

Use clearly fictional sample records, local assets and local view-state for the first screen prototypes. Keep the prototype's data adapter separate from the native service adapters. The review harness must not sign in to the real app, make production API/database calls, submit messages, publish lessons, change permissions or fetch private media. Prototype saves remain explicitly local.

Use the current native screens and source as the content/function inventory. The earlier Circles `academy-workspaces.html` demo may inform visual direction, but its illustrative content and workflows are not evidence of current native functionality. Do not copy its invented records into the Academy or treat every demo feature as approved scope.

Validate navigation, screen density, readable text, keyboard/focus behaviour and narrow layouts in the local prototype. Use synthetic native fixtures for any later adapter checks. Full functional integration and publication require a separately reviewed connection to the current Academy/Studio baseline; an offline screen cannot establish real permissions or server-side gates.

## Boundaries to preserve

- Current master identity, login, account switching, scoped staff roles, programme/class allocation, assessment and publication gates.
- Tafseer and migrated Course website access in Studio, with no short-Course website delivery rebuilt in Academy Learn/Teach.
- Separate MOU monthly-access and published-timetable work; existing MOU PDFs/recordings remain in Academy under that project's current plan.
- Current native header/dashboard/Library/PDF return behaviour and the per-offering ownership state; no blanket authority switch.
- Existing data, source files, drafts, rights and media references. Do not seed or reset real records for visual review.

## Review order

Start by inventorying one retained programme's current Learn and Teach functions, then build a shared desktop programme shell using those functions. Review its phone adaptation and navigation before extending the pattern. Review Admin task groups and mobile limitations alongside each screen rather than imposing a global desktop-only rule.

Keep a per-screen review record of the existing functions, proposed layout, mobile support, unresolved decisions and later adapter dependency. Record questions as they arise; routine layout choices may progress without repeated approval. This setup does not authorise deployment, live integration changes, hosted operations or Git push.

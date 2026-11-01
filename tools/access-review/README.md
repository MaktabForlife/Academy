# Circles access management — local review

Owner request, 1 November 2026: an access management UI for Tafseer, Mothers of the Ummah and Courses. Based on deployed Source `078bcc8b`; the paired disposable preview is based on deployed Target `f4e2f3ed`.

The shared review shell provides three learning areas, a Course selector, a bounded learner roster and the selected learner's native controls beside it. It mounts `M4L_STUDIO_ACCESS` rather than reproducing access writes. Monthly programme access, original recording cohorts, website-only rights, live participation/allocation and Course purchases remain distinct. Course policy uses the existing trusted Free/Paid control. Additional website labels now work for either Tafseer or MOU.

The host receives checked catalogue metadata, never guesses real offering IDs or roles. Unsaved/pending native work prevents changing areas or Courses. Account changes clear the current private panel and catalogue; existing native token/role/session/ownership checks still govern every read/save. There is no polling or new authentication system.

## Local preview

Run `tools/access-management-ui-preview.mjs` in the paired Target checkout with `ACADEMY_SOURCE` pointing at this checkout. The helper serves this directory and the existing native editor at `http://127.0.0.1:9062/`. It creates only disposable local Source/Target fixtures and uses the real native access proxy. Its explicit synthetic catalogue and token are injected by that helper, never included in deployable frontend files. Do not ship this sample wrapper or its bootstrap as a production screen.

## Production integration still required

- Supply a bounded native authorised offering catalogue for the selector, including exact identities, titles and current offering ownership. Do not use an all-activity/participant sweep, client title matching, fixture identities or cross-account cache as a catalogue.
- Wire the checked Admin Access destination from the Circles Manage group and use the verified native account header. The present sample account label and review banner are deliberately local.
- Keep legacy/temporarily frozen offering ownership explicit. The editor must not fall back to a full legacy roster when its ownership check fails.
- Keep Studio Learn/Admin and Academy Teach separation. Compose into one matching-version Academy/Studio release only after integration checks; no deployment is authorised by this local UI request.

## Verification

Nine focused Source UI checks cover existing native policy retry/account guards and the new area/selection/account-switch catalogue guards. Browser proof covers Tafseer monthly Save/readback, Course purchase Save/readback while enrolment stays off, MOU monthly controls, dirty area-switch blocking, desktop layout and a 390px layout with no page overflow. All records are synthetic. Existing paired native access/MOU regressions are run separately; see the parent receipt for final counts and limits.

Evidence: parent `outputs/circles-access-ui-20261101/`. This is a local review checkpoint, not a claim that the live Admin Access entry or production catalogue is connected.

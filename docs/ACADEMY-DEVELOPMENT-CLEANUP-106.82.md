# V106.82 — Complete Development Academy source cleanup

15 October 2026. Release target: the existing `development` branch, `maktab-development` Pages project and `devrebootworker`. No new branch or infrastructure is created.

## Scope

Promotes the V106.81 Academy feature state and removes the unused Sheets-backed Reboot entrypoints, routes, Google Sheets/Drive clients, Apps Script applications and archived executable copies, private Library upload bridge, standalone legacy admin/student UI, unused JavaScript/CSS and the hardcoded `academy-feature-10660` release packager. Legacy-only regression files are retired alongside their implementations; they remain in Git history.

Course domain storage ports now use `readTableRows` and `applyTableWrites`. They plan D1 changes, preserve transaction boundaries and retain the existing imported record representations. Private Drive endpoint implementations are removed. Their public API boundaries still reject private-media requests clearly. The retired Program Library URLs display an availability page without retaining the old Drive editor.

The source boundary scans every backend source module as well as the deployed import graph. Google clients cannot remain hidden as unreachable source. The website builder uses a public-resource allowlist and excludes backend code, migration material and legacy applications. The long inline older-branch build fallback is removed.

The default and explicit Development deployment commands both select `devrebootworker`. No configuration in this branch deploys `rebootworker`. Pages uses the dedicated builder and `.academy-pages` output.

Independent HifzHelper shortcuts remain by the owner's explicit choice. The cancelled shared-login/data integration is not included. Academy Surahs and Duas teaching and standalone activities remain.

## Preservation boundary

- D1 `ACADEMY_DB`: `maktab-academy`, `7e732b79-a72f-4da6-be83-524919c49ba4`.
- `ASSESSMENT_BUCKET`: `maktab-assessments-private-development`.
- `LESSON_MEDIA_BUCKET`: `maktab-lesson-media-private-development`.
- `MEDIA_BUCKET`: `maktab4lifemedia`, also used by the legacy Worker; never delete it as Academy cleanup.
- `AUTH_LOGIN_RATE_LIMITER`: namespace `100101`.
- `PROGRAM_TIMETABLE_COORDINATOR`: deployed class `ProgramTimetableCoordinator`, namespace `aa75328c13ee4f42b406ccf5ebbe851a`.
- `ACADEMY_OPEN_LIBRARY_STORAGE_KEY`: retain its exact existing secret value. The name of this Cloudflare object is opaque and stable; no Google request is involved.
- PIN/session secrets, existing credentials, role evidence, subscriptions, imported data, publication history, metadata revisions and cover objects are preserved.

The historical class/binding name and imported schema/provenance field names remain intentionally. Renaming them would be a storage migration, not source cleanup. Saved-source formats remain as pure definitions in `backend/tools/academy-migration/source-schema.mjs`. Offline validation, import verification and recovery remain available without online Google capture. Updated converter source hashes affect only future locally generated plans; this release does not import or activate a new run in the existing database.

An expired Open Library session now returns 401 instead of the generic backend error. Session authority is checked again immediately before the coordinator's metadata write. Offline homepage comparison applies the current public-joining contract and checks every active account/context, rather than comparing an obsolete presentation mode.

## Existing test infrastructure

A read-only account audit found these retirement candidates. No remote Worker, database, Durable Object namespace or bucket is deleted by this release.

| Worker | Observed dependency |
| --- | --- |
| `academy-feature-10660` | Old V106.63 isolated preview still calls it; its 15-minute schedule remains. Not the current Development backend. |
| `academy-hifz-login-pilot` | Cancelled integration pilot; no inbound Worker bindings or scheduled task found. |
| `academy-hifz-connection-test` | Cancelled integration connectivity test; no inbound Worker bindings or scheduled task found. |
| `academy-d1-core-test-20261010-a01264a4` | Synthetic backend used only by the matching old browser-test Worker. |
| `academy-d1-browser-test-20261010-a01264a4` | Synthetic site calling that old core-test Worker. |

No binding reference does not rule out manual use or an external bookmark. Removing these remote Workers is a separate destructive action; their storage must be reviewed independently. Current Development uses none of their D1 databases or private test buckets.

## Validation and release record

The release is checked with the complete retained Academy/offline suite, source/import boundaries, Worker dry-run build and local browser acceptance of the packaged website on phone and desktop widths with synthetic Administrator and learner accounts. No live teaching records are changed by acceptance testing. Deployment and final check results are recorded below after verification.

Rollback code remains in Git at feature V106.81 `e01b9b674858da3ec6ad78f955c23a8861eddc3b` and previous Development V106.59 `73439959ee948ff90afe9e27b9e3ba9b20c2304a`. Legacy `main` remains at `1c5e60c9dcc74c4a5987abb1a166b6c399613652`. Historical release documents are reference material, not current build instructions.

## Icon audit

Retained `academy.png` and `logo.png` unchanged, plus the actively used `ummabbadacademy.png`. Current pages still reference `admin-favicon-32x32.png`, so it remains until the Academy icon redesign. The assessment report generator still uses `academy/academy-logo.png`, which also remains. Removed 13 unused icon/image files: 11 root Admin/Student PNG/ICO variants plus `icons/logo.png` and `images/startclass.png`. The unused legacy Admin/Student web-app manifests are removed. `recorder/pages/manifest.json` is teaching-content metadata and remains. No replacement Academy icons or manifest are designed in this cleanup.

Verified before deployment: **68/68 retained regression files passed**; the complete 91-module runtime and source-tree boundary contain zero Google backend clients; the 938 KiB Worker dry-run build passes; packaged website browser acceptance passes **14/14** Administrator/learner checks at 390px and 1440px with no page errors, failed local requests or horizontal overflow. Both preserved root PNG files are byte-identical to V106.81. The smaller regression count reflects retirement of the legacy app's tests, not skipped current Academy failures.

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

## Retired test infrastructure

After the read-only usage audit, the owner explicitly approved deleting the four test Workers and then `academy-feature-10660` by name. All five Workers below are deleted. Their D1 databases and R2 buckets remain. Only the current `devrebootworker` and legacy `rebootworker` remain in the account.

| Worker | Observed dependency |
| --- | --- |
| `academy-feature-10660` | Old V106.63 isolated preview still calls it; its 15-minute schedule remains. Not the current Development backend. |
| `academy-hifz-login-pilot` | Cancelled integration pilot; no inbound Worker bindings or scheduled task found. |
| `academy-hifz-connection-test` | Cancelled integration connectivity test; no inbound Worker bindings or scheduled task found. |
| `academy-d1-core-test-20261010-a01264a4` | Synthetic backend used only by the matching old browser-test Worker. |
| `academy-d1-browser-test-20261010-a01264a4` | Synthetic site calling that old core-test Worker. |

Seven old isolated feature-preview website deployments are deleted. Automatic previews for `feature/academy-review-fixes-10660` are excluded. Historical production deployment records remain. Current Development uses none of the retired Workers’ D1 databases or private test buckets. Private copies of their code and settings were retained outside the repository before deletion.

## Validation and release record

The release is checked with the complete retained Academy/offline suite, source/import boundaries, Worker dry-run build and local browser acceptance of the packaged website on phone and desktop widths with synthetic Administrator and learner accounts. No live teaching records are changed by acceptance testing. The final deployment and infrastructure checks are recorded below.

Rollback code remains in Git at feature V106.81 `e01b9b674858da3ec6ad78f955c23a8861eddc3b` and previous Development V106.59 `73439959ee948ff90afe9e27b9e3ba9b20c2304a`. Legacy `main` remains at `1c5e60c9dcc74c4a5987abb1a166b6c399613652`. Historical release documents are reference material, not current build instructions.

## Icon audit

Retained `academy.png` and `logo.png` unchanged, plus the actively used `ummabbadacademy.png`. Current pages still reference `admin-favicon-32x32.png`, so it remains until the Academy icon redesign. The assessment report generator still uses `academy/academy-logo.png`, which also remains. Removed 13 unused icon/image files: 11 root Admin/Student PNG/ICO variants plus `icons/logo.png` and `images/startclass.png`. The unused legacy Admin/Student web-app manifests are removed. `recorder/pages/manifest.json` is teaching-content metadata and remains. No replacement Academy icons or manifest are designed in this cleanup.

Verified before deployment: **68/68 retained regression files passed**; the complete 91-module runtime and source-tree boundary contain zero Google backend clients; the 938 KiB Worker dry-run build passes; packaged website browser acceptance passes **14/14** Administrator/learner checks at 390px and 1440px with no page errors, failed local requests or horizontal overflow. Both preserved root PNG files are byte-identical to V106.81. The smaller regression count reflects retirement of the legacy app's tests, not skipped current Academy failures.

## Deployment completion

- Existing `development` branch promoted and cleaned; no branch created. `main` and the old feature branch remain unchanged.
- Stable website and API both report V106.82; Pages reports `development`, `syntheticOnly:false`; API reports `D1_ACTIVE`, `PUBLIC_ONLY`.
- Pages production branch and `devrebootworker` Git build branch are both `development`. Worker deploy command remains `npm run deploy:development`, root `backend`, builds enabled.
- Eight unused plaintext settings and two unused secrets are removed from `devrebootworker`. Zero Google/Apps Script/spreadsheet bindings remain. All 14 active settings/resource bindings compare equal to the saved configuration.
- Three relevant D1 databases and four relevant R2 buckets were verified retained, including synthetic preview/test storage. No database migration, live teaching-data correction or PIN/session secret rotation was performed.
- Third-party PDF library license files remain in source and are included in the packaged website.

The owner completed Chrome sign-in for the Worker Git settings change. No Safari access was granted or used.

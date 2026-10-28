# Separate Website Studio

Local implementation on `feature/academy-website-studio`, based on V107.120 (`4cbb787c`). Deployment, pushing, hosted migrations, resource creation and live content changes require the human's approval. Release markers and active deployment configuration remain unchanged. Keep live checks small: use the saved packages and synthetic local fixtures first.

## Revised target and retirement boundary — 28 October 2026

The subsequent discussion expands the desired scope from an editor to an independent Tafseer and Courses learning platform. The current code is the Studio prototype; the broader migration is not implemented or deployed. The prototype's same-account/Core-only infrastructure below is not a final commitment for the larger platform.

| Owner | Responsibilities |
| --- | --- |
| Academy | Master accounts, account status and admission; timetable authoring; master programme/course Zoom links. |
| Website/learning platform | Tafseer and migrated paid-course content, local participation/content rights, persistent media and grants, websites, lesson-media management, journals, private session cards and joining. Public homepage editing, timetable-card presentation and public announcements also move here. |
| Published connection | Versioned timetable facts and private effective Zoom settings; website presentation and locally owned media are combined there. Link changes and timetable corrections must trigger delivery. Routine website page views and Join checks should use the target's stored publication and current local authority. |
| Library navigation | Academy Library remains in Academy with approved return navigation to the originating website/course/lesson; no duplicate Library store. |

Persistent content access is distinct from current subscription/live-session access and staff privileges. Historic paid material and explicit grants must survive subscription expiry; Academy admission must still allow those former participants. Master-account suspension and staff revocation must remain enforceable. Retention/backups must match the material-access promise, and existing website-only Surah grants must not silently gain recording rights.

### Retire Academy Learn and Teach for migrated offerings

The human requested removal of these delivery screens for Tafseer and Courses. This is a retirement of the migrated offerings' Academy interface, not deletion of the shared Academy Learn/Teach system or their data.

1. Identify migrated offerings by stable IDs. The scope is Tafseer and courses actually moved to the new platform, not every activity sharing a Learn/Teach component.
2. Verify the replacement learner/staff website, access and historical rights, media/notes/journals, published timetable corrections, joining, account revocation and Library round-trip before retiring the corresponding Academy route.
3. Replace their Learn/Teach entrances and saved destinations with verified website entry/handoff links. Keep old bookmarked URLs as scoped redirects. Preserve the existing Academy destinations for other programmes.
4. Remove the migrated offerings' duplicated background reads, prefetches and media/session-card assembly from Academy's delivery responses. Do not remove the authoritative timetable data/export, master-user/admission information or shared permission code.
5. Transfer media and attachment relationships using stable IDs; inventory shared files first. Retain read-only recovery sources and history until separate cleanup approval. Do not delete users, paid-month records, grants, files, notes or journals merely because their old screen is removed.

No product-code removal, live migration, resource creation or deployment has been performed for this revised scope. The existing local validation below proves the narrower Studio prototype only; it does not validate this future cutover.

## Infrastructure of the current Studio prototype

| Component | Requirement |
| --- | --- |
| Repository | Reuse this repository; independently built `website-studio/` application. A second repository is optional. |
| New compute | One Cloudflare Worker with static assets and a small API. Static files route directly; only `/api/*` runs the Studio Worker. A separate Pages project is optional, not required alongside this configuration. |
| New storage | One private R2 bucket: drafts, immutable published JSON versions, shared images and opaque sign-in records. No public bucket or public media URL. |
| Database | Three small operational tables in the existing Core D1: current pointers/revisions, asset references and retry results. No new D1 database and no website bodies in these tables. |
| Existing services | Academy accounts, current sessions, scoped Admin authority, paid months, additional Surah grants, native media, timetable, assessments and optional journal remain Academy services. |
| Private links | Studio `ACADEMY` → Academy `WebsiteStudioAcademy`; Academy `WEBSITE_STUDIO_CONTENT` → Studio `StudioContent`. Private service bindings require no new external API key. |
| Address | One separate Studio origin, configured consistently in both applications. A Worker address or a custom subdomain may be selected at deployment. The committed placeholder is deliberately not a working production address. |

A new Worker separates code and releases; it does not provide another account allowance. Academy reader requests still need their current access checks. Website traffic is not being converted into anonymous public downloads.

## Behaviour and permissions

Existing app links launch Studio in a separate tab through a one-use, 60-second PKCE handoff. Academy bearer tokens stay in private server storage; browser messages carry only a token hash used to detect account changes. Studio uses a Secure HttpOnly cookie, exact-origin checks for all mutations and a bounded session. Each API operation checks current Academy session and scope. Metadata commits recheck current account, credentials, session and actual Admin authority inside their atomic write guard; a client-selected workspace never grants authority.

Browser-only account-continuity messages make no API/database requests. Account switching clears the editor, buffers and object URLs; a cookie/account mismatch also prevents an old tab acting under a replacement session. The Academy opener should remain available. If continuity cannot be confirmed, Studio closes its private view and asks to reopen from Academy. A blocked popup leaves a clickable fallback link. No draft or bearer token is written into browser storage; existing account-keyed editor preview preferences contain only local preview state.

The full builder, on-page text editing, manual Save, review/Publish, withdrawal, course-copy import/export and prepared teaching copies run in Studio. Course copies retain native Academy references rather than embedding PDF/video bytes. Import checks those references again under the current account and selected website. Images remain portable in course copies.

PDFs and videos are selected from published Academy Lesson media. The picker loads one bounded page and fetches earlier materials only when requested; it does not load the timetable. A new media item is uploaded/published in Academy first, then attached by its lesson/file identity. PDFs appear under Course materials; additional recording links can be removed in the editor. Existing automatic recording/timetable feeds continue. The native media services enforce current publication, class, paid-month, retention/expiry and withdrawal gates. A website grant does not create new recording rights.

Learner URLs and the shared reader renderer stay in Academy. Migrated website JSON/images are loaded through the private Studio binding after the existing website access gate. Public Foundations remains public, other Surah access still follows paid months/additional grants, and protected native media still requires sign-in. Student progress, reflections and optional journal paths are unchanged. Studio previews do not write to a student's journal.

## Publication and storage

Studio validates the existing course model and same-website references. Text is bounded to 500 KB, a complete immutable version to 1.2 MB and website references to 100. Image uploads are verified by actual bytes, type and SHA-256, bounded to 5 MB each, and shared once by hash. Native PDFs/videos retain their existing Academy size limits/storage; Studio stores no copy of their bytes.

R2 content is written before the small guarded Core pointer transaction. Failed object writes cannot advance publication, a failed transaction leaves only private unreferenced objects, stale saves conflict, and exact actor/payload-bound retries reuse their result. The current published edition stays readable while a private draft changes. Withdrawal is a live pointer gate. Older pending Academy publications cannot replace the Studio publication switch.

Studio save/publish never rebuilds the Academy shared setup head or adds body components to Core/Admin. Future website body/history growth moves to R2 per website/Surah. The old D1 bodies and history are retained; this change does not immediately reclaim their storage. Publishing still writes a few pointer, availability, audit and retry rows. Each Studio action also incurs R2/service requests and current-access checks; moving code alone does not make those free of work. Static editor assets and account-continuity messages require no D1 query.

No version-retention policy or history deletion has been introduced. A previous discussion of three versions was not approval to discard history. Before enabling hosted storage, configure lifecycle cleanup only for expired sign-in records: `auth/handoffs/` after one day and `auth/sessions/` after eight days. Runtime expiry is enforced immediately (60-second tickets; sessions no later than the original Academy token or seven days), independently of cleanup. Do not apply those lifecycle rules to website versions or images. Old failed-operation objects and retry/audit history should be pruned only under a separately reviewed retention policy.

## Migration, cutover and recovery — after approval only

1. Choose the Studio origin; create the private bucket; configure the two auth-prefix lifecycle rules and include Studio R2 plus Core metadata in recovery backups. Existing media backups remain necessary. The new Core schema migration is `backend/migrations/academy-core/0010_website_studio.sql`.
2. Update Academy with its new private entrypoint while the feature remains disabled. Deploy Studio with its private binding to Academy. Merge the reverse binding using `backend/wrangler.website-studio-bindings.example.jsonc`, still with the flag disabled. This ordering avoids a circular first-deploy dependency.
3. Configure the actual Studio origin, Worker route/domain and API vars. `website-studio/wrangler.jsonc` currently has `workers_dev:false` and a placeholder origin; an address must be explicitly configured before deployment. Keep the bucket private. Do not copy the Studio origin into `ALLOWED_ORIGINS`: browser API calls remain on each application's own existing origin, and the cross-service calls use private bindings.
4. Enable `ACADEMY_WEBSITE_STUDIO=1` only after bindings, schema and both builds are ready. Legacy editor mutations are then rejected; existing readers fall back to their unchanged legacy edition until their website is migrated. Save/upload/attach performs that website's migration, or an authorised Studio client may explicitly POST `/api/migrate` for one selected website. No bulk scan is required.
5. Migration brackets the separate legacy draft and accepted published edition with the Core source version, preserves them separately, verifies/copies image bytes by hash, writes private R2 versions, then commits their pointers atomically. Conflicting source work requires a fresh retry. It preserves withdrawn states. Legacy direct website PDFs need an explicit Academy Lesson media mapping; migration stops with a clear error instead of silently copying/exposing them. The nine saved website packages used for rehearsal contained images but no direct website PDF assets.
6. Verify one selected website, one entitled learner, one denied learner and one attachment after approval; do not crawl dashboards or all tables. Keep production checks bounded. Confirm that the saved draft and accepted edition match the intended current live source; saved local packages alone cannot prove that nobody edited live content later.
7. Rollback: disable the feature to restore the retained legacy editor/reader sources. **This shows the old legacy edition, not Studio edits published since migration.** Before a rollback that must preserve those newer edits, export the current Studio website copies and restore them through the authorised legacy workflow with native media mappings; test the restore and review publication before changing the switch. Never delete R2 versions/metadata during rollback. For Studio-specific failures, prefer repairing the binding/object or temporarily withdrawing only the affected website over changing unrelated live content.

## Local validation and limitations

- Native Miniflare integration tests exercise the actual private entrypoints, Workers, D1 transactions and R2 objects: one-use handoff, scope/CSRF/session checks, account-cookie binding, migration, shared images, retries, competing saves, withdrawal, native PDF/video access, paid-month/additional-grant boundaries and simulated R2 failures. A separate atomic-write test revokes Admin authority after planning but before the guard executes.
- Existing editor, inline text, website, native-media, publication, grant/cache and release-integrity regressions cover the disabled legacy path and shared renderer. The course-copy test verifies that native PDF references survive export/import without uploading PDF bytes. An older pending-publication test verifies the new Studio switch guard.
- Browser acceptance blocks all external origins and serves only synthetic `academy.test` / `studio.test`. It checks secure launch, manual Save/Publish, learner content, visible images, desktop/phone controls with no horizontal overflow, on-page editing, account-switch clearing and blocked-popup fallback. Screenshots and reports live outside the shipped tree.
- `backend/tools/academy-website-studio-rehearsal.mjs` accepts a saved measurements JSON and an output JSON. It imports the nine saved packages into synthetic local Academy storage, migrates them through the real private API and compares both editions. It never calls the live app or hosted SQL. These packages are a saved-content rehearsal, not a current-live-content inventory.
- Both Worker packages are checked with Wrangler `deploy --dry-run`; no resource is deployed. Studio runtime bindings are generated by Wrangler. The bundled native test runtime supports compatibility date 2026-09-28; the intended Studio configuration is 2026-10-28. Build packaging accepts it, but production-date runtime behaviour and real DNS/service bindings remain to be verified after approval.

Evidence directory: project-level `outputs/academy-website-studio-20261028/`; test/build logs: project-level `outputs/academy-studio-*.log`. No production requests, hosted database queries, pushes or deployment were used for this implementation.

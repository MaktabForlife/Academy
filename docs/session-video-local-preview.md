# Session video feature — V107.68

Branch: `feature/academy-session-videos`, based on `c62c901274881c191163586c33d55e2d8720a9ee`.

Manual R2 uploads are implemented. Automatic Zoom imports remain deferred. On 26 October 2026 the user explicitly requested deployment after V107.67. V107.68 incorporates that deployed release. The release is deployed to the existing Development website and API; activation evidence is recorded below.

## Using the feature

Open a dated session's media editor, choose **Upload MP4**, select the recording and upload it. Save existing lesson edits before uploading. Upload progress and a retry action are shown. The current limit is 512 MiB per file, with up to ten active videos per session across uploaded MP4s and YouTube links.

After upload, save and publish the session through the existing publication flow. MP4s and YouTube videos open in the same in-app dialog: MP4s use native browser playback with seeking and a playback-speed selector; YouTube uses its embedded player. No transcoding is performed, so the MP4 needs browser-supported codecs. Verification used H.264 video and AAC audio.

Recordings inherit the existing session access rules. There are no additional roles, assignments or permission screens. The existing session reader check is reused for playback. R2 is accessed through the Worker binding, without a public bucket address. The player receives a two-hour grant for one recording, tied to the current account session and workspace. Playback requests recheck the live account session and existing lesson audience. These are temporary bearer links, not protection against an authorised viewer forwarding or downloading a recording. Playback grants cannot be used as general Academy account tokens.

## Expiry and the media rail

The availability period starts at R2 multipart completion, using R2's upload timestamp. At fourteen days the app stops issuing or serving playback and shows **Recording expired** on the session/timetable. An expired recording is disabled on a remaining media card.

A learner's media card disappears when its only attachments are expired recordings. If a YouTube link, PDF or active recording remains, the card stays. Admins retain the session in their management rail so they can remove expired entries or upload a replacement. Session records, attendance, notes, PDFs and YouTube links are not deleted. Cached rail metadata includes expiry timestamps and is filtered locally; an open rail also updates at the next expiry without a polling request.

Physical deletion uses a native R2 lifecycle rule. Cloudflare says deletion typically occurs within 24 hours of the expiration time and can take longer; the app still enforces fourteen-day availability. See [R2 object lifecycle behavior](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

The prepared fragment is `backend/config/session-recordings-lifecycle.json`:

- Bucket binding: `LESSON_MEDIA_BUCKET` (existing Development private lesson-media bucket).
- Object prefix: `dev-split-v1/session-recordings/`, matching `ACADEMY_OBJECT_NAMESPACE` in the Development configuration.
- Rule identifier: `session-recordings-14-days`.
- Expiry: object age of 1,209,600 seconds (14 days).

The bucket also holds PDFs and protected snapshots. Apply the recording rule only to that prefix, retaining unrelated lifecycle rules. `backend/tools/academy-session-video-lifecycle.mjs` merges a reviewed existing-rule export with this fragment locally and refuses to reuse the rule identifier for another prefix. Incomplete multipart uploads retain R2's existing/default abort rule. Detached completed recordings also remain subject to the recording expiry policy.

## Database migration procedure

`backend/migrations/academy/0037_session_mp4.sql` upgrades a monolithic legacy schema only. Do not apply that fixed table definition to the current split Core/Admin stores.

For each split store, export its actual attachment table, indexes and triggers:

```sql
SELECT type, name, sql
FROM sqlite_schema
WHERE tbl_name = 'lesson_media_assets' AND sql IS NOT NULL
ORDER BY type, name;
```

Prepare one migration per store using `backend/tools/academy-session-video-migration.mjs`. The generator retains each store's real column order, nullability, identity references, indexes and local triggers. Core's opaque asset references remain valid without copying private metadata into Core. Apply the reviewed store-specific migration transactionally and verify row preservation and foreign keys before resuming writes. The synthetic split tests exercise this preparation and subsequent accepted-setup publication.

On an explicitly requested release, check the target namespace and bucket's public-access settings, add the native rule without replacing unrelated rules, migrate both stores, and release the matching Worker and website. Bump the release version before any feature-branch push as required by `AGENTS.md`. Changed asset references already use a distinct local feature cache revision. No additional bucket or secret is required.

## Verification completed

- 91 local checks passed across session uploads, expiry, access revocation, byte ranges, retry/idempotency, attachment edits, session media, main timetable references, publication, split schemas and runtime, workspace handling and the media cache.
- Worker dry-run build passed (1,471.13 KiB; 316.40 KiB compressed).
- Website build passed (750 assets); it remains local in the ignored `.academy-pages/` directory.
- Browser verification used synthetic split databases plus the actual local Workers R2 simulator: file selection, manual upload, progress, staged publication, learner playback, seeking, speed selection, normal close after speed changes, and YouTube embedding.
- Player layout checked at 390 × 844 and 1280 × 900. Expiry checks showed an expired-only session retained for Admin and omitted for Learn, with a mixed-attachment session retained and labelled.
- Native R2 expiry is active for the recording prefix. The fourteen-day deletion event itself has not yet occurred or been observed; expiry handling and the safe policy merge are verified locally.

The dedicated loopback preview is `backend/tools/academy-session-video-preview.mjs`. It serves only a synthetic page, the local test API and six explicitly named public assets. It does not serve arbitrary repository files or use hosted credentials. An optional `VIDEO_PREVIEW_SAMPLE` path can seed generated local samples for active and expired states. The sample is never sent to cloud storage.

## Earlier direct Zoom trial

The supplied recording played on Zoom's own page. Its then-current direct MP4 address failed in the standalone local HTML player with media error 4. This result applies to that recording/browser trial, without establishing why the source failed. The earlier direct-URL experiment is archived locally under the ignored `.academy-migration/zoom-trial/` folder and excluded from the release; it does not persist signed addresses or upload to R2. No signed Zoom address has been committed.

The user lifted the deployment hold for this release on 26 October 2026. Keep live verification targeted and small under the shared project rule.

## V107.68 release — 26 October 2026

- Incorporated deployed V107.67 commit `385b16758e3463a80a9ddb3b0fa07dacf5df2677` before preparing the release.
- All 108 Academy regression files pass. The two Workers-runtime tests and navigation test also passed after restoring the local build dependency and excluding the earlier standalone Zoom trial from public release assets.
- Both release builds pass: API Worker 1,471.13 KiB / 316.40 KiB compressed; website 750 assets. All active version markers and changed-asset references agree on V107.68. Academy boundary check passes for 134 modules.
- Read only targeted hosted attachment schemas/counts and D1 rollback bookmarks. Before migration, each store contains nine assets; Core has eight links and Admin has six. No asset data was exported. Rehearsal against the actual hosted table definitions preserves rows, links, local triggers and foreign keys.
- Generated store-specific migration files and rollback bookmarks are kept in the ignored `.academy-migration/video-10768/` directory. Do not replace those reviewed files with the monolithic migration.
- Renewed Cloudflare deployment access and activated `session-recordings-14-days`: enabled, age fourteen days, prefix `dev-split-v1/session-recordings/`. The original seven-day incomplete multipart cleanup rule remains. Public `r2.dev` access is disabled and no custom domains are attached to the bucket.
- Applied the reviewed actual-schema migrations transactionally to Core and Admin. Targeted checks confirm MP4 is accepted, each store still has nine assets, Core retains eight links and Admin six, all six Core asset triggers remain, and both asset/link foreign-key checks are clean.
- Deployed `devrebootworker` V107.68, version ID `82f5a9b5-5ee7-4eab-b356-41b2fcb4d4c6`, preserving existing bindings, variables, secrets and schedule.
- Published the matching website to the `academy-maktab4life` project's existing `development` production branch: deployment `9215af64`. The API health, website health and `https://maktab4life.org/version.json` report V107.68. The served recording UI asset is byte-identical to the tested source.
- No actual Zoom recording or other teaching data was uploaded as part of deployment. Upload, playback, publication and expiry behavior were verified with disposable local fixtures. Hosted verification used only targeted schema, policy, static-asset and health checks.

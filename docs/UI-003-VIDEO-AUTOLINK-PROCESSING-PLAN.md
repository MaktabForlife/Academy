# UI-003 — Manual video processing: concrete source and activation contract

Proposal and source status only. Owner scope is Course Media → exact recording/destination → timestamped transcript → separate authorisation for each AI run → private review/edit → native draft acceptance → separate explicit publication. Development is the next release target. This document does not authorise live schema, provider, resource, credentials, production or hosting changes. New comments remain deferred until VIDEO AUTOLINK is complete.

## Current owner and source boundaries

Canonical source re-pinned for composition: Academy1b4dd450a4a59093ae85d891f0277eb480418c30 and Studio9a8c117e9279a2b67e62eb044be4da989db4a096. Preserve later canonical governance and the independent UI components, including BUG-002 reader changes in overlapping Course Media files and the common UI-001/UI-002 header. The earlier development branches are evidence sources, not promotion trees.

The native Studio owning DB, current local session/epoch, fresh scoped Admin, Source readiness/generation/master fences, COMMITTED handover, exact attachment/asset/website/playlist/Teacher and current companion/attribution revisions remain authoritative. Caller ids select a requested resource; they never confer rights or choose retention. Academy retains its own Core/Admin/coordinator authority and immutable links/copies/sync. No cross-D1/R2 atomicity is claimed.

Completed Studio source0c0b4794d2f30db1e1e26f94a5c69936979647a5/run42238228733 passed91 TAP executions:20 foundation/provider,44 native source/jobs/review,13 native attachment,9 HTTP transport,1 actual paired Source and4 actual local Workflow; plus two separate scoped Chrome/WebKit browser executions. These groups are not91 distinct end-to-end tests. Academyb585d8ad15638fe3805b1adf4ae910c7f54d47b6/run42235537442 passed11 executions (7 top-level plus4 nested), including actual public builder/copied-module graph and native PIN-derived scoped transport. Exact ZIP hashes and qualifiers are in the central UI log and handoff.

The browsers run the actual native Course Media component and native Node/local-Miniflare API with synthetic current sessions/Source, a mocked Teacher bridge/provider/Workflow, and an actual received HTTPS cookie. They cover private source attachment, discard/reopen transcript, explicit authorisation, simulated lost503 ACK and same-operation retry, candidate edit/accept, explicit addition to the CURRENT Course playlist draft and separate existing Content publication. A delayed private response in an isolated second browser context cannot refill the pane after local account switch. Width checks390/768/1280 pass, with no instrumented Storage.setItem/page errors. This is component CSS/rendering and local application privacy scope, not physical Safari, complete global navigation, real host/CSP/media/BFCache or universal storage audit. The paired Source case reuses actual native Academy PIN/Core/Admin/coordinator/signatures and Studio owning DB/R2 with a200000-byte synthetic MP4 part; it is local, not real-host/billing proof.

No live provider request, hosted Worker/D1/R2 read/write, install, secret, model selection, deployment or Mac file write occurred in these tests.

## Actual default-disabled integration

VIDEO_AUTOLINK_HTTP_ENABLED gates the new source/private HTTP entries and UI capability. VIDEO_AUTOLINK_ENABLED separately gates private transcript/job/model processing. No default model, provider key, token budget, whole-video limit, private retention or Workflow binding is assumed.

Academy's existing studio-access JSON limit remains131072 bytes; its artwork path remains decorative artwork only. Studio's existing internal access route remains262144 bytes. Do not raise either generic parser or tunnel private processing through artwork.

New dedicated Academy POST routes:
- /api/admin/platform/studio-processing: explicit allowlisted JSON commands, maximum1MiB browser body; no caller actor/role/proof or arbitrary forwarding.
- /api/admin/platform/studio-processing/recording-part: raw application/octet-stream POST, maximum5MiB per part; exact activity/asset/part selector, current native bearer/workspace/portal-Origin checks. Server hashes/encodes the bounded part; the browser bearer is never forwarded to Studio.

Both call the dedicated HMAC path /internal/studio/video-processing, bound to exact method/path/raw JSON, maximum8MiB signed envelope and1MiB response. Commands other than a recording part are limited to768KiB; transcript text is limited to512KiB. Source deliveries may be shortened to the bounded envelope with more=true, but the original command is preserved and not executed until deliveries finish. An explicit retry keeps the same command/operation/part; nothing silently becomes a read or new paid run. Current proof remains55/60 seconds, not globally extended.

Native Studio uses POST /api/admin/:offering/processing after its existing platform, exact Origin, host/session/current actor and scoped Admin gates. Both trusted entries call narrow source/processing handlers. Unknown fields/actions are denied; caught private errors use static allowlisted bodies, no-store and nosniff. No browser bearer, new PKCE target, root marker, signed URL, cookie/host change or recursive backend/auth publication is introduced.

Source commands reuse native checked Teacher/playlist choices, retained MP4 multipart upload, YouTube object creation, exact private attachment, media detail. Course publication remains a separate existing Content action. No fabricated companion is needed to attach a source. The source-only form omits processed/supporting-file fields; optional readings remain in the current Content tools. Recording parts follow the existing five-MiB client sequence. VIDEO_UPLOAD_MAX_BYTES is an explicit profile bound on new-route part offsets/UI selection, not a newly proved global ceiling on all pre-existing native upload paths. Native unfinished multipart/orphan policy and unknown R2 outcomes still require exact activation review; no legacy upload cleanup or guessed first-success clock is installed.

## Proposed owning schema: FOUR new tables, fixture only

All four are proposed only in tests/fixtures/video-autolink-proposed.sql; no numbered/live migration exists. They must reside in the same isolated owning Studio DB as its native guard/audit/receipt transaction.

1. video_processing_sources: server UUID; native offering/attachment/asset/revision; private transcript key/hash/format/duration; fixed private expiry; native retention class. No raw transcript in D1.
2. video_processing_jobs: source UUID; derived attachment/source revision; original actor session reference/epoch; authorisation/deadline/config quote; native material/base revisions; guarded QUEUED/RUNNING/CANDIDATE/terminal state; attempt/request hash; safe usage/receipt. Immutable grant fields and a unique partial active attachment/source slot prevent overlapping queued/running work. Only already-expired active slots close in a new explicitly authorised transaction. Same-operation replay keeps the original job/deadline.
3. video_processing_candidates: unique job/attempt; private immutable key/hash/expiry; prepared native acceptance key/hash/op and cleanup state.
4. video_processing_committed_objects: minimal key/hash/native attachment/time receipt. No actor/session/transcript/model/provider data; no foreign-key hold on native rows. This receipt follows retained native content lifetime so private-job expiry cannot delete accepted native content.

New internal foreign keys do not hold native attachments/offering/identity rows. Exact indexed private-history pages read at most26 rows before filtering expired items; explicit pagination remains bounded even when many old rows await cleanup. Private history lets a current scoped Admin reopen a candidate after closing the form; it is not stored in browser storage.

## Paid-call and recovery contract

The immutable source/material and original actor/ref/epoch/config/deadline are checked before preparation, claim and candidate commit. A fresh valid Admin proof receipt may change its timestamp/version without extending the original paid grant or discarding unchanged material. The full CURRENT native DB tuple is still fenced atomically; validating an old video can never bind a newly changed PDF/association snapshot.

All fallible request/schema/limit construction precedes the paid claim. Only a successful ACK of the exact owning QUEUED→RUNNING guard/update/audit batch grants this invocation one fetch. Do not use a replayable generic operation receipt to reconstruct that grant. Provider/SDK/HTTP and Workflow step retries are off. A lost claim ACK, resumed RUNNING step or unknown provider result does not automatically spend again. Another run needs separate explicit authorisation and may incur another charge. Deterministic Workflow ids alone are not once-only billing proof.

The configured Responses request uses store:false, strict structured output, no tools/arbitrary provider URLs and bounded input/output/time. Redirect mode is manual; every non-2xx response is rejected and no Location is followed. Workers does not support redirect:error: the real-runtime test found and corrected that pre-request TypeError. Transcript/quotation instructions are untrusted data, not authority. Provider output cannot choose ids, roles, destinations, R2 paths, retention, publication or verification flags.

The separate candidate entry preserves the actual hosting/saas/worker.mjs default and exports the Workflow class; no current Wrangler main/binding or flag activates it. The class stores jobId-only params and safe state/id/code outputs, with step retries.limit0, bounded runtime and configured success/error history retention. Actual local SDK/engine proof uses Miniflare5.20261103.0-beta/workerd1.20261103.1/date2026-10-28: positive guarded candidate,503 unknown result without retry,302 rejection after one outbound attempt without following, and malformed params before any request. Artifact13511933676 SHA256cf316ebea4ee6b277806cde960593c9cb9257a28b6d30d211fff5c2a1aa2737f was verified in RAM. This is not hosted Workflow/billing/provider-access/crash-resume acceptance. Earlier fake-dispatcher unit cases remain distinct. No transcript/candidate/key/provider exception is returned to durable history.

## Private review, publication and cleanup

The existing Course SQL release guard remains unchanged. A trusted server-only privateCourseSource option requires actual COURSE kind/current workflow/exact playlist/no supporting files; it defers ONLY published playlist membership while saving the private native attribution. A caller cannot enable the option through JSON. Generic/native default behavior is unchanged. Explicit Add reviewed lesson to the CURRENT playlist draft preserves other references/revisions; only the existing separate Content Publish operation creates learner-visible membership through the existing release guard.

Private candidate output is written under a unique owned immutable key before its pointer CAS. Explicit acceptance rechecks current native source and original base companion/attribution; stale edits conflict and cannot overwrite another Admin draft. The reviewed allowlisted native object is prepared before the pointer transaction. Acceptance changes only the native draft plus minimal committed receipt; previous publication remains. Publish is a separate current native operation.

References/Arabic/meanings, suggested lesson/book matches and audio quotation candidates remain private and unverified by default. An Admin must select/review them and provide the corresponding explicit confirmations. Model text does not prove audio verification, assigned homework or factual correctness. No raw transcript/private evidence/provider metadata is copied into learner content.

Cleanup is separately disabled, bounded to new indexed metadata/new private prefixes with explicit continuation. It closes expired unaccepted work before deleting prepared keys. Minimal committed receipts preserve accepted retained native content even after private job expiry or subsequent draft replacement. No legacy prefix deletion, native FK hold, whole-catalogue scan or claim that all existing native history is bounded.

## Native ingestion/retention and supported inputs

Native Studio uploader MP4 and YouTube recordings are retained under current owning policy; provider/MIME alone does not select this policy. Native uploads.created_at is initiation, and multipart etag is not a whole-file source hash or first-success ingestion certificate. Unknown original successful ingestion remains null; no guessed date, backfill or new academic TTL is imposed.

Academy's separate temporary academic recording policy remains14 days video and one clamped calendar month TOTAL companion/transcript from its original successful ingestion; retries/reprocess/publication never reset it. Its current Core/Admin/coordinator writers stay separate. This Studio source plan neither migrates Academy academic content nor authorises its storage/data changes.

Manually supplied VTT/SRT is supported; exact timestamps are validated without claiming transcript/audio completeness. Existing YouTube/MP4 are the real playable native inputs. A Zoom share link needs an authorised downloadable MP4 and available transcript; no private caption scraping, new Zoom OAuth scope or automatic Zoom ingestion is inferred. Any additional acquisition adapter is a separate concrete gate, not a fake success timer.

## Concrete activation/release gates

Before activating, Deployment needs an exact isolated Development Studio storage/profile/owning schema/R2/Workflow/credential plan, current host/native-browser/Source integration evidence, precise install/config effects, independent review and small enumerated verification budget. Current existing DBs, production and real prepared lessons remain protected.

Read-only physical-target review found the current native Development pair spans Academy's owning account and Studio's DIFFERENT owning account. Studio academy-studio-parallel/DBc261 is active native storage with no Workflow binding; it is not a processing sandbox. The four tables must NOT be installed there under the existing-DB hold, and a processing-only side D1 cannot preserve the same-owning guard/audit/CAS. Prepare a NEW complete Studio-native synthetic DB plus the four tables, NEW private source/content/media/processing buckets/namespaces and Workflow in the actual Studio owning account, exact host/ASSETS entry and compatible synthetic Academy bridge. Actual names/IDs/credentials/host/profile are not allocated or approved. Academy's JWT Feature pair/token does not supply or authorise this Studio isolation. Logical Development release routing requires an exact reviewed physical profile/health/recovery/credential plan; do not silently alias it to production. Source-only default-OFF review is separate from activation.

Required private configuration: an account-approved provider key stored only in the owning private environment, exact accessible model/profile, input/output/time bounds, upload profile, private review TTL and Workflow retention. Historical US$15–20 estimates are not verified price, model selection or a current spend cap. No credentials/hashes/real personal media/transcript belong in public source, artifacts or Drive.

Broad concurrency/growth/privacy/browser suites stay in disposable GitHub/local DB/R2 with mocked provider and zero hosted calls. A later real check must be separately reviewed: one entirely synthetic transcript/job, at most one configured generation request, a small enumerated Admin API sequence and measured actual Worker/D1/R2/provider usage. No inferred savings or billed CPU claim.

Rollback: disable new authorisations/HTTP capability, cancel/drain owned instances and preserve original job/source/expiry/operation floors, native drafts/publication/ids/rights/sync. Do not drop tables/reset metadata to make rollback pass. Deny expired private reads and clean only verified new private objects within the reviewed policy. Existing published content stays under native rules.

Official references already read: Cloudflare Workers best practices; Workflows rules; OpenAI Responses strict structured outputs/model docs. Documentation does not establish account model access or text-model audio/video transcription.

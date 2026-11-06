# UI-003 — Manual video processing: concrete source and activation contract

Proposal and source status only. Owner scope is Course Media → exact recording/destination → timestamped transcript → separate authorisation for each AI run → private review/edit → native draft acceptance → separate explicit publication. Development is the next release target. This document does not authorise live schema, provider, resource, credentials, production or hosting changes. New comments remain deferred until VIDEO AUTOLINK is complete.

## Current owner and source boundaries

Canonical source re-pinned: Academy38e66a57f0e094089718dd9dce6ff632f6247d68 and Studio1fd6d1af577fd2adf81a054d67860c3fa4d66f21. Preserve later canonical changes and the independent UI component work when composing a reviewable release; these source branches are not promotion trees.

The native Studio owning DB, current local session/epoch, fresh scoped Admin, Source readiness/generation/master fences, COMMITTED handover, exact attachment/asset/website/playlist/Teacher and current companion/attribution revisions remain authoritative. Caller ids select a requested resource; they never confer rights or choose retention. Academy retains its own Core/Admin/coordinator authority and immutable links/copies/sync. No cross-D1/R2 atomicity is claimed.

Completed independently reviewable backend source f1b5f0c9bfbc9296eac8819eea83a237526f0745/run42219278654 passed68 scoped executions, not68 distinct end-to-end tests. Subsequent mounted-but-default-disabled Studio transport55ae76f904d019a7ca82d15e698eda5128ac6259/run42221886283 passed77 scoped executions; its nine transport executions include four nested denials. Academy transportbc99bd9c22f0af4e7ba01b2e73f6c5ef88f71b51/run42222261245 passed nine scoped executions; the trusted Studio response is mocked there, not a paired end-to-end claim. ZIP hashes and exact scope are in the central UI log/evidence handoff. UI integration and later affected checks must be assessed at their own exact heads, not inferred from these earlier runs.

No live provider request, hosted Worker/D1/R2 read/write, install, secret, model selection, deployment or Mac file write occurred in these tests.

## Actual default-disabled integration

VIDEO_AUTOLINK_HTTP_ENABLED gates the new source/private HTTP entries and UI capability. VIDEO_AUTOLINK_ENABLED separately gates private transcript/job/model processing. No default model, provider key, token budget, whole-video limit, private retention or Workflow binding is assumed.

Academy's existing studio-access JSON limit remains131072 bytes; its artwork path remains decorative artwork only. Studio's existing internal access route remains262144 bytes. Do not raise either generic parser or tunnel private processing through artwork.

New dedicated Academy POST routes:
- /api/admin/platform/studio-processing: explicit allowlisted JSON commands, maximum1MiB browser body; no caller actor/role/proof or arbitrary forwarding.
- /api/admin/platform/studio-processing/recording-part: raw application/octet-stream POST, maximum5MiB per part; exact activity/asset/part selector, current native bearer/workspace/portal-Origin checks. Server hashes/encodes the bounded part; the browser bearer is never forwarded to Studio.

Both call the dedicated HMAC path /internal/studio/video-processing, bound to exact method/path/raw JSON, maximum8MiB signed envelope and1MiB response. Commands other than a recording part are limited to768KiB; transcript text is limited to512KiB. Source deliveries may be shortened to the bounded envelope with more=true, but the original command is preserved and not executed until deliveries finish. An explicit retry keeps the same command/operation/part; nothing silently becomes a read or new paid run. Current proof remains55/60 seconds, not globally extended.

Native Studio uses POST /api/admin/:offering/processing after its existing platform, exact Origin, host/session/current actor and scoped Admin gates. Both trusted entries call narrow source/processing handlers. Unknown fields/actions are denied; caught private errors use static allowlisted bodies, no-store and nosniff. No browser bearer, new PKCE target, root marker, signed URL, cookie/host change or recursive backend/auth publication is introduced.

Source commands reuse native checked Teacher/playlist choices, retained MP4 multipart upload, YouTube object creation, exact private attachment, media detail and explicit native publication. No fabricated companion is needed to attach a source. The source-only form omits processed/supporting-file fields; optional readings remain in the current Content tools. Recording parts follow the existing five-MiB client sequence. VIDEO_UPLOAD_MAX_BYTES is an explicit profile bound on new-route part offsets/UI selection, not a newly proved global ceiling on all pre-existing native upload paths. Native unfinished multipart/orphan policy and unknown R2 outcomes still require exact activation review; no legacy upload cleanup or guessed first-success clock is installed.

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

The configured Responses request uses store:false, strict structured output, no tools/arbitrary provider URLs and bounded input/output/time. Transcript/quotation instructions are untrusted data, not authority. Provider output cannot choose ids, roles, destinations, R2 paths, retention, publication or verification flags.

The unmounted Workflow class stores jobId-only params and safe state/id/code outputs, with step retries.limit0, bounded runtime and configured success/error history retention. The dispatcher remains tested with a fake Workflow in local suites until exact real runtime/resource verification. No transcript/candidate/key/provider exception is returned to durable history.

## Private review, publication and cleanup

Private candidate output is written under a unique owned immutable key before its pointer CAS. Explicit acceptance rechecks current native source and original base companion/attribution; stale edits conflict and cannot overwrite another Admin draft. The reviewed allowlisted native object is prepared before the pointer transaction. Acceptance changes only the native draft plus minimal committed receipt; previous publication remains. Publish is a separate current native operation.

References/Arabic/meanings, suggested lesson/book matches and audio quotation candidates remain private and unverified by default. An Admin must select/review them and provide the corresponding explicit confirmations. Model text does not prove audio verification, assigned homework or factual correctness. No raw transcript/private evidence/provider metadata is copied into learner content.

Cleanup is separately disabled, bounded to new indexed metadata/new private prefixes with explicit continuation. It closes expired unaccepted work before deleting prepared keys. Minimal committed receipts preserve accepted retained native content even after private job expiry or subsequent draft replacement. No legacy prefix deletion, native FK hold, whole-catalogue scan or claim that all existing native history is bounded.

## Native ingestion/retention and supported inputs

Native Studio uploader MP4 and YouTube recordings are retained under current owning policy; provider/MIME alone does not select this policy. Native uploads.created_at is initiation, and multipart etag is not a whole-file source hash or first-success ingestion certificate. Unknown original successful ingestion remains null; no guessed date, backfill or new academic TTL is imposed.

Academy's separate temporary academic recording policy remains14 days video and one clamped calendar month TOTAL companion/transcript from its original successful ingestion; retries/reprocess/publication never reset it. Its current Core/Admin/coordinator writers stay separate. This Studio source plan neither migrates Academy academic content nor authorises its storage/data changes.

Manually supplied VTT/SRT is supported; exact timestamps are validated without claiming transcript/audio completeness. Existing YouTube/MP4 are the real playable native inputs. A Zoom share link needs an authorised downloadable MP4 and available transcript; no private caption scraping, new Zoom OAuth scope or automatic Zoom ingestion is inferred. Any additional acquisition adapter is a separate concrete gate, not a fake success timer.

## Concrete activation/release gates

Before activating, Deployment needs an exact isolated Development Studio storage/profile/owning schema/R2/Workflow/credential plan, current host/native-browser/Source integration evidence, precise install/config effects, independent review and small enumerated verification budget. Current existing DBs, production and real prepared lessons remain protected.

Required private configuration: an account-approved provider key stored only in the owning private environment, exact accessible model/profile, input/output/time bounds, upload profile, private review TTL and Workflow retention. Historical US$15–20 estimates are not verified price, model selection or a current spend cap. No credentials/hashes/real personal media/transcript belong in public source, artifacts or Drive.

Broad concurrency/growth/privacy/browser suites stay in disposable GitHub/local DB/R2 with mocked provider and zero hosted calls. A later real check must be separately reviewed: one entirely synthetic transcript/job, at most one configured generation request, a small enumerated Admin API sequence and measured actual Worker/D1/R2/provider usage. No inferred savings or billed CPU claim.

Rollback: disable new authorisations/HTTP capability, cancel/drain owned instances and preserve original job/source/expiry/operation floors, native drafts/publication/ids/rights/sync. Do not drop tables/reset metadata to make rollback pass. Deny expired private reads and clean only verified new private objects within the reviewed policy. Existing published content stays under native rules.

Official references already read: Cloudflare Workers best practices; Workflows rules; OpenAI Responses strict structured outputs/model docs. Documentation does not establish account model access or text-model audio/video transcription.

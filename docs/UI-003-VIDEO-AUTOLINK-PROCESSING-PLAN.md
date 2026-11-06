# UI-003 — Reviewable manual video-processing contract (proposal, not installed)

Owner scope: Course Media gets a real Process video workflow: attach the exact source/destination, obtain a timestamped transcript, explicitly authorise each AI run, review/edit an isolated private candidate, and publish through the existing native controls. New comments remain deferred. Development is the owner's next release target; no production activation or DB clearance follows from this proposal.

## Current native integration points

Pinned Studio 3c420f35c30297cfcc41cfab24f030e51bb7831e:
- src/media-attribution.mjs mediaAdmin/mediaGate and attachMedia establish current scoped Admin, exact owning offering, Source/COMMITTED readiness, asset owner, immutable attribution and actual attachment. Current video attachment formats are video/youtube and video/mp4. A Zoom share URL is not an existing playable attachment or a reviewed downloadable object.
- mediaCompanionSave derives RECORDED_MEDIA_SOURCE_V1 from the actual asset id, YouTube id and object hash. Do not accept a caller-supplied source hash as authority.
- src/recording-companions.mjs companionChanges retains the full owning Store.mutate guard and an extra expectedSQL/statement hook. Use the existing native save/publication semantics. The existing function puts its R2 object after the DB commit; a new candidate pointer must instead refer to an already-prepared immutable object. No cross-D1/R2 transaction claim.
- src/database.mjs Store.guard binds the current legacy local session, account/epoch, fresh Admin, owner/generation/readiness and committed handover. Processing must not bypass these or implement a fictitious cross-Core/Admin batch.
- Academy Course Media proxy currently allows a bounded explicit command list and signed proof; processing requires reviewed new narrow commands on that existing proxy, not generic arbitrary forwarding.
- Learner companion responses remain allowlisted. Transcript, source evidence, quote candidates and provider/job metadata must never appear there.

## Proposed source-only implementation

The initial implementation remains disabled until exact storage/provider/config effects are separately reviewed. No existing table is altered, backfilled, relinked, copied or deleted. Proposed new tables live in the SAME owning Studio DB as its native guard/receipt transaction; placing them in a second auth DB would not provide owning-write atomicity.

1. video_processing_sources: generated source id; offering/attachment/asset ids; native-derived source revision; exact native attribution/destination snapshot; original first-successful-ingestion time; trusted retention class and fixed video/companion deadlines; revision; created actor/time. No raw transcript/provider credential is stored in this row. Native ids and rights are not rewritten.
2. video_processing_jobs: generated job/authorisation id; exact source/native revision; current base companion/attribution revision; authorising actor/time; explicit per-run budget/model config version; deterministic workflow id; durable phase/revision; lease/fencing value; provider outcome/usage and safe request id; candidate private key/hash; fixed original expiry. A unique active-source slot prevents concurrent duplicate paid processing. One operation id recovers one authorisation; it does not silently authorise another provider call.
3. video_processing_candidates: job/source ids; private immutable candidate object key/hash; review revision/state; accepted native companion revision if any; original expiry. Candidate edits are separate from the current Admin draft and published companion.
A job row's dispatch-pending phase is the owning transactional outbox for deterministic workflow creation. No routine auth checkpoints or material grant fanout.

Commands: prepare/read source, upload/read transcript, authorise, retry same dispatch, status, read/save candidate, accept candidate, explicitly cancel. Every private metadata/object/read/write has the exact current owning Admin/Source/identity guards. Status is truthful: waiting for transcript/configuration, authorised/dispatch pending, running, private review, provider outcome unknown, failed, expired or cancelled. No simulated processing timer.

Native source attachment must finish before AI authorisation. Existing YouTube/MP4 attachment operations are reused. Authorised Admin-provided VTT/SRT is a valid timestamped transcript source; unsupported/missing/private provider captions stay waiting. Manual Zoom links need a reviewed authorised resolver or Admin-provided downloadable MP4/transcript before claiming actual ingestion. Automatic Zoom ingestion is outside the locked manual scope. No production recordings/transcripts are exported to GitHub/Drive or a provider by tests.

Authorisation uses Store.mutate plus exact source/base-revision predicates and a row/operation receipt in the same owning DB. Workflow creation happens after that commit with one deterministic id; creation response loss is retried with that same id. It never creates a new paid authorisation.

The proposed Cloudflare Workflow stores only job ids and private object references in durable step outputs. No transcript, provider key or full model response in step history/logs. Before a paid request, the job CAS moves AUTHORISED to PROVIDER_IN_FLIGHT under its exact authorisation/fence. Paid step retries are disabled. On a crash/unknown response, an already-in-flight job becomes outcome-unknown and cannot issue another paid request automatically. A new run requires the Admin to explicitly authorise a possible second charge. Deterministic workflow ids or an idempotency header alone are not evidence the provider executes only once.

Text generation uses a configured Responses endpoint/model and strict structured output, no tools or arbitrary fetches. The model cannot select native ids, destinations, grants, R2 paths, retention or publication. Transcript and quoted source are untrusted input. Server validation bounds schema, strings, durations, timestamp order and allowed learner fields; Admin review remains required for factual accuracy, Arabic/references/quotations and assignment evidence. No inference of verified quotation status from model prose.

A prepared output is written to a private immutable R2 key BEFORE a guarded metadata pointer CAS. Stale/lost CAS leaves no accepted candidate and no publication change; bounded cleanup handles orphan private objects. Accepting a candidate rechecks the exact native source and original base companion/attribution revision. If the Admin edited the current draft meanwhile, return a conflict and preserve it. Acceptance saves only an allowlisted native draft. Publication is a separate existing explicit native action. Reprocessing never replaces saved edits/publication automatically.

## Retention

Destination/programme decides policy, not provider alone. Temporary academic video: 14 days; companion/transcript/private candidates and every recoverable version: one clamped calendar month TOTAL from the original first successful ingestion. Exact read-time expiry plus bounded key cleanup; retries, reprocessing and republication never reset the origin. Permanent Studio YouTube remains permanent under its existing policy. Do not adopt that policy for temporary material because it uses a YouTube URL. Academy's separate academic writer/retention authority stays separate; no installation or mutation of its Core/Admin stores is part of a Studio job plan.

## Concrete configuration/effects needing review before installation

- A reviewed owning Studio Feature store/schema installation for the three proposed additive tables and indexes; current existing DBs remain protected. A fresh isolated owner-local Studio environment may be needed for actual Feature testing; do not silently reuse active production/development storage.
- One StudioVideoProcessing Workflow binding/class with deterministic instances, default off.
- A private R2 prefix in the correctly isolated existing Feature CONTENT binding, guarded API access only; no public asset route, public transcript or server permission cache.
- One private provider credential in the owning private environment, an exact approved model/config version and per-run budget limits. No key in browser, source, artifacts or Drive. No current provider key/model access or USD/month budget is assumed.
- Bounded expiry cleanup dispatch/ownership must be reviewed; no new Schedule/DO/resource is installed by a source-only PR.
- Zoom/caption acquisition is a concrete unresolved adapter gate, not permission to scrape private resources or automatically export recordings.

Rollback: stop new authorisations/default off; preserve monotonic job/source/expiry/receipt metadata, existing native attachments/drafts/publication, ids/rights and current sync. Do not drop job tables or shorten/reset floors to make rollback green. Cancel/drain instances; deny expired reads; delete only verified private processing objects under bounded retention. Any existing published companion remains under native publication/retention rules.

## Offline tests and later small verification proposal

All broad/growth/concurrency suites run in disposable GitHub with synthetic local DB/R2/provider mocks and zero hosted Worker/D1/provider calls. Required negatives: wrong account/offering/asset/destination, stale Source/generation/fresh-Admin/handovers, duplicate authorisation/concurrency, dispatch ACK loss, provider success followed by lost HTTP/worker crash, source change, mid-run Admin edits/revocation, partial/invalid/hostile transcript, invalid model schema/timestamps, private evidence/quote exclusion, exact expiry/clamped calendar boundaries, cleanup of candidates/versions/orphans, unchanged current publication and separate explicit publish.

A real activation check is a separate exact reviewed plan: one entirely synthetic transcript/job, at most one provider generation request under a configured token bound, a small enumerated Admin API sequence, zero real/personal recordings and measured actual provider/D1/Worker/R2 usage. No request is made until its credential, exact storage/config plan and budget are cleared. This is a proposed bound, not an executed receipt or server billing hard cap.

Official implementation references already read:
- https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- https://developers.cloudflare.com/workflows/build/rules-of-workflows/
- https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses
- https://developers.openai.com/api/docs/models/gpt-6.1-sol
Model docs do not prove this account has access, nor do they make a text model an audio/video transcriber.

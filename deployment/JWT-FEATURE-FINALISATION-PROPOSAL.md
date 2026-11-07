# Source-only owned Feature cleanup proposal

This candidate is for independent Root review. It has no live CLI, private-environment job, dispatch, automatic promotion, merge or execution authority. Its workflow runs only local Node mocks and existing local schema fixtures on GitHub. No Cloudflare, Worker, hosted database, R2 or provider request is performed by those tests.

## Observed prerequisite

The completed four-GET diagnostic run 42330165427 / artifact 13557097809 has ZIP SHA256 b77f86ee9790c99c0b5cb498f76a1a66d5f17f41bb0d3cb7f4c02f25d366990c. Main version is 5701fba2-80f2-40d6-adff-a86fa4f613bc (different from the last ACK); coordinator 4704b2cc-c111-4e5b-9f8b-887bd38db650 equals the final ACK. Both source/owner markers match original c660e3813908127561ad454ab503f9f66fa6d700 / 42233937167-1. Main is metadata-PAUSED with all four JWT flags zero. Both temporary setup secret NAMES remain. This sequential snapshot is not a continuing ownership lease, proof of code bytes or a completed installation receipt.

The original installer artifact 13510608672, SHA256 016a451ebf42005b77167b99abd8909a58dde828db8f896e6cd728d445efd802, retains an INSTALL_STOPPED result. Its acknowledged final coordinator implies prior schema and seed checks passed in the reviewed controller flow. That is historical source/control-flow evidence, not a new current table count, storage inspection or reconstructed cleanup receipt. The proposal does not replay any of those phases.

## Exact proposed effect

No Worker code upload, config overwrite, coordinator deployment, Wrangler call, namespace operation, DDL, seed, account creation, PIN/key generation, credential rotation, R2 access or JWT activation.

The only proposed hosted mutation is ONE PATCH to the existing c9 account feature_worker /secrets-bulk endpoint, with exactly:
{"secrets":{"JWT_FEATURE_SETUP_PIN":null,"JWT_FEATURE_SETUP_AUTH":null}}

All other secrets, public signer, original markers, native and JWT bindings must match the complete expected metadata profiles before and after. Original public key metadata comes byte-for-byte from the original public manifest; no private key is read or generated. Native/PIN secrets are not included in the PATCH. All existing database IDs, rights, data, copies, ownership and sync are preserved.

The metadata templates are deliberately not deployable Wrangler configurations and contain no fabricated VERIFIED schema/installation receipt. A local independent comparison checks them against the previously reviewed renderCandidateConfigs output. Their base configs and native initialisation record are pinned by Git blob SHA.

## Readback correction and retained limits

Cloudflare GET /settings documents an Assets binding, not a mandatory top-level assets.config:
https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/

The shared verifier retains exact binding counts/names/types, IDs, expected plain-text values, secrets by NAME, source/owner, flags, namespace and observability fences. If optional asset configuration is returned it remains strictly checked. Its absence is accepted as unobserved, never labelled proof of routing/code. Unexpected assets on a no-assets profile remain forbidden. D1 database_id and legacy id are normalised, with conflicts rejected.

GET /versions/{id} likewise does not promise asset config, so no speculative version endpoint request is proposed:
https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/get/

Cloudflare documents null-only bulk secret deletion as one new version; omitted names remain unchanged:
https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/bulk_update/

Existing routine release-transport also imports assertRemoteProfile. The shared source correction is necessary there, but this is not routine activation acceptance: preserve a later actual-release-caller response-shape regression and an explicit compiled/upload versus observed routing policy before activation. Do not repeat activation against the old guard.

## Finite proposed usage

Already spent explicit GET attempts: original installer36 + diagnostic4 =40, under the ORIGINAL hard60.

The candidate's full successful path is at most18 additional metadata GET attempts: initial version/settings/subdomain/schedules for both scripts8; last exact version+settings check for both immediately before mutation4; post-PATCH version+settings4; final version fence2. Maximum cumulative58, leaving2 unallocated attempts, not a new allowance. One null-only PATCH, zero retries; this completes at most2 total original-installation secret bulk attempts including the prior private ingress.

Then at most3 unauthenticated, credential-free GET attempts to the same Feature origin only:
- /__jwt_feature_release
- /internal/feature-jwt-setup/status
- /internal/feature-jwt-setup/schema-status

Each must return exactly503, no Set-Cookie, no-store, nosniff, and an allowlisted small {"code":"FEATURE_JWT_UNAVAILABLE"} body. There is no login, signed credential, API session, material read or app browser load. The prior original installer had4 schema/seed HTTP attempts and1 ordinary PAUSED probe; adding these3 would use the original8-attempt installer HTTP budget, not renew it. Probe attempts can invoke Workers. Expected D1/R2 calls are zero from the reviewed disabled entry; hosted billing/rows are not measured or hard-capped.

A full successful LOCAL mock path therefore has22 outbound mock attempts (18 metadata +1 PATCH +3 probes). Those are local injected calls, not observed hosted usage. Partial/failing paths record actual attempts and stop, with no retry or recovery overwrite.

## Stop and authority boundary

The adapter requires a fresh callback before every metadata request, the mutation and every probe. Future execution wiring must independently enforce exact Root approval/effects, canonical/Feature source pins, single dispatch/attempt, and the exclusive Feature lease. Such live wiring is intentionally ABSENT from this source-only candidate. Passing tests must not be treated as permission to supply a token manually.

Immediately before deletion both current versions must equal the observed review pins and both FULL metadata profiles must match. After the acknowledged PATCH the complete no-temporary-secret profile is rechecked; the coordinator must remain pinned, and final versions must remain unchanged through the probes. The source records a newly observed main version, not an assertion of atomic adoption. Cloudflare's endpoint has no documented compare-and-swap precondition: the read/write race is not eliminated, and the exclusive lease remains necessary. Any drift, withdrawal, unknown PATCH response or failed probe stops without an automatic further write or replay.

Output can establish only OWNED_PAUSED_CLEANUP_OBSERVED in its explicit scope. It retains codeContentVerified:false, assetRoutingReadbackVerified:false, metadataObservationsAtomic:false, activated:false and notActivationReceipt:true. It emits no verified-paused-receipt consumable by the existing activation gate. Original seed verification, full installed content/routing, activation and final application smoke remain separately reviewed gates.

No Drive upload is proposed or performed by this candidate; the existing report-delivery hold remains. The owner should not be asked to approve an unprepared action. Root must first receive this exact source/evidence/effects package and define the concrete next authorised execution scope.

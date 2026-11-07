# JWT Feature read-only final-fence proposal

SOURCE ONLY. No hosted execution, dispatch, private environment or token access is supplied. Nothing here promotes Feature or changes canonical. A later wired immutable candidate, exact protected approval, fresh source/effects/one-attempt checks and finite exclusive lease need separate independent review. The prior PR14 diagnostic is spent and cannot be replayed.

## Evidence reused

PR14 run42358703100 attempt1 is independently accepted. Artifact13569310152 ZIP SHA2564e90969bf24641e523b2ea2c66c9aa31d4ad22de9e091fdae445a4e8300dba60 contains the strict redacted receipt copied byte for byte here, SHA256da4ce33565a9001405f6256e854e28afc63b0f5a6d2b689259db6277393dad13. This is evidence, not an installed schema, cleanup, source ownership or activation receipt. The helper validates its bytes and original bounded shape before token access.

MAIN settings returned56 expected bindings, original c660e3813908127561ad454ab503f9f66fa6d700 / owner42233937167-1 agreement, the existing public signer metadata and exact native/fresh D1/R2/DO bindings, six required secret NAMES/types and no two temporary setup NAMES. No secret value/private-key pair was read or verified. assets.config was absent, which is neither a routing failure nor routing proof. The deployed version4c955445-ff00-4713-8b35-2a177a752328 was newly observed after the acknowledged secret-only PATCH; it is not silently adopted as owned code. Historical cause remains unknown.

The last reviewed coordinator version is4704b2cc-c111-4e5b-9f8b-887bd38db650. Expected coordinator metadata reuses the accepted immutable profile builder: exact source/owner markers, old retained aliases and new JWT-only database/namespace aliases, run/domain flags, no signing or temporary secret bindings, no unknown/extra/duplicate binding, schedule/URL state NOT newly checked here. This proposal does not repeat old address/schedule reads.

## Exact original budgets and proposed order

Consumed explicit provider GET attempts: installer36 + first diagnostic4 + stopped cleanup14 + PR14 diagnostic2 =56. Four remain from the ORIGINAL60; no reset, new reserve or hidden extra fetch. This proposal permits at most these four GET attempts:

1. MAIN deployments: pin the PR14 observation reference before any app request; mismatch stops after one read without adoption.
2. Coordinator settings: exact accepted coordinator profile and ownership-marker comparison; mismatch stops before probes.
3. MAIN deployments, after the three paused responses: equal the same observed reference.
4. Coordinator deployments: equal the last reviewed coordinator version.

Between steps2 and3, propose exactly the three already reviewed credential-free GETs on https://feature_worker.maktab4life.workers.dev:
- /__jwt_feature_release
- /internal/feature-jwt-setup/status
- /internal/feature-jwt-setup/schema-status

The installer used four schema/status/seed/status HTTP attempts and one ordinary probe; stopped cleanup used zero paused probes. Thus five of the ORIGINAL8 installer/cleanup HTTP attempts are consumed and precisely three remain. These are not new schema/seed calls or an eight-call application smoke allowance. A failed/unknown attempt is consumed. Require503, exact {code:FEATURE_JWT_UNAVAILABLE}, no Set-Cookie, Cache-Control no-store and nosniff, bounded1024-byte body. No credential/cookie/body is sent, redirects are errors, no retry. The actual reviewed paused source's outer disabled-flag guard precedes data/asset access; this is source-derived expected zero D1/R2 cost, not deployed-code or hosted-billing proof.

This four-read allocation deliberately reuses the actual MAIN settings observation instead of rereading it. Coordinator version is sampled only at the final step, not before probes. MAIN has preprobe and final version samples. These sequential samples do NOT atomically bind any settings to a deployed version or prove absence of concurrent changes. The shared finite exclusive lease is necessary and cannot make the provider supply CAS. No fifth GET is available for another profile/version/address/schedule/secret read; no code/key-value access is proposed. A changed state stops the finite sequence rather than inspecting until green.

## Fences, receipt and limits

An injected fresh protected-approval/source/effects/one-attempt/lease gate must run before obtaining the credential, before EVERY fetch and after the last fence. The source-only controller requires an explicitly injected transport, token getter and save callback; there is no default fetch, CLI or execution workflow. Local test fetch is forbidden except the supplied mock. A later wiring proposal must enforce real current canonical/head/approval, no prior attempt and competing-run checks; passing these source tests does not install them.

The saved receipt persists BEFORE each attempt, after each observation and on failure. It contains bounded endpoint names, UUID versions, numeric provider codes, match booleans and fixed categories only. Provider/plain-text assertion details, bodies, headers, cookies, credentials and unknown binding names are never saved. Response caps are1MiB provider/1024bytes probe. Failure, withdrawal, ambiguity, body/transport loss or changed version stops with the actual partial counts, no retry or overwrite. A successful scoped receipt still fixes cleanupVerified, mainOwnedVersionAdopted, futureWriteClearance, activated, codeContentVerified, keyMaterialVerified, assetRoutingVerified and atomicity claims to false.

Any future write is blocked pending an exact independently reviewed ownership/version/effects plan. The changed MAIN version, matching marker strings and required secret names are not sufficient deployed code/key provenance or new write authority. No unknown version is adopted, no key generated/rotated, no temporary-secret deletion replayed, no SQL/schema/seed/R2/config/resource write or production/existing-DB operation occurs in this candidate. Tests cover only the new adapter's bounded flow, strict comparison reuse, failures, partial receipts and privacy; accepted broad application/auth suites are not rerun.

## Review correction: evidence semantics and synchronous persistence

Captured provider observations must carry successful HTTP status and the exact step's version/reference match or coordinator-profile match. Captured probes require503 and responseMatches=true. Partial outcomes have their own status/null/match semantics, cannot be followed by later work after failure, and determine every summary match flag. The receipt cannot claim success from unrelated booleans or a valid-looking but wrong UUID.

Persistence is explicitly SYNCHRONOUS ONLY. Native async functions and any ordinary wrapper returning a Promise/thenable or other non-undefined value are rejected. Promise rejections are consumed without waiting or continuing; a failed writer is never retried and no later token/fetch/success return follows. The exported createSyncFinalFenceReceiptWriter uses only bounded64KiB JSON, mkdirSync and writeFileSync to a fixed filename under an absolute directory; it returns undefined. Its runner-temp binding will require the later wiring review. There is no added asynchronous save interval between the fresh gate and fetch. A focused disposable-GitHub test uses the actual synchronous writer and reads each complete saved snapshot before token access/every mocked fetch.

An attempt is conservatively reserved in the pre-fetch receipt. If that synchronous write fails before transport, the in-memory stopped count may include the reserved but unissued attempt; it is never recouped or reused. The persistence-failure error explicitly distinguishes the unsaved stopped result; it does not claim that a final receipt successfully reached disk. This can overcount budget use, never expand either original cap. No hosted request is made by these proof tests.

# Protected execution wiring for the reviewed cleanup

This is the narrow execution-wrapper child of source-only candidate460a0777d127b6f4608c9a24fe51a719721a605d. That candidate's six files and49-case evidence remain unchanged. Its effects JSON describes the reviewed source-only parent; this wrapper does not convert that historical statement into execution authority.

Validation-branch pushes run only the new wrapper tests with local GitHub/Cloudflare HTTP mocks and no secrets. Source preparation does not publish an approval record, create a PR, merge, promote Feature, dispatch cleanup, read a token or make a hosted request.

## Exact protected authority chain

A later component PR must bind feature_base_sha=a017f2f30324162e2946b8a32d494fdc10a5d27e and the exact reviewed child as feature_sha, kind=component, target=feature, contains_jwt=true, database_changes=false, version110.36. Existing protected optimisation comment/status/normal-merge verification must pass; canonical must still equal that merge.

Besides existing exact head/target/no-DB fields, the immutable approval comment must contain exactly one of every field returned by scopeLines(feature_sha):
- feature-finalisation-source: exact child SHA
- feature-finalisation-effects-sha256: exact SHA256 printed by source proof
- feature-finalisation-effects: two-temporary-secret-deletions-only
- feature-finalisation-explicit-gets:18
- feature-finalisation-prior-gets:40
- feature-finalisation-hard-get-limit:60
- feature-finalisation-paused-probes:3
- feature-exclusive-lease:jwt-feature-owned-finalisation-20261107a

The serializer uses one space after each colon; use scopeLines output rather than copying prose typography. Effects bytes also pin to reviewed parent Git blobde6c0157ee5ea6495d73301d527a34c4d855026e. Edited effects cannot gain authority by merely recomputing a hash.

Promotion validates exactly ten cumulative files from a017 (six parent plus four wrapper), rejects renames/deletions/additional application changes, rechecks canonical/approval/Feature pins, and permits only a non-force feature-preview fast-forward. It never dispatches cleanup or accesses a Cloudflare credential.

## Private execution boundary

Cleanup requires separate explicit workflow_dispatch inputs approval_pr and approval_merge_sha on feature-preview. Public validate completes before environment feature. Inside the private job the same gate runs again without a Cloudflare credential; only the execute step receives CF_FEATURE_DEPLOY_TOKEN. No PIN/other Feature secret, npm, Wrangler, initializer, schema, seed or key generation is added.

The executing run must match exact workflow path/ref, repository/head repository, source/branch, workflow_dispatch event, MaktabForlife actor, running status and run_attempt1. The complete dispatch list must contain only that run. ANY prior dispatch to this cleanup workflow, including failed or another source, blocks execution: a new source cannot reset the budget. Job-only/workflow reruns are denied.

The workflow shares the existing feature-isolation group keyed by github.ref, with cancel-in-progress:false, with all known Feature writers. The approved lease field and complete listing of all documented active Actions statuses also exclude other queued/running/waiting Feature runs. Every metadata request, mutation and probe rechecks local clean HEAD, exact effects bytes, fresh canonical/comment/status/source pins, run identity/single dispatch and absence of competing Feature runs. GitHub metadata checks consume no Cloudflare allowance.

This is an Actions mutex plus an explicit Root coordination lease. It is not Cloudflare CAS and cannot detect a separate human bypassing that lease in the dashboard. Sequential-observation/read-write race limits remain; no atomic ownership claim is made.

## Effects, budgets, failures and receipts

The reviewed parent controller retains exact complete prewrite5701fba2/4704b2cc versions/profiles, one2null-only secret PATCH, post-PATCH profile/coordinator/final-version fences and three small PAUSED probes. No main/config/coordinator/namespace/DB/R2/credential/activation effect is added beyond deleting those two secret bindings/new main version.

Actual spent budget remains40GETs. Proposed maximum18more→58 under ORIGINAL60, onePATCH (two combined with original ingress) and at most3PAUSED probes (eight combined original schema/seed/probe attempts). No budget reset, retry, discovery, speculative version GET, automatic overwrite or setup replay is added.

Saved receipts pass a strict field/type/value/count allowlist. Unknown fields, altered accounting, fake code/routing/activation proof, inconsistent closure or malformed versions fail. Only one named RUNNER_TEMP JSON receipt is uploaded; raw provider responses, arbitrary exception strings, credentials and wildcard artifact paths are excluded. Unknown PATCH ACK leaves an incomplete redacted result and stops. Output remains notActivationReceipt:true and cannot fabricate the receipt consumed by existing activation gates.

Before token execution Root must review this exact source/evidence, issue concrete protected approval and retain the exclusive Feature lease. None is executed by this source preparation. Later activation still needs actual release-caller shape regression and routing/code/application proof policy. No broader suite or acceptance-record loop is requested.

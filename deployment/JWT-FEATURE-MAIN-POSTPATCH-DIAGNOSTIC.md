# MAIN-only post-PATCH diagnostic proposal

SOURCE PREPARATION ONLY. No token, promotion, dispatch or hosted read is performed by this preparation. A new exact protected approval/source/effects/lease record is required before execution.

## Known boundary and finite scope

The single approved cleanup run42342137914 / artifact13562670537 (SHA256f2edaacf595235f0eb91e30a9de155409bfef5b4f2b479481659b8ced5af0345) stopped with one provider-acknowledged PATCH, cleanupVerified:false, observedAfterPatch:null and zero probes. Its14GETattempts plus prior40 total54 of the ORIGINAL60.

Source reaches eight initial and four last-prewrite reads, acknowledges the PATCH, then attempts MAIN deployments/settings. Reaching attempt14 does not prove the settings request, body, sanitisation or profile assertion succeeded. No raw post-settings payload was saved. The historical failure cause remains UNKNOWN; do not infer a particular mismatching field or actual secret removal.

This refinement proposes only TWO fixed GET attempts on existing feature_worker:
1. /workers/scripts/feature_worker/deployments
2. /workers/scripts/feature_worker/settings

54→maximum56, reserving FOUR original attempts for later separately reviewed fences. No coordinator, versions/content/secret endpoint, Worker HTTP, SQL, code/config/secret mutation, namespace/resource change, retry, key generation or activation. A transport/provider/body failure or withdrawn guard stops without retry; profile mismatch is safely retained rather than thrown away.

## Redacted observation contract

The raw response is consumed only in RAM, within a one-MiB bound. Deployment output retains at most four validated version IDs/percentages and comparison with the pre-PATCH reference5701fba2. A different ID is not adopted as owned. The deployment observation does not atomically bind the later settings response.

Settings output retains only known binding NAMES and allowlisted types, known secret-name presence/type, source/owner match booleans, bounded counts and at most64 field/type mismatch labels. No plaintext values, assertion diffs, raw provider messages, secret values, code content, attacker-controlled binding names or actual credential hashes are emitted. D1 aliases are compared in RAM; conflicting aliases receive a safe category. HTTP failures retain only bounded status/numeric provider codes. Raw settings are never saved.

The expected post-cleanup metadata template is the unchanged reviewed compiler from6b21: exact native/JWT IDs, existing public signer, source/owner, PAUSED/fourzero flags, native keys and requested absence of ONLYthe two temporary secret names. The comparator retains strict field/count/type semantics. Optional undocumented assets.config is checked if returned; its absence does not claim code/routing proof.

Every partial receipt is validated against a strict field/type/value/name/category allowlist before save. A mismatch labels the CURRENT observation, never retrospectively identifies the lost historical failure. Even a complete match keeps cleanupVerified:false, activated:false, ownedVersionAdopted:false, observationsAtomic:false and deploymentVersionBindsSettings:false. This is not a cleanup, installed-code, routing or activation receipt.

## Protected wiring

The new purpose is jwt-feature-main-postpatch-inspection-20261107a. It is separate from the failed one-shot modifier and cannot re-enter it. The current cleanup source6b21 remains frozen; this child adds only diagnostic/effects/proof files.

The guard retains the reviewed normal-merge/headtree/status/comment hash, exact source/effects bytes, version110.36, targetFeature/noDB effects, single dispatch/attempt across all heads, exact workflow/ref/repository/actor, complete activeFeature-run exclusions, local cleanHEAD and shared Feature mutex. It invokes fresh protection before EVERYrequest. Remote source/owner/version are observed and compared, not converted into write ownership. Root's exclusive lease and the Actions mutex do not provide server CAS or detect a manual dashboard bypass.

Public source validation occurs before the Feature environment and repeats before the sole CF_FEATURE_DEPLOY_TOKEN step. No PIN, other credentials, npm, Wrangler or initializer is used. The only Cloudflare adapter method is GET and only the two literal paths are reachable. Promotion, if separately approved, is public-source-only/nonforce and NEVERdispatches.

A future approval must use the exact nine lines returned by scopeLines(selectedSource), binding source, effectsSHA256,2GET/prior54/hard60/reserved4/zeroWorkerprobes/nohostedwrites and this purpose's exclusive lease. The machine effects file pins those numbers; neither a new source nor a rerun renews the budget. Output is one named main-postpatch-metadata.json artifact with no wildcard or raw private logs.

No actual read is authorised by this source handoff. Root must first independently review complete immutable code/effects/affected proof and prepare the exact guarded approval. Other canonical merges/competing Feature operations remain held for the finite diagnostic/recovery decision. Existing production/store/model/resource holds and the separate UI source preparation remain unchanged.

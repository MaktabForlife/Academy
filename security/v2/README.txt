V111 MILESTONE 2 — ISOLATED SECURITY FOUNDATION
=============================================

This directory is a prepared backend foundation. It is not an activated login
system, a complete three-app browser release or proof of production readiness.
Independent milestone 2 review and the native integration gates remain pending.
Application AI/transcription/providers stay OFF. Deployment approval is PENDING.

CANONICAL PUBLIC ORIGINS — OWNER OVERRIDE, 19 NOVEMBER 2026

Academy  https://ummabbadacademy.app
Studio   https://worshipuponbaseera.ummabbadacademy.app
Hifz     https://mahadarwa-hifz.ummabbadacademy.app

These override the shorter studio./hifz. names in the earlier revision 7 hosting
table. Provider aliases ummabbadacademy.maktab4life.org and
ummabbadacademy.hifz-helper.app are routing/service identities, not alternate
browser JWT issuers, callback origins or cookie domains. The working source
branches are not asserted to be live production just because the JWT host family
uses the production environment enum. Feature remains excluded.

SELECTED NATIVE SOURCE BASES

Academy studio_dev       15d1a1e5d96e831af8946a59eb70f9ce97023cfe
AcademyStudio studio_dev 9a8c117e9279a2b67e62eb044be4da989db4a096
Hifz main               ba0ea53f23b933b0c175c87fe41788df74afbb2f

Common modules must be byte-identical in each app's security/v2 directory.
native-adapter.mjs and native-authority.json remain app-specific. Each own-app manifest is inactive.

MODULE RESPONSIBILITIES

codec.mjs: strict JSON, canonical bytes, opaque credentials, scoped fingerprints,
owner vectors and low-level cryptographic helpers.

tokens.mjs: separate API/admission/unlock profiles, exact issuer/audience/origin
checks and own-host cookie rules. Access validation is at most 900 seconds.
Original parent expiry remains 604800 seconds; renewals never slide it.

store.mjs: first-primary reads and guarded owning-D1 transitions. Failed guards
roll back operation/history/publication effects. A child is not the canonical
owner of Academy account-security cutoffs.

cache.mjs: immutable rights and durable app/session/resource controls are
different storage classes. Mutable controls are read on protected requests,
updated conditionally, and protected from ordinary eviction/cleanup. ACTIVE
control loss fails closed; restoring/recreating an old allow is forbidden.
Verified immutable rights are recursively frozen and memo entries carry private
provenance. App/resource controls require an owning committed source target;
cache publication cannot create that authority. Mutable controls are capped16KiB;
a larger outgoing projection requires explicit partitioning before publication.
Combined incoming Cookie headers are capped8192UTF8 bytes with HTTP431.

publication.mjs: exact typed restrictions, affected-SID worksets/watermarks and
publication receipts. A larger revision alone is not proof that a particular
target is covered. APPLIED waits for every required live combined-session barrier.

events.mjs, outbox.mjs and snapshot.mjs: exact authenticated service messages,
recipient streams, durable retry/ACK and coherent reconciliation. A batch HTTP
200, highest-seen cursor, last page or source watermark is not application ACK.
Unknown epochs need registered genesis/bridge evidence. Delivery uses durable
per-stream eligibility and fairness, with60s exponential retry capped900s. Partial snapshots cannot
enable authority or erase an existing floor.

capture.mjs and native-authority.json: source-specific authority-field capture,
native schema checks and Core/Admin fence integration. Private draft/display or
journal writes do not automatically imply active permission changes. Keep native
IDs, acquired rights, ownership, source provenance and actual SQL guards.

ceremonies.mjs: Academy-only PIN verification reservations/budgets/pause ladder,
fixed one-use S256-bound handoffs, and guarded local grant consumption. Native
credential verification, source-attested addresses, authorised reset composition
and native mapping/resource-transition plans are required adapters. No child
gets a PIN verifier. Busy/fault/rate rejection is not a wrong PIN. Opening a child
or copying a cache record cannot renew its inactivity/validation clock.

policy.mjs: owning policy/inactivity mechanisms. Existing deadline/lock is tested
before applying a changed duration or crediting qualifying activity.

ADDITIVE SCHEMA — RECIPES, NOT EXECUTION AUTHORITY

All schemaRecipes in schema-bundle.mjs are explicit exported additive recipes
for the existing owning databases, including recovery, delivery and issuance
floor/committed-control foundations. Module import does not apply them.
The preflight compiles these recipes only into a fresh :memory: SQLite store.

Do not apply them to hosted or existing local databases under source preparation.
Reconcile actual installed schema, protected triggers, native serializers and
owner rules first. No drop/recreate, account copy, ID/PIN rewrite, real database
restore or security-prefix restore is part of this package.

PrimaryStore requires first-primary. One D1 batch is one database transaction;
it does not make Academy Core and Admin one transaction. Native Core COMMITTED
is the authoritative mixed-store boundary. Retain the existing guarded Admin
undo before Core commit and finish/recovery after Core commit. Do not bypass
pending fences or reinterpret old V1 authentication records as V2.

LOCAL SOURCE-ONLY PREFLIGHT

Use Node 24 with built-in SQLite. For Windows/UNC tests invoke each test file
directly; Node's --test UNC glob discovery is unreliable in this environment.

Example after common-code mirroring and source-manifest preparation:

  node Academy/tools/v111-foundation-preflight.mjs \
    --workspace-root <parent-containing-Academy-AcademyStudio-Hifz> \
    --source-manifest <combined-source-manifest.json> \
    --git-evidence <optional-WSL-Git-receipt.json> \
    --run-tests --output <new-evidence-directory>/preflight.json

The supplied manifest uses schema 1, deploymentApproval "PENDING", and exactly
three apps. Each app entry has app, pinned base, optional head and files with
repository-relative path and SHA256. Cover all common modules, the inactive
config, native registry and Academy test files. The manifest need not hash
itself or contain the commit that encloses it. Optional head pins are checked
against the actual local checkout; source-byte hashes cover dirty preparation.

Windows Git may not follow a Linux linked-worktree .git pointer. This is reported
NOT_VERIFIED, not silently accepted. A supplied WSL read-only Git receipt is
hashed and reported separately for Root review. It uses schema 1,
scope "WSL_GIT_LOCAL_READ_ONLY", recordedAtUtc, and apps entries containing app,
base, commit, branch, workingTreeClean and pushesDisabled.

Exit 0 means requested source-only checks passed; 1 means a failed check; 2 means
source verification remains pending. None is deployment approval. Evidence files
use exclusive creation, and test logs redact JWT/opaque credential forms.

The manual-only v111-foundation-check.yml workflow is build/test/source-only:
contents:read, pinned actions, exact Studio/Hifz commit inputs, no app credentials,
provider client, push, deployment or release dispatch. It requires the combined
manifest at Academy/security/v2/source-manifest.json. It has not been dispatched.
Its existence does not neutralise historical automatic/Feature workflows.

ACCEPTANCE AND DEPLOYMENT GATES

Synthetic SQLite/R2 models show local protocol/transaction/failure behaviour.
They do not establish actual Cloudflare conditional-write behaviour, provider
latency/cost, browser installation races, media-player behaviour or a native
three-app release. Report authentication SQL separately from business SQL;
permission-cache hits alone do not prove the proposed read/cost budget.

Native source extractors and guarded PIN/mapping helpers are included here.
Milestone 3 must wire them into native HTTP routes/relays/CSRF/CSP,
Studio's new-host wrapper allowlist, and Hifz's same-host Worker Static Assets
frontend/API, plus combined sign-in/admission/refresh/unlock/logout/permission/
switch/media flows. Keep AI off and saved native data/rights unchanged.

Coordination's hosting receipt at
C:/maktab/hosting-readiness/jwt-hostnames-20261119-r1/completion.json reports
both selected SaaS hostnames and SSL active. That closes the reported hosting
setup gates only. The unchanged Studio application still needed wrapper support
(HTTP 421); Hifz's API-only HTTP 401 was not itself an authentication defect.
Revalidate the receipt before later activation. This source preflight makes no
public request or provider mutation.

Before activation: finish independent review/native acceptance; pin matching
source/build/config/key/resource manifests; verify clean pushed source; inspect
all relevant automation; confirm recovery compatibility; then obtain separate
owner deployment approval. No checkpoint change or automatic database restore.
The preserved pre-JWT snapshot is an application fallback, not proof that an old
application can safely enforce V2 security state.

ADDITIONAL REVIEWED FOUNDATIONS
issuance-floors.mjs requires live complete native vector guards, known typed
restrictions and coherent applied policy within the authority-issuing D1 batch.
Received INVALIDATE cannot be cleared by an unchanged local vector or declared
remote revision: exact guarded native business-projection provenance is required.
Concrete DENY permits only its remaining actions. Native timed-right bounds
clamp every issued validation deadline, including fallback.

policy-coverage.mjs recognises an old policy target only through complete
authenticated history, applied family certificates and actual published receipts.
A later longer duration cannot undo a prior elapsed lock. Future Academy
PIN-unlock integration must emit the equivalent durable unlock certificate
recognised by policy coverage; child ceremony certificates are included here.

instrumentation.mjs separates authentication/business SQL, actual/synthetic/
unavailable metadata, R2 controls/payloads and wall latency from sourced CPU.
Synthetic SQLite trigger fan-out receipts do not establish Cloudflare billing.

Recovery adapters, real native projection/provenance intake and hosted resource
bindings remain explicit integration gates. No source preparation can be treated
as approval to run migrations, seed a hosted namespace, generate/install live
keys, restore security objects, start scheduling or activate the V2 runtime.

Control semantic source targets belong to (app,environment,purpose), independently
of physical R2 generation. An approved fresh namespace can reuse current primary
semantics and immutable source receipts. Old R2 lifecycle keys remain terminal;
this does not reset genesis, remove withdrawals, restore old objects or release
the explicit recovery ingress/approval/drain gate.

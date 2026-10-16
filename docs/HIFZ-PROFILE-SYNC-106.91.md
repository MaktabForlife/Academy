# V106.91 — Development Hifz profile and PIN-reset delivery

Academy is the authority for linked Hifz users' name, login ID, WhatsApp number, Hifz role and active status. Hifz keeps its own credentials and journals. Ordinary Hifz requests do not call Academy.

## Development database changes

Migration `0028_hifz_profile_sync.sql` adds one `hifz_profile_sync` row per linked Academy account. It stores the permanent account ID, source/delivered revision, PIN-reset version, retry count/time, last delivery error code and update time. It contains no PIN or credential hash. The pending index avoids scanning delivered rows.

A projection view reads the existing accounts, contact details and effective roles. The `HifzProfileActivityKey` setting identifies the verified Hifz Program. Global Admin inherits Hifz admin; otherwise Program Admin takes priority over Teacher, then Student. A disabled account, disabled Hifz Program or revoked Hifz access produces an inactive Hifz profile. Existing source table definitions and records remain intact.

Triggers enqueue changes inside the transaction that changes profiles, contact details, roles, role evidence/mappings or Program availability. Rolled-back saves leave no delivery behind. The credential trigger records a reset when `pin_setup=0` and `credential_epoch` increases; setting an Academy PIN does not copy it to Hifz or cause another reset.

## Delivery

Successful profile/management saves use `waitUntil` for up to eight pending snapshots. The existing 15-minute recovery schedule drains up to 40. No additional cron is created. A five-second delivery timeout, durable retry metadata and exponential backoff keep Hifz outages out of Academy's save response. Failures are retried by the existing schedule; newer profile changes immediately become eligible again.

Each HTTPS request carries at most eight profiles, a target and timestamp, and an HMAC signature over its exact body. `HIFZ_PROFILE_SYNC_SECRET` is a Worker secret shared only with the development Hifz receiver's `ACADEMY_PROFILE_SYNC_SECRET`. Nonsecret target settings are in the development Worker configuration. Logs and queue errors contain status codes rather than profile data or credentials.

Hifz migration 0032 adds permanent cross-application links and a credential epoch. Its receiver rejects unknown profile fields, invalid signatures, wrong targets, expired requests and conflicting identities. An atomic batch applies only newer revisions. Duplicate or delayed deliveries cannot overwrite newer data or clear a newly chosen PIN. An Academy reset clears the independent Hifz PIN and lockout and revokes Hifz sessions; the next Hifz PIN requires confirmation.

## Rollout and verification

1. Export both development D1s privately and rehearse the complete operation against restored copies.
2. Apply additive migrations 0032 in Hifz and 0028 in Academy; configure development secrets only.
3. Deploy Hifz V4.2.15.29 and its frontend to `dev`. Seed the reviewed exact-ID links and apply the atomic Academy-ID rekey through the trusted D1 binding.
4. Seed the 34 reconciled Academy account IDs, deploy Academy V106.91 from `development`, and deliver their initial snapshots. Verify all revisions, profile fields, existing hashes, journals and foreign keys.
5. Verify live changes, reset/confirmation and replay using only a disposable development test account, then remove it.

The rehearsal against the 16 October exports preserved all Academy records, all journal contents and eight existing Hifz PIN hashes. All 34 active Hifz profiles matched Academy; their roles and statuses were unchanged. Five unmatched inactive legacy profiles retain their keys and history. Production Hifz code and databases are outside this rollout.

Regression coverage includes transactional enqueue/rollback, coalescing, signed field allowlisting, outage/retry, concurrent changes during delivery, reset versus PIN setup, inherited Global Admin authority and role revocation. The Hifz receiver suite covers ordering, replay, credential/session revocation, conflicts and confirmed PIN setup.

## Applied development acceptance — 16 October 2026

Both additive migrations and the atomic 34-profile permanent-ID rekey are applied. The Academy V106.91 and Hifz V4.2.15.29 Workers are deployed; all 34 initial snapshots were accepted, with no pending deliveries. All existing PIN hashes, local Hifz settings, journals and foreign keys pass live verification.

A disposable account passed live provisioning, name/login/contact/role/status changes, direct Hifz edit rejection, access revocation, PIN confirmation, Academy reset, lockout clearing, old-session revocation and duplicate-reset replay. It was removed after testing. No real user's PIN was reset. An API-level regression also verifies that a successful Academy save returns while Hifz delivery is still waiting for its response.

The approved `development` and `dev` branch builds publish the corresponding Academy and Hifz frontends. Production Hifz remains unchanged.

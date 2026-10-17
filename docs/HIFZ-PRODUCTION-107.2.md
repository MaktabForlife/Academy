# Academy V107.2 — Hifz production

The user authorised upgrading the existing Hifz production database and making `hifz.maktab4life.org` the production address. Hifz development returns to `hifzhelper-dev.pages.dev`.

Academy’s existing account database and authentication remain in place. Its one-way profile/PIN delivery now targets the Hifz production Worker. Hifz retains a separate production Worker and D1 database; journal requests do not contact Academy.

Existing production profiles are linked to verified immutable Academy account IDs. Production journals are migrated in place. Shared PIN and profile-signing keys are preserved and provisioned in the production Worker. Existing legacy PINs remain verifiable and upgrade on the next successful Academy sign-in; new/reset PINs are still chosen and confirmed once in Academy.

Production is the default sign-in receiver. A development request can select only the configured development receiver and fixed development callback. Both paths retain current-session, membership, credential-epoch, PKCE, expiry and replay checks. The browser cannot supply a receiver URL. Automatic profile updates go to production; a development handoff refreshes its current profile on entry.

A private production backup and full restored-copy migration rehearsal precede remote changes. Reconciliation follows Academy’s effective Hifz roles and status. No source credential reset is required.

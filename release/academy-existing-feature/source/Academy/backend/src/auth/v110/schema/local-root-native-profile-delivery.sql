-- LOCAL INTEGRATION SOURCE DRAFT, fresh synthetic Root Core ONLY.
-- Private native profile delivery progress; contains no raw PIN or verifier.
-- No runtime/initializer installs this source yet.
CREATE TABLE jwt_v110_hifz_profile_delivery (
 account_id TEXT PRIMARY KEY REFERENCES accounts(account_id),
 source_revision INTEGER NOT NULL CHECK(typeof(source_revision)='integer' AND source_revision>=1),
 source_credential_epoch INTEGER NOT NULL CHECK(typeof(source_credential_epoch)='integer' AND source_credential_epoch>=1),
 parent_permission_version INTEGER NOT NULL CHECK(typeof(parent_permission_version)='integer' AND parent_permission_version>=0),
 request_digest TEXT NOT NULL CHECK(length(request_digest)=64 AND request_digest NOT GLOB '*[^0-9a-f]*'),
 confirmed_at_s INTEGER NOT NULL CHECK(typeof(confirmed_at_s)='integer' AND confirmed_at_s>=0)
);

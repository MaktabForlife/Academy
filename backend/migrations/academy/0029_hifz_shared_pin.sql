-- PIN setup and transparent hash upgrades enter the same durable profile queue.
-- Existing reset trigger remains the authority for pin_reset_version.
CREATE TRIGGER hifz_sync_pin_set AFTER UPDATE OF pin_hash,pin_setup,credential_epoch ON account_credentials
WHEN NEW.pin_setup=1 AND (NEW.pin_hash IS NOT OLD.pin_hash OR NEW.credential_epoch<>OLD.credential_epoch)
BEGIN
 UPDATE hifz_profile_sync SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP
 WHERE account_id=NEW.account_id;
END;
-- Existing delivered snapshots predate source credential epochs. Replay each
-- current profile once, so already-signed-in users can use the handoff without
-- another Academy PIN sign-in. Legacy hashes remain unchanged until sign-in.
UPDATE hifz_profile_sync SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;

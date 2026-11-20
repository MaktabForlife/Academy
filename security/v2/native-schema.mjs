import {libraryMetadataSchemaSQL} from '../../backend/src/academy/v111/library-metadata-v2.mjs';
import {coursePublicationSourceSchemaSQL} from '../../backend/src/academy/v111/course-publication-source.mjs';
import {studioPortalSourceSchemaSQL} from '../../backend/src/academy/v111/studio-portal.mjs';
import {studioAuthoritySourceSchemaSQL} from '../../backend/src/academy/v111/studio-authority-source.mjs';
// Operational source-only delivery receipt recipe; no existing native rows rewritten.
const baseNativeSchemaSQL=`
CREATE TABLE IF NOT EXISTS jwt_v2_profile_deliveries(operation_id TEXT PRIMARY KEY,scope TEXT NOT NULL,owner_epoch TEXT NOT NULL,dependency_revision INTEGER NOT NULL,profile_revision INTEGER NOT NULL,packet_json TEXT NOT NULL,packet_digest TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,receipt_json TEXT,UNIQUE(scope,owner_epoch,dependency_revision));
CREATE TRIGGER IF NOT EXISTS jwt_v2_profile_delivery_immutable BEFORE UPDATE ON jwt_v2_profile_deliveries WHEN OLD.operation_id<>NEW.operation_id OR OLD.scope<>NEW.scope OR OLD.owner_epoch<>NEW.owner_epoch OR OLD.dependency_revision<>NEW.dependency_revision OR OLD.profile_revision<>NEW.profile_revision OR OLD.packet_json<>NEW.packet_json OR OLD.packet_digest<>NEW.packet_digest OR (OLD.receipt_json IS NOT NULL AND NEW.receipt_json IS NOT OLD.receipt_json) BEGIN SELECT RAISE(ABORT,'jwt_v2_immutable_profile_delivery'); END;
`;

export const nativeSchemaSQL=[baseNativeSchemaSQL,studioAuthoritySourceSchemaSQL,studioPortalSourceSchemaSQL,coursePublicationSourceSchemaSQL,libraryMetadataSchemaSQL].join('\n');

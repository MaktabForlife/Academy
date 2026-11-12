// Only the NEW explicit local integration may opt into outbound event capture.
// Existing Feature/production configuration remains off without this exact flag.
import {assertLocalIntegrationProfile} from './local-integration-profile.mjs';
export function localMasterOutboxEnabled(env){
 if(env.JWT_LOCAL_OUTBOX!=='1')return false;
 assertLocalIntegrationProfile(env);
 if(env.JWT_V110_MASTER!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1')throw Object.assign(Error('Local outbox unavailable'),{code:'JWT_LOCAL_OUTBOX_UNAVAILABLE',status:503});
 return true;
}

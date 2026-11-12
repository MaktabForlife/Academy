// Capture is required for the new local native profile, independent of delivery.
import {requirePortableNativeMethod} from './portable-native-profile-v5.mjs';
export function portableMasterOutboxEnabled(env){
 requirePortableNativeMethod(env,'academy','master');
 if(env.JWT_V110_MASTER!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1')throw Object.assign(Error('NATIVE_OUTBOX_REQUIRED'),{status:503});
 return true;
}

// Exact native coordinator import ABI; same function and guard, no projection.
export {portableMasterOutboxEnabled as localMasterOutboxEnabled};

// Mandatory native lifecycle capture for the explicit portable Root composition.
// Capture stays in the original same-Core batch. No delivery/transport selection.
import {requirePortableNativeMethod} from './portable-native-profile-v2.mjs';
export function portableMasterOutboxEnabled(env){
 requirePortableNativeMethod(env,'academy','http');
 if(env.JWT_V110_MASTER!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1')throw Object.assign(Error('Portable native outbox unavailable'),{code:'PORTABLE_OUTBOX_UNAVAILABLE',status:503});
 return true;
}

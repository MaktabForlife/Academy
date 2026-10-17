import {createSaltedPinHash,verifyPin} from './auth-primitives.js';
import {createSharedPinHash,isSharedPinHash,verifySharedPin} from './shared-pin-credential.js';
function requireSharedConfiguration(env){if(env.HIFZ_HANDOFF_ENABLED==='1'&&(typeof env.SHARED_PIN_SECRET!=='string'||env.SHARED_PIN_SECRET.length<32))throw new Error('Shared PIN verification is not configured');}
export const createAcademyPinHash=(pin,env)=>{requireSharedConfiguration(env);return env.SHARED_PIN_SECRET?createSharedPinHash(pin,env.SHARED_PIN_SECRET):createSaltedPinHash(pin,env.PIN_SECRET);};
export async function verifyAcademyPin(pin,hash,env){
 requireSharedConfiguration(env);
 if(isSharedPinHash(hash))return {valid:await verifySharedPin(pin,hash,env.SHARED_PIN_SECRET),needsMigration:false,upgradedHash:''};
 const result=await verifyPin(pin,hash,env.PIN_SECRET);
 if(result.valid&&env.SHARED_PIN_SECRET)return {valid:true,needsMigration:true,upgradedHash:await createSharedPinHash(pin,env.SHARED_PIN_SECRET)};
 return result;
}

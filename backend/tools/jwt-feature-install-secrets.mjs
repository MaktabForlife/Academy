// Private data remains in this closure; only public key metadata is enumerable.
import {webcrypto,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
export async function createPrivateCapsule(pin,{kid,setupClientFactory}){
 if(typeof pin!=='string'||!/^\d{4}$/.test(pin))throw Error('FEATURE_PRIVATE_PIN_REQUIRED');
 assert.match(kid,/^jwt-feature-v110-20261106a-[a-z0-9-]+$/);
 const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 let jwk=await webcrypto.subtle.exportKey('jwk',pair.privateKey),auth=randomBytes(32),csrf=randomBytes(32).toString('base64url'),pinValue=pin,dead=false;
 const pub=await webcrypto.subtle.exportKey('jwk',pair.publicKey);
 const publicKey={kty:'EC',crv:'P-256',kid,x:pub.x,y:pub.y};
 const capsule={publicKey,destroy(){dead=true;if(auth)auth.fill(0);auth=null;jwk=null;csrf=null;pinValue=null;}};
 Object.defineProperties(capsule,{
  ingress:{value:async patch=>{
   if(dead)throw Error('PRIVATE_CAPSULE_CLOSED');
   const secrets={JWT_FEATURE_SETUP_PIN:{name:'JWT_FEATURE_SETUP_PIN',type:'secret_text',text:pinValue},JWT_FEATURE_SETUP_AUTH:{name:'JWT_FEATURE_SETUP_AUTH',type:'secret_text',text:auth.toString('base64url')},
    JWT_V110_PRIVATE_KEY_JSON:{name:'JWT_V110_PRIVATE_KEY_JSON',type:'secret_text',text:JSON.stringify(jwk)},JWT_V110_CSRF_SECRET:{name:'JWT_V110_CSRF_SECRET',type:'secret_text',text:csrf}};
   try{await patch(secrets);}finally{for(const s of Object.values(secrets))s.text='';}
  }},
  setup:{value:async options=>{if(dead)throw Error('PRIVATE_CAPSULE_CLOSED');return setupClientFactory({...options,authKey:auth}).run();}}
 });
 return capsule;
}

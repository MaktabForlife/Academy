// Uses the reviewed configured JWT engines. No custom JWT implementation,
// remote JWKS lookup, credential fallback, key generation or store opening.
import {createConfiguredAccessEngine} from './claims.mjs';
import {createStudioCompactEngine} from './compact-studio.mjs';
import {localChildProfile,childConfigError} from './local-child-profile.mjs';
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
function parse(value,max){try{if(typeof value!=='string'||value.length>max)childConfigError();return JSON.parse(value);}catch{childConfigError();}}
export async function createChildAccessEngine(env,{app,signing=false}={}){
 const profile=localChildProfile(env,app);
 if(typeof signing!=='boolean')childConfigError();
 const publicKeys=parse(env.JWT_V110_PUBLIC_KEYS_JSON,16384);
 if(!Array.isArray(publicKeys)||publicKeys.length<1||publicKeys.length>4)childConfigError();
 let signingKey,signingKid;
 try{
  if(signing){
   signingKid=env.JWT_V110_SIGNING_KID;
   const value=parse(env.JWT_V110_PRIVATE_KEY_JSON,4096),pub=publicKeys.find(k=>k?.kid===signingKid);
   if(!plain(value)||value.kty!=='EC'||value.crv!=='P-256'||typeof value.d!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value.d)||value.kid!==signingKid||!pub||pub.x!==value.x||pub.y!==value.y||value.alg&&value.alg!=='ES256'||value.use&&value.use!=='sig')childConfigError();
   signingKey=await crypto.subtle.importKey('jwk',value,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  }
  const config={app,issuer:profile.origin,publicKeys,...(signing?{signingKey,signingKid}:{})};
  return app==='studio'?await createStudioCompactEngine(config):await createConfiguredAccessEngine(config);
 }catch{childConfigError();}
}

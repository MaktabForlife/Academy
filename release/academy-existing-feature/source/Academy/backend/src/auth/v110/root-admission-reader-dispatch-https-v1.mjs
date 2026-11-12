// Exact shape chooses an existing verifier. It grants no authority.
import {handleRootHTTPSAdmission} from './root-https-admission-v1.mjs';
import {produceRootHTTPSStudioReaderAdmission} from './root-studio-reader-admission-https-v1.mjs';
import {exactRecord} from './native-https-contract-v1.mjs';
export async function handleRootReaderAdmission(packet,env,options={}){
 let value;try{value=JSON.parse(packet.body);}catch{throw Object.assign(Error('STUDIO_READER_BODY'),{status:400});}
 if(value&&Object.prototype.hasOwnProperty.call(value,'reader')){
  // Invalid reader input can NEVER fall back to management admission.
  exactRecord(value,['identityJWT','challenge','state','reader']);
  if(packet.from!=='studio')throw Object.assign(Error('STUDIO_READER_ORIGIN'),{status:403});
  return produceRootHTTPSStudioReaderAdmission(packet,env,options);
 }
 return handleRootHTTPSAdmission(packet,env,options);
}

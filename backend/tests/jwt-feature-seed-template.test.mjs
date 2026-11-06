import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
import {credentialFreeSeedTemplate} from '../tools/jwt-feature-seed-template.mjs';
test('public synthetic template is invariant under distinct uninstalled PINs/secrets and exports no credential hash',async()=>{
 const {prepareFeatureSeed}=await import(pathToFileURL(resolve(process.env.JWT_APP_SOURCE_ROOT,'backend/tools/feature-synthetic-seed.mjs')).href);
 const names=['PIN_SECRET','SESSION_SECRET','SHARED_PIN_SECRET','ACADEMY_OPEN_LIBRARY_STORAGE_KEY'],secrets=x=>Object.fromEntries(names.map(k=>[k,x.repeat(64)])),at='2026-11-06T00:00:00.000Z';
 // Only this public bootstrap comparison fixes UUID/time inputs. PIN salts,
 // native cryptography and the separate HTTP/auth tests keep real clocks/RNG.
 async function prepare(pin,values){
  const NativeDate=globalThis.Date,descriptor=Object.getOwnPropertyDescriptor(crypto,'randomUUID');let sequence=0;
  class FixtureDate extends NativeDate{constructor(...args){super(...(args.length?args:[at]));}static now(){return NativeDate.parse(at);}}
  try{globalThis.Date=FixtureDate;Object.defineProperty(crypto,'randomUUID',{configurable:true,value:()=> '00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0')});return await prepareFeatureSeed({pin,secrets:values,at});}
  finally{globalThis.Date=NativeDate;if(descriptor)Object.defineProperty(crypto,'randomUUID',descriptor);else delete crypto.randomUUID;}
 }
 const a=await prepare('2468',secrets('a')),b=await prepare('1357',secrets('b'));
 try{
  const x=credentialFreeSeedTemplate(a),y=credentialFreeSeedTemplate(b);
  assert.equal(x.core,y.core,'Noncredential Core must not depend on test credentials');assert.equal(x.admin,y.admin);assert.deepEqual(x.publicReport,y.publicReport);
  assert.equal(x.credentialPlaceholders,4);assert.equal(x.executableAsSeed,false);
  const out=resolve(process.env.RUNNER_TEMP,'jwt-fresh-pair-evidence');mkdirSync(out,{recursive:true});
  writeFileSync(resolve(out,'core-credential-FREE-template.sql'),x.core);
  writeFileSync(resolve(out,'admin-public-synthetic-template.sql'),x.admin);
  writeFileSync(resolve(out,'credential-free-template-proof.json'),JSON.stringify({schema:1,sourceOnly:true,installed:false,actualCredentialsUsed:false,credentialHashExported:false,publicUUIDAndSetupTimeFixed:true,pinSaltRandomUnchanged:true,credentialPlaceholders:4,notExecutableAsSeed:true,nativeStatements:x.publicReport.targets,sourceDigest:x.publicReport.sourceDigest,at,appSource:process.env.JWT_APP_SOURCE_SHA,meaning:'Two independent uninstalled PIN/secret sets yield identical public noncredential SQL after four strict credential placeholders. This is not a private seed transport or authority to install.',hostedCalls:0},null,2));
 }finally{a.close();b.close();}
});

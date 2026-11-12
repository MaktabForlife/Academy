// SOURCE ONLY. Typed bounded own-account native library read; no new RPC method.
import {statusExact as exact,statusFail as fail,statusID as id,statusUint as uint} from './native-current-account-status-contract-v3.mjs';
import {readerProbeFrame} from './native-current-reader-account-status-contract-v1.mjs';
import {parseStudioReaderResource} from './studio-reader-admission-contract-v1.mjs';
export const readerLibraryPurpose='maktab-web-v1:READ:/internal/academy/native-reader-library';
export const readerLibraryACKPurpose='maktab-web-v1:ACK:/internal/academy/native-reader-library';
export function readerLibraryFrame(body){
 let p;try{p=JSON.parse(body);}catch{fail();}
 if(!exact(p,['ver','purpose','source','account','workspace','resources'])||p.ver!==1||p.purpose!=='uaa-native-current-reader-library-v1'||!['LEARN','TEACH'].includes(p.workspace)||!Array.isArray(p.resources)||p.resources.length<1||p.resources.length>4)fail();
 let base;const seen=new Set(),resources=p.resources.map(resource=>{
  const r=parseStudioReaderResource(resource);
  if(!r.activityKey.startsWith('COURSE:')||r.surahId!==null||seen.has(r.websiteId))fail();seen.add(r.websiteId);
  base=readerProbeFrame(JSON.stringify({ver:1,purpose:'uaa-native-current-reader-authority-v1',source:p.source,account:p.account,reader:{resource:r,workspace:p.workspace}}));return r;
 });
 return Object.freeze({...p,source:base.source,account:base.account,resources:Object.freeze(resources)});
}
export function readerLibraryACK(body){
 let p;try{p=JSON.parse(body);}catch{fail();}
 if(!exact(p,['ver','purpose','invocationWrites','requestDigest','accountId','credentialEpoch','permissionVersion','coreRevision','authorityRevision','snapshotDigest','items'])||p.ver!==1||p.purpose!=='uaa-native-current-reader-library-ack-v1'||p.invocationWrites!=='NONE'||!id(p.accountId)||!['credentialEpoch','permissionVersion','coreRevision','authorityRevision'].every(k=>uint(p[k]))||p.authorityRevision<1||!['requestDigest','snapshotDigest'].every(k=>typeof p[k]==='string'&&/^[a-f0-9]{64}$/.test(p[k]))||!Array.isArray(p.items)||p.items.length>4)fail();
 const seen=new Set(),items=p.items.map(x=>{
  if(!exact(x,['resource','label'])||typeof x.label!=='string'||x.label.trim()!==x.label||!x.label||x.label.length>160)fail();
  const r=parseStudioReaderResource(x.resource);if(!r.activityKey.startsWith('COURSE:')||r.surahId!==null||seen.has(r.websiteId))fail();seen.add(r.websiteId);return Object.freeze({resource:r,label:x.label});
 });
 return Object.freeze({...p,items:Object.freeze(items)});
}

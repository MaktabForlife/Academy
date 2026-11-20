import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserDrafts} from '../browser-drafts.mjs';
const NOW=1795080000000;
const selector=(changes={})=>({app:'hifz',sub:'synthetic-academy',sid:crypto.randomUUID(),psid:crypto.randomUUID(),bsid:crypto.randomUUID(),bv:1,ce:1,ae:1,le:0,sv:1,ue:0,...changes});
const encode=b=>Buffer.from(b).toString('base64url');
class MemoryStore{
 rows=new Map();tail=Promise.resolve();failWrite=false;
 transaction(mode,fn){
  const run=async()=>{const staged=new Map([...this.rows].map(([k,v])=>[k,structuredClone(v)])),api={get:async id=>structuredClone(staged.get(id)),all:async()=>[...staged.values()].map(value=>structuredClone(value)),put:async row=>{if(this.failWrite)throw Error('synthetic disk full');staged.set(row.id,structuredClone(row));},delete:async id=>{if(this.failWrite)throw Error('synthetic disk full');staged.delete(id);}};
   const result=await fn(api);if(mode==='readwrite')this.rows=staged;return result;};
  const p=this.tail.catch(()=>{}).then(run);this.tail=p;return p;
 }
}
function setup({store=new MemoryStore(),tabId=crypto.randomUUID(),release}={}){
 let now=NOW;const context=selector(),binding={context,env:'production',draftGeneration:1,originalExpiresAtMs:NOW+604800000},raw=crypto.getRandomValues(new Uint8Array(32)),key=encode(raw),calls=[],unavailable=[];
 const defaults=async args=>{calls.push(args);return {contractVersion:2,success:true,context:args.context,draftGeneration:args.draftGeneration,originalExpiresAtMs:args.originalExpiresAtMs,capsule:'synthetic-wrapped-capsule',key};};
 const drafts=createBrowserDrafts({crypto,store,tabId,clock:()=>now,releaseCapsule:release||defaults,onUnavailable:e=>unavailable.push(e)});drafts.bindContext(binding);
 return {drafts,store,context,binding,key,calls,unavailable,setNow:v=>{now=v;},release:defaults};
}
test('AES-GCM storage contains only ciphertext/IV/binding/capsule; no draft, key or marker plaintext',async()=>{
 const f=setup(),resource={type:'hifz-journal',studentId:'permanent-native-id'};
 await f.drafts.prepare(resource);await f.drafts.save(resource,{text:'Synthetic sensitive draft'});
 const row=[...f.store.rows.values()][0];assert(row.ciphertext instanceof ArrayBuffer);assert.equal(row.iv.length,12);assert.equal(row.aad.format,2);assert.equal(row.aad.context.sid,f.context.sid);
 for(const secret of ['Synthetic sensitive draft',f.key,'payload','SAVE_OUTCOME_UNKNOWN'])assert(!JSON.stringify(row).includes(secret));
 assert.deepEqual((await f.drafts.load({studentId:'permanent-native-id',type:'hifz-journal'})).payload,{text:'Synthetic sensitive draft'});
});
test('same-tab structured resource identity is canonical and every checkpoint gets a fresh nonce',async()=>{
 const f=setup(),r={type:'studio-website',websiteId:'synthetic-site'};
 await f.drafts.save(r,'first');const iv=Buffer.from([...f.store.rows.values()][0].iv).toString('hex');
 await f.drafts.save({websiteId:'synthetic-site',type:'studio-website'},'second');assert.equal(f.store.rows.size,1);assert.notEqual(Buffer.from([...f.store.rows.values()][0].iv).toString('hex'),iv);
 assert.equal((await f.drafts.load(r)).payload,'second');assert.equal(f.calls.length,1);
});
test('serialized checkpoints preserve input order instead of a slow old encryption overwriting newer input',async()=>{
 const f=setup();await Promise.all([f.drafts.save('editor','first'),f.drafts.save('editor','second'),f.drafts.save('editor','third')]);await f.drafts.flush();assert.equal((await f.drafts.load('editor')).payload,'third');
});
test('lock drops usable key; same SID unlock releases under exact new live context and restores recorded prior AAD',async()=>{
 const f=setup();await f.drafts.save('editor','retained draft');f.drafts.lock();
 const next={...f.context,sv:2,ue:1};f.drafts.bindContext({...f.binding,context:next});
 assert.equal((await f.drafts.load('editor')).payload,'retained draft');assert.equal(f.calls.length,2);assert.equal(f.calls[1].context.ue,1);
});
test('late key release after context discard cannot recreate an old draft or restore its key',async()=>{
 let release;const gate=new Promise(r=>{release=r;});let args;
 const f=setup({release:async a=>{args=a;await gate;return {contractVersion:2,success:true,context:a.context,draftGeneration:1,originalExpiresAtMs:NOW+604800000,capsule:'synthetic',key:encode(new Uint8Array(32))};}});
 const pending=f.drafts.save('editor','discarded draft');await new Promise(r=>setTimeout(r,0));assert(args);
 await f.drafts.discardSession();release();await assert.rejects(pending,/DRAFT_CONTEXT_CHANGED/);assert.equal(f.store.rows.size,0);
});
test('two tabs with same SID/resource keep distinct drafts, while logout discard covers all available SID records',async()=>{
 const store=new MemoryStore(),a=setup({store}),b=setup({store});b.drafts.bindContext(a.binding);
 const commonRelease=a.release;b.drafts=createBrowserDrafts({crypto,store,tabId:crypto.randomUUID(),clock:()=>NOW,releaseCapsule:commonRelease});b.drafts.bindContext(a.binding);
 await a.drafts.save('editor','tab A');await b.drafts.save('editor','tab B');
 assert.equal((await a.drafts.load('editor')).payload,'tab A');assert.equal((await b.drafts.load('editor')).payload,'tab B');assert.equal(store.rows.size,2);
 await a.drafts.discardSession();assert.equal(store.rows.size,0);
});
test('ciphertext/AAD tampering fails before returning any plaintext',async()=>{
 const f=setup();await f.drafts.save('editor','integrity checked');const row=[...f.store.rows.values()][0],bytes=new Uint8Array(row.ciphertext);bytes[0]^=1;
 await assert.rejects(f.drafts.load('editor'),/DRAFT_INTEGRITY_FAILURE/);assert(f.unavailable.length);
 const g=setup();await g.drafts.save('editor','bound');[...g.store.rows.values()][0].aad.resource='other';
 await assert.rejects(g.drafts.load('editor'),/DRAFT_BINDING_MISMATCH/);
});
test('a new sign-in to same account cannot read a discarded old SID/generation draft',async()=>{
 const f=setup();await f.drafts.save('editor','old account draft');await f.drafts.discardSession();
 f.drafts.bindContext({...f.binding,context:{...f.context,sid:crypto.randomUUID(),psid:crypto.randomUUID(),bsid:crypto.randomUUID()},draftGeneration:2});
 assert.equal(await f.drafts.load('editor'),null);
});
test('Hifz in-flight marker is encrypted before network and recovers as UNKNOWN without replay',async()=>{
 const f=setup(),r='hifz:sabaq:new',attempt=await f.drafts.checkpointMutation({resource:r,method:'POST',payload:{text:'unsaved compound entry'},context:f.context});
 assert.equal(f.store.rows.size,1);assert(!JSON.stringify([...f.store.rows.values()]).includes('IN_FLIGHT'));
 const marker=await f.drafts.recoveryMarker(r);assert.equal(marker.state,'SAVE_OUTCOME_UNKNOWN');assert.equal(marker.attemptId,attempt.id);
 await f.drafts.save(r,{text:'edited local recovery text'});assert.equal((await f.drafts.recoveryMarker(r)).state,'SAVE_OUTCOME_UNKNOWN');
 await assert.rejects(f.drafts.checkpointMutation({resource:r,method:'POST',payload:{text:'blind retry'},context:f.context}),/SAVE_OUTCOME_UNKNOWN/);
});
test('manual reconciliation requires available fresh views and never treats a failed read as an empty result',async()=>{
 const f=setup(),r='hifz:compound';await f.drafts.checkpointMutation({resource:r,method:'POST',payload:{draft:true},context:f.context});
 await assert.rejects(f.drafts.reconcileUnknown(r,async()=>{throw Error('unavailable');}),/unavailable/);
 await assert.rejects(f.drafts.reconcileUnknown(r,async()=>({available:false})),/RECOVERY_READ_UNAVAILABLE/);
 let reads=0;const result=await f.drafts.reconcileUnknown(r,async()=>{reads++;return {journal:[],plans:[],comments:[],attendance:[]};});assert.equal(reads,1);assert.equal(result.automaticReplayAllowed,false);assert.equal(result.manualRecoveryRequired,true);
});
test('definitive save success clears only its matching live context marker; late success cannot restore a discarded account',async()=>{
 const f=setup(),attempt=await f.drafts.checkpointMutation({resource:'editor',method:'PATCH',payload:{draft:true},context:f.context});
 await f.drafts.finishMutation(attempt,f.context);assert.equal(await f.drafts.recoveryMarker('editor'),null);
 const other=await f.drafts.checkpointMutation({resource:'editor',method:'POST',payload:{draft:true},context:f.context});await f.drafts.discardSession();
 await assert.rejects(f.drafts.finishMutation(other,f.context),/STALE_MUTATION_RESPONSE/);assert.equal(f.store.rows.size,0);
});
test('unknown outcome while locked retains durable encrypted in-flight evidence without obtaining a new key',async()=>{
 const f=setup(),a=await f.drafts.checkpointMutation({resource:'editor',method:'POST',payload:'draft',context:f.context});const calls=f.calls.length;f.drafts.lock();
 const result=await f.drafts.markUnknown(a);assert.equal(result.persistedMarker,'IN_FLIGHT');assert.equal(f.calls.length,calls);assert.equal(f.store.rows.size,1);
});
test('storage failure latches recovery failure and flush cannot claim a successful checkpoint',async()=>{
 const f=setup();f.store.failWrite=true;await assert.rejects(f.drafts.save('editor','draft'),/disk full/);await assert.rejects(f.drafts.flush(),/disk full/);assert(f.unavailable.length);assert.equal(f.store.rows.size,0);
});
test('reviewed 1.5-million-byte Studio edition fits; resource limit fails visibly without truncating the prior draft',async()=>{
 const f=setup(),r={type:'studio-website',websiteId:'edition'};
 await f.drafts.save(r,'x'.repeat(1500000));assert.equal((await f.drafts.load(r)).payload.length,1500000);
 await assert.rejects(f.drafts.save(r,'x'.repeat(2*1024*1024)),/DRAFT_RESOURCE_LIMIT/);assert.equal((await f.drafts.load(r)).payload.length,1500000);
});
test('16MiB SID quota counts drafts across tabs/resources and never deletes old entries to fit',async()=>{
 const f=setup();for(let i=0;i<8;i++)await f.drafts.save('resource-'+i,'x'.repeat(1900000));
 await assert.rejects(f.drafts.save('resource-8','x'.repeat(1900000)),/DRAFT_SESSION_LIMIT/);assert.equal(f.store.rows.size,8);
});
test('expired encrypted remnants are removed on the next storage execution, without reading plaintext',async()=>{
 const f=setup();await f.drafts.save('editor','expired draft');f.setNow(f.binding.originalExpiresAtMs+1);await f.drafts.clearExpired();assert.equal(f.store.rows.size,0);
});

test('checkpoint snapshots mutable editor data and structured resource at call time',async()=>{
 const f=setup(),resource={type:'studio-website',websiteId:'original-site'},payload={text:'checkpoint value'};
 const save=f.drafts.save(resource,payload);resource.websiteId='changed-site';payload.text='later value';await save;
 assert.deepEqual((await f.drafts.load({type:'studio-website',websiteId:'original-site'})).payload,{text:'checkpoint value'});assert.equal(await f.drafts.load(resource),null);
});

test('an empty old read completing after account switch cannot write its checkpoint into the new account',async()=>{
 const store=new MemoryStore(),f=setup({store});let release,started;const entered=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;}),originalTransaction=store.transaction.bind(store);let block=true;
 store.transaction=(mode,fn)=>originalTransaction(mode,async api=>fn({...api,get:async id=>{if(block){block=false;started();await gate;}return api.get(id);}}));
 const pending=f.drafts.save('editor','old-account text');await entered;
 f.drafts.bindContext({...f.binding,context:selector({sub:'different-synthetic-account'})});release();
 await assert.rejects(pending,{code:'DRAFT_CONTEXT_CHANGED'});assert.equal(store.rows.size,0);
});

test('key-release denial fails editor preflight and latches unsaved recovery as unavailable',async()=>{
 const f=setup({release:async()=>{throw Error('synthetic resource denied');}});
 await assert.rejects(f.drafts.prepare({type:'studio-website',websiteId:'denied-site'}),/synthetic resource denied/);assert(f.unavailable.length>0);await assert.rejects(f.drafts.flush(),/synthetic resource denied/);assert.equal(f.store.rows.size,0);
});

test('Academy Course resource preserves explicit null surah selector through canonical encrypted restore',async()=>{const f=setup(),resource={type:'academy-website',activityKey:'COURSE:Synthetic',surahId:null};f.drafts.bindContext({...f.binding,context:{...f.context,app:'academy'}});await f.drafts.save(resource,{document:{title:'Synthetic nullable resource'}});assert.equal((await f.drafts.load({surahId:null,activityKey:'COURSE:Synthetic',type:'academy-website'})).payload.document.title,'Synthetic nullable resource');assert.equal(f.store.rows.size,1);assert.equal([...f.store.rows.values()][0].aad.resource.surahId,null);});
test('explicit local resource discard clears only that retained ciphertext/UNKNOWN without acknowledging server save',async()=>{const f=setup();await f.drafts.save('other','retained other draft');const attempt=await f.drafts.checkpointMutation({resource:'chosen',method:'POST',payload:{draft:'chosen'},context:f.context});await f.drafts.markUnknown(attempt);assert((await f.drafts.recoveryMarker('chosen')).manualRecoveryRequired);assert.throws(()=>f.drafts.discardResource('chosen',{expectedContext:{...f.context,sv:2}}),{code:'INVALID_DISCARD_CONTEXT'});const result=await f.drafts.discardResource('chosen',{expectedContext:f.context});assert.equal(result.discarded,true);assert.equal(result.acknowledgedServerSave,false);assert.equal(await f.drafts.load('chosen'),null);assert.equal((await f.drafts.load('other')).payload,'retained other draft');});
test('late discard from old selector cannot remove records after a context transition',async()=>{const f=setup();await f.drafts.save('chosen','original');const pending=f.drafts.discardResource('chosen',{expectedContext:f.context});f.drafts.bindContext({...f.binding,context:{...f.context,sv:2}});await assert.rejects(pending,{code:'DRAFT_CONTEXT_CHANGED'});assert.equal(f.store.rows.size,1);});

test('obsolete key release cannot poison a restored same-selector draft generation or block its flush',async()=>{let finish,started=false,first=true;const gate=new Promise(resolve=>finish=resolve),f=setup({release:async args=>{if(first){first=false;started=true;await gate;}return f.release(args);}}),old=f.drafts.save('old-editor',{text:'cancelled private write'});await new Promise(r=>setImmediate(r));assert(started);f.drafts.lock();f.drafts.bindContext(f.binding);await f.drafts.prepare('current-editor');await f.drafts.flush();assert.equal(f.unavailable.length,0);finish();await assert.rejects(old,{code:'DRAFT_CONTEXT_CHANGED'});assert.equal(f.unavailable.length,0);await f.drafts.save('current-editor',{text:'current restored draft'});await f.drafts.flush();assert.equal((await f.drafts.load('current-editor')).payload.text,'current restored draft');assert.equal(await f.drafts.load('old-editor'),null);});
test('obsolete queued transaction cancellation cannot call storage unavailable against a restored binding',async()=>{const f=setup(),original=f.store.transaction.bind(f.store);let release,begin,entered=false,hold=true;const enteredPromise=new Promise(resolve=>begin=resolve),gate=new Promise(resolve=>release=resolve);f.store.transaction=(mode,fn)=>original(mode,async store=>{if(mode==='readwrite'&&hold){hold=false;entered=true;begin();await gate;}return fn(store);});const pending=f.drafts.save('old-view','cancelled');await enteredPromise;assert(entered);f.drafts.lock();f.drafts.bindContext(f.binding);release();await assert.rejects(pending,{code:'DRAFT_CONTEXT_CHANGED'});assert.equal(f.unavailable.length,0);await f.drafts.save('current-view','checked');assert.equal((await f.drafts.load('current-view')).payload,'checked');});

test('preflight started before lock cannot silently restart in a new same-selector generation',async()=>{const f=setup(),original=f.store.transaction.bind(f.store);let finish,start,first=true;const gate=new Promise(resolve=>finish=resolve),entered=new Promise(resolve=>start=resolve);f.store.transaction=(mode,fn)=>original(mode,async store=>{if(first&&mode==='readwrite'){first=false;start();await gate;}return fn(store);});const pending=f.drafts.prepare('old-preflight');await entered;f.drafts.lock();f.drafts.bindContext(f.binding);finish();await assert.rejects(pending,{code:'DRAFT_CONTEXT_CHANGED'});assert.equal(f.calls.length,0);assert.equal(f.unavailable.length,0);await f.drafts.prepare('new-preflight');assert.equal(f.calls.length,1);});

test('retained-resource lookup reads only current-family local metadata and does not release a draft key',async()=>{const f=setup(),resource={type:'academy-program-subscription-policy',activityKey:'PROGRAM:Native',mode:'prepare'};assert.equal(await f.drafts.hasResource(resource),false);assert.equal(f.calls.length,0);await f.drafts.save(resource,{mode:'prepare'});const calls=f.calls.length;f.drafts.lock();assert.equal(await f.drafts.hasResource(resource),true);assert.equal(f.calls.length,calls);assert.equal(await f.drafts.hasResource({...resource,mode:'activate'}),false);assert.equal(f.calls.length,calls);const other={...f.binding,context:selector()};f.drafts.bindContext(other);assert.equal(await f.drafts.hasResource(resource),false);assert.equal(f.calls.length,calls);});

test('active mutation request remains immutable through ordinary checkpoints and changes only after verified ACK',async()=>{const f=setup(),resource='native-operation',original={operationId:crypto.randomUUID(),metadata:{revision:4}},replacement={operationId:crypto.randomUUID(),metadata:{revision:5}},attempt=await f.drafts.checkpointMutation({resource,method:'POST',payload:{document:'before',request:original},context:f.context});await f.drafts.markUnknown(attempt);await f.drafts.save(resource,{document:'new local draft'});let row=await f.drafts.load(resource);assert.deepEqual(row.payload.request,original);assert.equal(row.marker.attemptId,attempt.id);await f.drafts.save(resource,{document:'newer local draft',request:replacement});row=await f.drafts.load(resource);assert.deepEqual(row.payload.request,original);assert.equal(row.payload.document,'newer local draft');assert.equal(row.marker.state,'SAVE_OUTCOME_UNKNOWN');await assert.rejects(f.drafts.finishMutation(attempt,{...f.context,sv:2}));assert.deepEqual((await f.drafts.load(resource)).payload.request,original);await f.drafts.finishMutation(attempt,f.context);await f.drafts.save(resource,{document:'confirmed next edit',request:replacement});row=await f.drafts.load(resource);assert.equal(row.marker,null);assert.deepEqual(row.payload.request,replacement);assert(!JSON.stringify([...f.store.rows.values()]).includes(original.operationId));});

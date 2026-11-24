import {SecurityCache} from '../cache.mjs';
import {configuredControlGenesis,sourceControlPlan} from '../control-publication.mjs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {additiveSchemaSQL as schemaSQL} from '../schema-bundle.mjs';
import {PrimaryStore} from '../store.mjs';
import {canonical,vectorDigest,opaque,fingerprint,bytes} from '../codec.mjs';
import {vectorFromGuards} from '../capture-receipt.mjs';
import {digest} from '../codec.mjs';
import {profileConfig} from '../tokens.mjs';
import {seedPolicy} from '../policy.mjs';
export function database(app='studio'){
 const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON;'+schemaSQL);if(app==='academy')raw.exec('CREATE TABLE split_write_fence(singleton INTEGER PRIMARY KEY,command_id TEXT,allow_write INTEGER);');const metrics={queries:0,batches:0};
 const db={withSession(mode){if(mode!=='first-primary')throw Error('primary required');return this;},prepare(sql){
  let args=[];const stmt={sql,bind(...values){args=values;return stmt;},execute(mode){
   metrics.queries++;const st=raw.prepare(sql);
   if(mode==='all')return {success:true,results:st.all(...args),meta:{}};
   if(mode==='first')return st.get(...args)||null;
   if(st.columns().length)return {success:true,results:st.all(...args),meta:{}};
   const r=st.run(...args);return {success:true,results:[],meta:{changes:Number(r.changes)}};
  },async first(){return stmt.execute('first');},async all(){return stmt.execute('all');},async run(){return stmt.execute('run');}};return stmt;
 },async batch(list){metrics.batches++;raw.exec('BEGIN IMMEDIATE');try{const results=list.map(s=>s.execute('run'));raw.exec('COMMIT');return results;}catch(e){raw.exec('ROLLBACK');throw e;}}};
 return {raw,db,store:new PrimaryStore(db,{app,env:'production',securityPrefix:'auth-private/v2/production/'+app+'/generation1/',dependencyManifest:[{id:'test:scope',scope:'ACCOUNT:synthetic-account',ownerEpoch:'owner-epoch'}]}),metrics};
}
export class Bucket {
 constructor(){this.objects=new Map();this.gets=0;this.puts=0;this.beforePut=null;this.throwAfterPut=false;}
 async get(key){this.gets++;const v=this.objects.get(key);return v?{size:bytes(v.body).length,etag:v.etag,async arrayBuffer(){return bytes(v.body).buffer;}}:null;}
 async put(key,body,options={}){
  this.puts++;if(this.beforePut)await this.beforePut(key,body,options);
  const current=this.objects.get(key),only=options.onlyIf;
  if(only instanceof Headers&&only.get('If-None-Match')==='*'&&current)return null;
  if(only?.etagMatches&&only.etagMatches!==current?.etag)return null;
  const etag=createHash('sha256').update(body).digest('hex');this.objects.set(key,{body,etag});
  if(this.throwAfterPut){this.throwAfterPut=false;throw Error('response lost');}return {etag};
 }
}
export async function fixture(app='studio',{policyEpoch='policy-epoch',rightsKey=null}={}){
 const d=database(app),now=1000000,sub='synthetic-account',sid=crypto.randomUUID(),psid=app==='academy'?sid:crypto.randomUUID(),bsid=crypto.randomUUID();
 // Synthetic family fixtures use their declared clock, not the host epoch.
 d.raw.function('unixepoch',()=>now);
 const config=profileConfig({app}),vectorGuards=[['test:scope','ACCOUNT:synthetic-account','owner-epoch',1]],ownerVector=await vectorFromGuards(vectorGuards),pv=await vectorDigest(ownerVector),rights={roles:['synthetic-student']};
 const binding={ver:2,env:'production',iss:config.origin,aud:'urn:uaa:production:'+app+':api:v2',sub,sid,psid,bsid,bv:1,ce:4,ae:9,le:0,sv:1,ue:0,pv,vat:now,s_iat:now,s_exp:now+604800};
 const refresh=opaque(),fp=await fingerprint(refresh,config),deadline=now+900,idleUntil=now+5400;
 for(const target of ['studio','hifz'])d.raw.prepare("INSERT INTO jwt_v2_sender_streams VALUES(?,'account-security','owner-epoch',1)").run(target);
 d.raw.prepare("INSERT INTO jwt_v2_dependencies VALUES('test:scope','ACCOUNT:synthetic-account','owner-epoch',1)").run();
 d.raw.prepare('INSERT INTO jwt_v2_accounts VALUES(?,4,9,0,1,1)').run(sub);
 d.raw.prepare('INSERT INTO jwt_v2_browsers VALUES(?,1,?,?,0)').run(bsid,sub,psid);
 d.raw.prepare("INSERT INTO jwt_v2_parents VALUES(?,?,?,1,4,9,?,?,?,'UNLOCKED')").run(psid,sub,bsid,now,now+604800,now);
 await seedPolicy(d.store,{ownerEpoch:policyEpoch,receiptRef:'configured-genesis-receipt',now});
  const capture={app,sub,pv,vat:now,primaryCheckedAt:now,timedUntil:binding.s_exp,ownerVector,vectorGuards,rights};
 const projection={binding,timedUntil:binding.s_exp,ownerVector,...rightsKey?{rightsKey}:{},rightsHash:await digest(rights),policyEpoch,policyRevision:1,inactivityMinutes:90,keyRegistryEpoch:'key-epoch',keyRegistryRevision:1,deniedActions:[]};
 await d.store.createFamily({binding,projection,capture,fingerprint:fp,now,deadline,idleUntil,policyMinutes:90,vectorGuards:[['test:scope','ACCOUNT:synthetic-account','owner-epoch',1]]});
 return {...d,now,sub,sid,psid,bsid,config,binding,refresh,fp,deadline,idleUntil,ownerVector,rights,vectorGuards,capture,projection};
}
export async function signing(){return crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);}

// Explicit synthetic source owner. Production SecurityCache never seeds or
// commits app authority. This helper keeps ordinary cache/race fixtures concise.
export class FixtureSecurityCache extends SecurityCache {
 async publish(suffix,build){
  const projection=await build();
  if(suffix==='control/app'){
   const current=await this.store.first('SELECT * FROM jwt_v2_control_targets WHERE app=? AND env=? AND suffix=?',this.store.app,this.store.env,suffix);
   if(!current)await configuredControlGenesis(this.store,{suffix,projection,receiptRef:'synthetic-configured-control-genesis'});
   else if(projection.cr>current.cr){
    const plan=await sourceControlPlan(this.store,{suffix,projection,expectedCR:current.cr,commitRef:'synthetic-control-'+projection.cr});
    await this.store.batch(plan.statements);
   }
  }
  return super.publish(suffix,async()=>projection);
 }
}

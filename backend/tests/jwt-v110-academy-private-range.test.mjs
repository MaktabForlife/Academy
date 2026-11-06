import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createAcademyWorkerdFixture} from './jwt-v110-workerd-fixture.mjs';
const origin='https://feature_worker.maktab4life.workers.dev';
test('Actual workerd learner playback uses private R2 Range and rejects cookie-free replay',async()=>{
 const f=await createAcademyWorkerdFixture(),core=await f.runtime.getD1Database('JWT_V110_CORE_DB','api'),admin=await f.runtime.getD1Database('JWT_V110_ADMIN_DB','api'),bucket=await f.runtime.getR2Bucket('LESSON_MEDIA_BUCKET','api');
 const calls=[];let cookie='',csrf='',selector='';
 try{
  const scope='COURSE:FEATURE-SYNTHETIC-A',lesson='jwt-range-lesson',asset='jwt-range-asset',key='synthetic-jwt-range.mp4',bytes=new TextEncoder().encode('0123456789abcdef');
  // Direct disposable fixture setup only; not browser work or hosted DB writes.
  for(const owner of [core,admin]){
   const cols=(await owner.prepare('PRAGMA table_info(lesson_media_lessons)').all()).results.map(r=>r.name),row={lesson_id:lesson,activity_key:scope,class_id:null,lesson_date:'2026-11-06',title:'Synthetic recording',start_time:'10:00',end_time:'11:00',teacher_name:'Synthetic',state:'PUBLISHED',updated_at:new Date().toISOString(),revision:1,media_scope:'COURSE'},names=Object.keys(row).filter(k=>cols.includes(k));
   await owner.prepare('INSERT INTO lesson_media_lessons('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+')').bind(...names.map(k=>row[k])).run();
   await owner.prepare("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,object_key,filename,byte_size,created_at) VALUES(?,?,'MP4',?,'fixture.mp4',?,?)").bind(asset,scope,key,bytes.byteLength,new Date().toISOString()).run();
   await owner.prepare('INSERT INTO lesson_media_links(lesson_id,asset_id) VALUES(?,?)').bind(lesson,asset).run();
  }
  // Build a NEW immutable accepted-head fixture. Merely writing an Admin
  // draft is deliberately invisible to the learner. This is fixture setup,
  // not a claim that an authenticated publication API was exercised.
  const parent=(await core.prepare('SELECT head_id FROM setup_head_state WHERE singleton=1').first()).head_id,batch=crypto.randomUUID(),head=crypto.randomUUID(),at=new Date().toISOString(),digest=v=>createHash('sha256').update(v).digest('hex'),manifest=JSON.stringify({fixtureOnly:true,scope});
  const statements=[core.prepare('INSERT INTO setup_batches VALUES(?,?,?,?,?,?,?,?,?)').bind(batch,'feature-synthetic-global',JSON.stringify([scope]),0,parent,digest(manifest),manifest,at,head),core.prepare('INSERT INTO setup_heads VALUES(?,?,?,?,?)').bind(head,parent,batch,at,'feature-synthetic-global')];
  for(const table of ['lesson_media_lessons','lesson_media_assets','lesson_media_links']){
   const rows=(await admin.prepare('SELECT * FROM '+table).all()).results,json=JSON.stringify(rows),component=crypto.randomUUID();
   statements.push(core.prepare('INSERT INTO setup_components VALUES(?,?,?,?,?,?,?)').bind(component,batch,table,scope,json,rows.length,digest(json)));
   statements.push(core.prepare('INSERT INTO setup_head_components VALUES(?,?,?,?)').bind(head,table,scope,component));
  }
  statements.push(core.prepare('INSERT INTO setup_head_components SELECT ?,table_name,scope_key,component_id FROM setup_head_components WHERE head_id=? AND NOT(table_name IN(?,?,?) AND scope_key=?)').bind(head,parent,'lesson_media_lessons','lesson_media_assets','lesson_media_links',scope));
  statements.push(core.prepare('UPDATE setup_head_state SET head_id=? WHERE singleton=1 AND head_id=?').bind(head,parent));await core.batch(statements);
  await bucket.put(key,bytes,{httpMetadata:{contentType:'video/mp4'}});
  async function request(path,{body,method='POST',credential=true,headers={}}={}){
   const r=await f.runtime.dispatchFetch(new URL(path,origin),{method,headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Academy-Workspace':'LEARN',...(credential?{Cookie:cookie,'X-UAA-CSRF':csrf,...(selector?{Authorization:'Bearer '+selector}:{})}:{}),...headers},...(method==='POST'?{body:JSON.stringify(body||{})}:{})});
   const metrics=JSON.parse(r.headers.get('x-feature-local-budget'));assert(metrics);assert.equal(metrics.remoteCalls,0);
   calls.push({path:new URL(path,origin).pathname,method,status:r.status,metrics});return r;
  }
  const login=await request('/auth/v110/login',{credential:false,body:{uniqueid:'feature-test-learner',pin:'2468'}});assert.equal(login.status,200);const signed=await login.json();cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');csrf=signed.csrf;selector=signed.sessionKey;
  const watch=await request('/api/academy/lesson-media/watch',{body:{lessonId:lesson,assetId:asset}});const watched=await watch.json();assert.equal(watch.status,200,watched.code);const path=watched.playbackPath;assert(typeof path==='string','Native watch must issue its own scoped playback URL');
  const no=await request(path,{method:'GET',credential:false,headers:{Range:'bytes=2-5'}});assert.equal(no.status,401);await no.body?.cancel();
  const range=await request(path,{method:'GET',headers:{Range:'bytes=2-5'}});assert.equal(range.status,206);assert.equal(range.headers.get('Content-Range'),'bytes 2-5/16');assert.equal(await range.text(),'2345');assert.match(range.headers.get('Cache-Control'),/private, no-store/);
  const sid=signed.browserContext.sessionId;await core.prepare('UPDATE jwt_v110_families SET unlock_generation=unlock_generation+1 WHERE family_id=?').bind(sid).run();
  const stale=await request(path,{method:'GET',headers:{Range:'bytes=2-5'}});assert.equal(stale.status,401);await stale.body?.cancel();assert.equal((await core.prepare('SELECT revoked_at FROM account_sessions WHERE session_id=?').bind(sid).first()).revoked_at,null);
  const totals={workerRequests:calls.length,privateCoordinatorCalls:0,d1Statements:0,d1RoundTrips:0,d1RowsRead:0,d1RowsWritten:0,r2Operations:0};
  for(const c of calls){const m=c.metrics;totals.privateCoordinatorCalls+=m.coordinatorCalls;for(const d of Object.values(m.d1)){totals.d1Statements+=d.statements;totals.d1RoundTrips+=d.roundTrips;totals.d1RowsRead+=d.rowsRead;totals.d1RowsWritten+=d.rowsWritten;}totals.r2Operations+=Object.values(m.r2).reduce((a,b)=>a+b,0);}
  if(process.env.JWT_V110_EVIDENCE){mkdirSync(process.env.JWT_V110_EVIDENCE,{recursive:true});writeFileSync(process.env.JWT_V110_EVIDENCE+'/workerd-private-range.json',JSON.stringify({schema:1,commit:process.env.GITHUB_SHA,actualLocalR2:true,actualNativeLearner:true,calls,totals,directFixtureOperationsExcluded:true,fixtureDirectOldSentinelQueries:2,hostedRequests:0,limits:'Synthetic disposable R2 bytes and direct fixture SQL; not hosted storage, wall-clock expiry or complete streaming lifecycle proof.'},null,2)+'\n');}
 }finally{await f.close();}
});

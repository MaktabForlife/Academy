import {readFileSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';import {studioRuntimeFixture} from './fixtures/academy-studio-runtime-fixture.mjs';
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
test('separate Studio uses private sign-in, R2 drafts and guarded publication without accepted-head growth',async()=>{
 const f=await studioRuntimeFixture();try{
 const token=await f.login('global'),selection={activityKey:f.scopes.courseA},connection=await f.connect(token,selection),cookie=connection.cookie;ok(connection);assert(cookie?.startsWith('__Host-website_studio='));
 const reused=await f.send(cookie,'exchange',{code:connection.code,state:connection.state,verifier:connection.verifier});assert.equal(reused.status,401);
 const draft=ok(await f.send(cookie,'get',selection));assert(draft.migrationNeeded);const originalHead=await f.core.prepare('SELECT head_id FROM setup_head_state').first('head_id'),originalComponents=await f.core.prepare('SELECT count(*) n FROM setup_components').first('n');
 draft.document.name='Separate Studio draft';const save={...selection,document:draft.document,revision:draft.revision,operationId:crypto.randomUUID()};const saved=ok(await f.send(cookie,'save',save));assert.equal(saved.revision,1);const listed=ok(await f.send(cookie,'list')).websites.find(r=>r.activityKey===selection.activityKey);assert(listed.hasDraft);assert.equal(listed.revision,1);assert.equal((await f.content.list({prefix:'websites/'})).objects.length,2);
 assert.equal(await f.core.prepare('SELECT head_id FROM setup_head_state').first('head_id'),originalHead);assert.equal(await f.core.prepare('SELECT count(*) n FROM setup_components').first('n'),originalComponents);
 assert.equal((await f.request('/api/academy/course-websites/read',selection,await f.login('studentA'),'LEARN')).status,404);
 assert.equal(ok(await f.send(cookie,'save',save)).replayed,true);
 const pub={...selection,revision:saved.revision,operationId:crypto.randomUUID()},published=ok(await f.send(cookie,'publish',pub));assert.equal(published.revision,2);assert.equal(ok(await f.send(cookie,'publish',pub)).replayed,true);
 const read=ok(await f.request('/api/academy/course-websites/read',selection,await f.login('studentA'),'LEARN'));assert.equal(read.document.name,draft.document.name);
 assert.equal(await f.core.prepare('SELECT head_id FROM setup_head_state').first('head_id'),originalHead);assert.equal(await f.core.prepare('SELECT count(*) n FROM setup_components').first('n'),originalComponents);
 assert.equal((await f.request('/api/admin/platform/course-websites/save',save,token)).status,409);
 assert.equal((await f.send(cookie,'save',{...save,operationId:crypto.randomUUID()})).status,409);
 ok(await f.send(cookie,'withdraw',{...selection,revision:published.revision,operationId:crypto.randomUUID()}));assert.equal((await f.request('/api/academy/course-websites/read',selection,await f.login('studentA'),'LEARN')).status,404);
 const state=await f.core.prepare('SELECT * FROM website_studio_state WHERE website_id=?').bind(selection.activityKey).first();assert(!JSON.stringify(state).includes('Separate Studio draft'));assert(!Object.keys(state).some(k=>k.includes('document')));
 }finally{await f.close();}
});

test('Studio preserves scope, cookie origin, one-use handoffs, concurrent-save conflicts and immediate session revocation',async()=>{
 const f=await studioRuntimeFixture();try{
 for(const who of ['studentA','teacherA','none'])assert.equal((await f.connect(await f.login(who),{activityKey:f.scopes.courseA})).status,403,who);
 const scoped=await f.login('adminA');assert.equal((await f.connect(scoped,{activityKey:f.scopes.courseB})).status,403);
 const c=await f.connect(scoped,{activityKey:f.scopes.courseA});ok(c);const selection={activityKey:f.scopes.courseA},draft=ok(await f.send(c.cookie,'get',selection));
 const origin=await f.studioFetch.fetch('https://studio.test/api/get',{method:'POST',headers:{Origin:'https://attacker.test',Cookie:c.cookie,'Content-Type':'application/json'},body:JSON.stringify(selection)});assert.equal(origin.status,403);
 const save={...selection,document:draft.document,revision:0,operationId:crypto.randomUUID()};ok(await f.send(c.cookie,'save',save));
 const changed={...save,document:structuredClone(save.document)};changed.document.name='Changed retry payload';assert.equal((await f.send(c.cookie,'save',changed)).status,409);
 const a={...save,revision:1,operationId:crypto.randomUUID()},b={...save,revision:1,operationId:crypto.randomUUID()};a.document=structuredClone(a.document);b.document=structuredClone(b.document);a.document.name='Concurrent A';b.document.name='Concurrent B';const pair=await Promise.all([f.send(c.cookie,'save',a),f.send(c.cookie,'save',b)]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);
 const state=await f.core.prepare('SELECT * FROM website_studio_state WHERE website_id=?').bind(selection.activityKey).first();await f.content.delete(state.draft_key);const prior=state.published_key;assert.equal((await f.send(c.cookie,'publish',{...selection,revision:state.revision,operationId:crypto.randomUUID()})).status,503);assert.equal((await f.core.prepare('SELECT published_key FROM website_studio_state WHERE website_id=?').bind(selection.activityKey).first()).published_key,prior);
 await f.core.prepare("UPDATE account_sessions SET revoked_at='local-revocation' WHERE account_id=?").bind(f.actors.adminA).run();assert.equal((await f.send(c.cookie,'get',selection)).status,401);
 const global=await f.login('global'),g=await f.connect(global,selection);ok(g);await f.core.prepare('UPDATE global_role_assignments SET active=0 WHERE account_id=?').bind(f.actors.global).run();assert([401,403].includes((await f.send(g.cookie,'get',selection)).status));
 }finally{await f.close();}
});

test('migrating keeps the private draft separate from the accepted edition and shares image bytes across websites',async()=>{
 const {courseWebsiteTemplate}=await import('../src/academy/course-books/website-template.js');
 const initial=courseWebsiteTemplate({kind:'COURSE',name:'Synthetic existing course'});initial.name='Previously published edition';
 const f=await studioRuntimeFixture({seed:source=>{source.db.prepare('INSERT INTO course_website_documents(activity_key,document_json,updated_at,updated_by) VALUES(?,?,?,?)').run(source.scopes.courseA,JSON.stringify(initial),'local',source.actors.global);}});try{
 const privateDraft=structuredClone(initial);privateDraft.name='Private draft never published';await f.admin.prepare('UPDATE course_website_documents SET document_json=?,revision=2 WHERE activity_key=?').bind(JSON.stringify(privateDraft),f.scopes.courseA).run();
 const componentCount=await f.core.prepare("SELECT count(*) n FROM setup_components WHERE table_name='course_website_documents'").first('n');
 const token=await f.login('global'),c=await f.connect(token,{activityKey:f.scopes.courseA});ok(c);const selection={activityKey:f.scopes.courseA},student=await f.login('studentA');
 assert.equal(ok(await f.request('/api/academy/course-websites/read',selection,student,'LEARN')).document.name,initial.name);
 ok(await f.send(c.cookie,'migrate',selection));assert.equal(ok(await f.send(c.cookie,'get',selection)).document.name,privateDraft.name);assert.equal(ok(await f.request('/api/academy/course-websites/read',selection,student,'LEARN')).document.name,initial.name);
 const image=new Uint8Array([137,80,78,71,13,10,26,10]),sha256=Buffer.from(await crypto.subtle.digest('SHA-256',image)).toString('hex'),ids=[];
 for(const key of [f.scopes.courseA,f.scopes.courseB]){const id=crypto.randomUUID();ids.push(id);ok(await f.send(c.cookie,'upload',{activityKey:key,assetId:id,filename:'shared.png',type:'image/png',size:image.length,sha256,operationId:crypto.randomUUID()},image));}
 assert.equal((await f.content.list({prefix:'images/sha256/'})).objects.length,1,'Two website references share one image body');
 const draft=ok(await f.send(c.cookie,'get',selection));draft.document.home.imageId=ids[1];assert.equal((await f.send(c.cookie,'save',{...selection,document:draft.document,revision:draft.revision,operationId:crypto.randomUUID()})).status,400,'An image reference cannot cross website ownership');
 draft.document.home.imageId=ids[0];draft.document.name='A newly reviewed edition';const save=ok(await f.send(c.cookie,'save',{...selection,document:draft.document,revision:draft.revision,operationId:crypto.randomUUID()}));ok(await f.send(c.cookie,'publish',{...selection,revision:save.revision,operationId:crypto.randomUUID()}));
 const read=ok(await f.request('/api/academy/course-websites/read',selection,student,'LEARN'));assert.equal(read.document.name,draft.document.name);
 const response=await f.request('/api/academy/course-websites/asset',{...selection,assetId:ids[0]},student,'LEARN');assert.equal(response.status,200);assert.deepEqual(response.body,image);
 const object=await f.content.get('images/sha256/'+sha256);assert.deepEqual(new Uint8Array(await object.arrayBuffer()),image);
 assert.equal((await f.core.prepare('SELECT count(*) n FROM setup_components WHERE table_name=\'course_website_documents\'').first()).n,componentCount,'Studio publication adds no accepted body components');
 }finally{await f.close();}
});

test('native PDF/video references are reused with current media access; no media bytes enter Studio storage',async()=>{
 const pdf=new TextEncoder().encode('%PDF-1.4\nSynthetic existing Academy file\n%%EOF'),hash=Buffer.from(await crypto.subtle.digest('SHA-256',pdf)).toString('hex'),lessonId='LM-'+crypto.randomUUID(),pdfId=crypto.randomUUID(),videoId=crypto.randomUUID(),mp4Id=crypto.randomUUID(),key='synthetic/shared-academy.pdf';
 const f=await studioRuntimeFixture({seed:source=>{
  source.db.exec('PRAGMA foreign_keys=OFF;'+readFileSync(new URL('../migrations/academy/0037_session_mp4.sql',import.meta.url),'utf8')+';PRAGMA foreign_keys=ON;');
  source.db.prepare("INSERT INTO lesson_media_lessons(lesson_id,activity_key,lesson_date,title,start_time,end_time,teacher_id,teacher_name,state,source_lessons_json,updated_at) VALUES(?,?,'2026-01-10','Published shared lesson','09:00','10:00',?,'Synthetic teacher','PUBLISHED','[]','local')").run(lessonId,source.scopes.courseA,source.actors.teacherA);
  source.db.prepare("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,object_key,filename,byte_size,created_at) VALUES(?,?,'PDF',?,'shared.pdf',?,'local')").run(pdfId,source.scopes.courseA,key,pdf.length);
  source.db.prepare("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,youtube_id,created_at) VALUES(?,?,'YOUTUBE','9IuTDcSs6vQ','local')").run(videoId,source.scopes.courseA);
  source.db.prepare("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,object_key,filename,byte_size,created_at) VALUES(?,?,'MP4','synthetic/existing-large-recording.mp4','Existing recording.mp4',67108864,?)").run(mp4Id,source.scopes.courseA,new Date().toISOString());
  for(const id of [pdfId,videoId,mp4Id])source.db.prepare('INSERT INTO lesson_media_links VALUES(?,?)').run(lessonId,id);
 }});try{
 await f.mediaBucket.put(key,pdf,{httpMetadata:{contentType:'application/pdf'}});
 const token=await f.login('global'),selection={activityKey:f.scopes.courseA},c=await f.connect(token,selection);ok(c);const draft=ok(await f.send(c.cookie,'get',selection)),refs=[];
 for(const nativeAssetId of [pdfId,videoId,mp4Id]){const id=crypto.randomUUID();refs.push(id);ok(await f.send(c.cookie,'attach',{...selection,assetId:id,lessonId,nativeAssetId,operationId:crypto.randomUUID()}));}
 draft.document.materials.files.push({id:crypto.randomUUID(),assetId:refs[0],title:'Shared Academy PDF',description:''});draft.document.academyMediaIds=[refs[1],refs[2]];
 const saved=ok(await f.send(c.cookie,'save',{...selection,document:draft.document,revision:0,operationId:crypto.randomUUID()}));ok(await f.send(c.cookie,'publish',{...selection,revision:saved.revision,operationId:crypto.randomUUID()}));
 assert.equal((await f.content.list({prefix:'images/'})).objects.length,0);assert((await f.content.list({prefix:'websites/'})).objects.every(o=>o.size<500000));
 const student=await f.login('studentA'),read=ok(await f.request('/api/academy/course-websites/read',selection,student,'LEARN'));assert(read.native.lessons.some(l=>l.id===lessonId&&l.assets.some(a=>a.id===videoId)));
 const download=await f.request('/api/academy/course-websites/asset',{...selection,assetId:refs[0]},student,'LEARN');assert.equal(download.status,200);assert.deepEqual(download.body,pdf);
 assert.equal((await f.request('/api/academy/course-websites/asset',{...selection,assetId:refs[0]},await f.login('studentB'),'LEARN')).status,403);
 const editorDownload=await f.send(c.cookie,'asset',{...selection,assetId:refs[0]});assert.equal(editorDownload.status,200);assert.deepEqual(editorDownload.body,pdf);
 const refsState=await f.core.prepare('SELECT byte_size FROM website_studio_assets WHERE asset_id=?').bind(refs[0]).first();assert.equal(refsState.byte_size,pdf.length);assert.equal(await f.core.prepare('SELECT byte_size FROM website_studio_assets WHERE asset_id=?').bind(refs[2]).first('byte_size'),67108864,'Large existing video references are not capped to PDF/image upload sizes');
 await f.core.prepare("UPDATE lesson_media_lessons SET state='HIDDEN' WHERE lesson_id=?").bind(lessonId).run();assert.equal((await f.request('/api/academy/course-websites/asset',{...selection,assetId:refs[0]},student,'LEARN')).status,403);
 assert(!ok(await f.request('/api/academy/course-websites/read',selection,student,'LEARN')).native.lessons.some(l=>l.id===lessonId));
 }finally{await f.close();}
});

test('Tafseer reading retains paid-month, additional-grant, public Foundations and immediate withdrawal gates',async()=>{
 const f=await studioRuntimeFixture();try{
 const program=f.scopes.programA,id=crypto.randomUUID(),foundation=crypto.randomUUID(),selection={activityKey:program,surahId:id},publicSelection={activityKey:program,surahId:foundation};
 await f.core.batch([f.core.prepare("INSERT INTO program_monthly_media_policies(activity_key,enabled,updated_at,updated_by_account_id) VALUES(?,1,'local',?)").bind(program,f.actors.global),...[[id,'Synthetic Yaseen','yaseen'],[foundation,'Foundations','foundations']].map(([uuid,name,card])=>f.core.prepare("INSERT INTO program_surahs(surah_id,activity_key,name,card_key,completion_date,active,revision,updated_at,updated_by_account_id) VALUES(?,?,?,?,'2024-01-16',1,1,'local',?)").bind(uuid,program,name,card,f.actors.global))]);
 const token=await f.login('global'),c=await f.connect(token,selection);ok(c);
 for(const scope of [selection,publicSelection]){const draft=ok(await f.send(c.cookie,'get',scope)),saved=ok(await f.send(c.cookie,'save',{...scope,document:draft.document,revision:0,operationId:crypto.randomUUID()}));ok(await f.send(c.cookie,'publish',{...scope,revision:saved.revision,operationId:crypto.randomUUID()}));}
 const student=await f.login('studentA'),read=()=>f.request('/api/academy/course-websites/read',selection,student,'LEARN');assert.equal((await read()).status,403);
 await f.core.prepare("INSERT INTO program_monthly_subscriptions(activity_key,account_id,lesson_month,active,class_ids_json,updated_at,updated_by_account_id) VALUES(?,?,'2024-01',1,'[]','local',?)").bind(program,f.actors.studentA,f.actors.global).run();ok(await read());
 await f.core.prepare('UPDATE program_monthly_subscriptions SET active=0 WHERE account_id=?').bind(f.actors.studentA).run();assert.equal((await read()).status,403);
 await f.core.prepare("INSERT INTO program_surah_grants(activity_key,account_id,surah_id,active,revision,updated_at,updated_by_account_id) VALUES(?,?,?,1,1,'local',?)").bind(program,f.actors.studentA,id,f.actors.global).run();ok(await read());
 ok(await f.request('/api/academy/public-surah-websites/read',publicSelection));
 const meta=ok(await f.send(c.cookie,'get',publicSelection));ok(await f.send(c.cookie,'withdraw',{...publicSelection,revision:meta.revision,operationId:crypto.randomUUID()}));assert.equal((await f.request('/api/academy/public-surah-websites/read',publicSelection)).status,404);
 await f.core.prepare('UPDATE program_surahs SET active=0 WHERE surah_id=?').bind(id).run();assert.equal((await read()).status,403);
 }finally{await f.close();}
});


test('failed R2 save or publish cannot advance pointers or receipts; a changed Studio cookie cannot act as the old account',async()=>{
 const f=await studioRuntimeFixture();try{
  const selection={activityKey:f.scopes.courseA},c=await f.connect(await f.login('global'),selection);ok(c);ok(await f.send(c.cookie,'migrate',selection));const draft=ok(await f.send(c.cookie,'get',selection));
  const before=await f.core.prepare('SELECT * FROM website_studio_state WHERE website_id=?').bind(selection.activityKey).first();
  for(const action of ['save','publish']){
   const operationId=crypto.randomUUID(),response=await f.runtime.dispatchFetch('https://studio.test/api/'+action,{method:'POST',headers:{Origin:'https://studio.test',Cookie:c.cookie,'Content-Type':'application/json','X-Local-R2-Failure':'1'},body:JSON.stringify({...selection,document:draft.document,revision:before.revision,operationId})});assert.equal(response.status,503);
   assert.deepEqual(await f.core.prepare('SELECT * FROM website_studio_state WHERE website_id=?').bind(selection.activityKey).first(),before);assert.equal(await f.core.prepare('SELECT count(*) n FROM website_studio_operations WHERE operation_id=?').bind(operationId).first('n'),0);
  }
  const response=await f.runtime.dispatchFetch('https://studio.test/api/get',{method:'POST',headers:{Origin:'https://studio.test',Cookie:c.cookie,'X-Studio-Account':'b'.repeat(64),'Content-Type':'application/json'},body:JSON.stringify(selection)});assert.equal(response.status,401);
 }finally{await f.close();}
});

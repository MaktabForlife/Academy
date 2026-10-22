import {WorkspaceRequest} from './fixtures/workspace-request.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planningFixture} from './academy-d1-planning.test.mjs';
import worker from '../src/academy-runtime.js';
async function fixture(){const f=await planningFixture();const objects=new Map();f.env.LESSON_MEDIA_BUCKET={async put(k,b){objects.set(k,new Uint8Array(b));},async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async delete(k){objects.delete(k);}};return {...f,objects};}
async function use(fn){const f=await fixture();try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{f.db.close();}}
const path='/api/admin/platform/announcements/';
async function request(f,path,token='',body){const r=await worker.fetch(new WorkspaceRequest('https://synthetic.invalid'+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body&&! (body instanceof FormData)?{'Content-Type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})}),f.env);return {status:r.status,headers:r.headers,body:(r.headers.get('Content-Type')||'').includes('json')?await r.json():await r.arrayBuffer()};}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const blank=()=>({id:crypto.randomUUID(),revision:0,operationId:crypto.randomUUID(),title:'Announcement',message:'Welcome\nالسلام عليكم',imageAlt:'Poster',active:false,order:0,removeImage:false});
const png=()=>new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=','base64')],{type:'image/png'});
async function save(f,token,input,image,pdf){const form=new FormData();form.append('metadata',JSON.stringify(input));if(image)form.append('image',image,'poster.png');if(pdf)form.append('pdf',pdf,'prospectus.pdf');return request(f,path+'save',token,form);}
test('announcements permissions, inactive privacy, images, revisions, retries, edits and delete',()=>use(async f=>{
 const admin=await f.login('0001'),teacher=await f.login('0003'),scoped=await f.login('0004');
 assert.deepEqual(ok(await request(f,'/api/academy/announcements')).announcements,[]);
 for(const token of [teacher,scoped]){assert.equal((await request(f,path+'list',token,{})).status,403);assert.equal((await save(f,token,blank(),png())).status,403);}
 assert.equal((await request(f,path+'list','',{})).status,401);
 const input=blank(),saved=ok(await save(f,admin,input,png())).announcement;
 assert.deepEqual(ok(await request(f,'/api/academy/announcements')).announcements,[]);
 assert.equal((await request(f,saved.imageUrl)).status,404);assert.equal((await request(f,saved.imageUrl,admin)).status,200);
 assert.equal(ok(await save(f,admin,input,png())).replayed,true);assert.equal(f.objects.size,1);
 assert.equal((await save(f,admin,{...input,title:'Changed'},png())).status,409);
 const updated=ok(await save(f,admin,{...input,revision:1,operationId:crypto.randomUUID(),active:true})).announcement;
 const list=ok(await request(f,'/api/academy/announcements')).announcements;assert.equal(list.length,1);assert.equal(list[0].message,input.message);assert.equal(list[0].revision,undefined);assert.equal((await request(f,updated.imageUrl)).status,200);
 assert.equal((await save(f,admin,{...input,operationId:crypto.randomUUID()})).status,409);
 const deleted=await request(f,path+'delete',admin,{id:input.id,revision:2,operationId:crypto.randomUUID()});ok(deleted);assert.equal(f.objects.size,0);assert.equal((await request(f,updated.imageUrl)).status,404);assert.equal(ok(await request(f,path+'list',admin,{})).announcements.length,0);
}));
test('announcement image validation, empty messages, ordering and transactional rollback',()=>use(async f=>{
 const admin=await f.login('0001');assert.equal((await save(f,admin,{...blank(),message:''})).status,400);
 assert.equal((await save(f,admin,blank(),new Blob(['<svg/>'],{type:'image/png'}))).status,400);
 assert.equal((await save(f,admin,blank(),new Blob([new Uint8Array(5*1024*1024+1)],{type:'image/png'}))).status,413);
 for(const order of [4,1])ok(await save(f,admin,{...blank(),active:true,order}));assert.deepEqual(ok(await request(f,path+'list',admin,{})).announcements.map(r=>r.order),[1,4]);
 f.db.exec("CREATE TRIGGER fail_announcement_audit BEFORE INSERT ON audit_events WHEN NEW.record_kind='ANNOUNCEMENTS' BEGIN SELECT RAISE(ABORT,'injected'); END");
 assert.equal((await save(f,admin,blank(),png())).status,503);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_announcements').get().n,2);
}));
test('plans not required removes expectations, retains submitted history, allows optional plans and checks scope',()=>use(async f=>{
 const admin=await f.login('0004'),teacher=await f.login('0003');
 const actual=f.db.prepare("SELECT activity_key FROM role_assignments WHERE account_id='account-0004' AND role='PROGRAM_ADMIN' LIMIT 1").get().activity_key;
 const policy={activityKey:actual,revision:0,weeklyDay:0,weeklyTime:'18:00',courseLeadDays:3,plansRequired:false,operationId:crypto.randomUUID()};
 ok(await f.call('/api/academy/planning/policy',policy,admin));let board=ok(await f.call('/api/academy/planning/list',{view:'admin',activityKey:actual,weekStart:'2026-10-19'},admin));assert.equal(board.plans.length,0);assert.equal(board.areas.find(a=>a.key===actual).policy.plansRequired,false);
 assert.equal((await f.call('/api/academy/planning/policy',{...policy,revision:1,operationId:crypto.randomUUID()},teacher)).status,403);
 ok(await f.call('/api/academy/planning/submit',{activityKey:actual,weekStart:'2026-10-19',period:'WEEKLY',revision:0,operationId:crypto.randomUUID(),content:{title:'Optional plan',overview:'Revision',reflection:'',lessons:[]}},teacher));board=ok(await f.call('/api/academy/planning/list',{view:'admin',activityKey:actual,weekStart:'2026-10-19'},admin));assert.equal(board.plans.length,1);assert(board.plans[0].submittedAt);
}));
test('Global Admin authority revoked during image upload prevents announcement publication',()=>use(async f=>{
 const admin=await f.login('0001'),put=f.env.LESSON_MEDIA_BUCKET.put;
 f.env.LESSON_MEDIA_BUCKET.put=async(k,b)=>{await put(k,b);f.db.exec("UPDATE global_role_assignments SET active=0 WHERE account_id='account-0001'");};
 const input={...blank(),active:true};const result=await save(f,admin,input,png());assert(result.status>=400);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_announcements').get().n,0);assert.deepEqual(ok(await request(f,'/api/academy/announcements')).announcements,[]);assert.equal((await request(f,'/api/academy/announcements/image?id='+input.id)).status,404);
}));

const pdf=(text='Synthetic prospectus')=>new Blob(['%PDF-1.4\n'+text+'\n%%EOF'],{type:'application/pdf'});
test('announcement PDFs preserve exact bytes, protect drafts, replay safely and retain links on replacement',()=>use(async f=>{
 const admin=await f.login('0001'),teacher=await f.login('0003'),input={...blank(),message:'',removePdf:false},document=pdf();
 assert.equal((await save(f,teacher,input,null,document)).status,403);
 const saved=ok(await save(f,admin,input,png(),document)).announcement;
 assert.equal(saved.pdfName,'prospectus.pdf');assert.equal(saved.pdfBytes,document.size);assert.equal(f.objects.size,2);
 assert.equal((await request(f,saved.pdfUrl)).status,404);assert.equal((await request(f,saved.pdfUrl,teacher)).status,404);
 const draft=await request(f,saved.pdfUrl,admin);ok(draft);assert.equal(draft.headers.get('Content-Type'),'application/pdf');assert.equal(draft.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(draft.headers.get('Cache-Control'),'no-store');assert(draft.headers.get('Content-Disposition').startsWith('inline;'));
 assert.deepEqual(Buffer.from(draft.body),Buffer.from(await document.arrayBuffer()));
 assert.equal(ok(await save(f,admin,input,png(),document)).replayed,true);assert.equal(f.objects.size,2);
 assert.equal((await save(f,admin,input,png(),pdf('Different bytes'))).status,409);assert.equal(f.objects.size,2);
 const active=ok(await save(f,admin,{...input,revision:1,operationId:crypto.randomUUID(),active:true})).announcement;
 assert.equal(active.pdfUrl,saved.pdfUrl);assert.equal((await request(f,saved.pdfUrl)).status,200);
 const publicRow=ok(await request(f,'/api/academy/announcements')).announcements[0];assert.equal(publicRow.pdfUrl,saved.pdfUrl);assert.equal(publicRow.pdfName,saved.pdfName);assert.equal(publicRow.pdf_json,undefined);assert.equal(publicRow.pdfKey,undefined);assert.equal(publicRow.revision,undefined);assert(!JSON.stringify(publicRow).includes('academy-announcements/'));
 // An older website omits removePdf: an ordinary edit still preserves the file.
 const oldClient={...blank(),id:input.id,revision:2,active:true};const preserved=ok(await save(f,admin,oldClient)).announcement;assert.equal(preserved.pdfUrl,saved.pdfUrl);
 const replaced=ok(await save(f,admin,{...oldClient,revision:3,operationId:crypto.randomUUID()},null,pdf('Replacement'))).announcement;assert.equal(replaced.pdfUrl,saved.pdfUrl);assert.equal(f.objects.size,2);assert(Buffer.from((await request(f,saved.pdfUrl)).body).includes(Buffer.from('Replacement')));
 const inactive=ok(await save(f,admin,{...oldClient,revision:4,operationId:crypto.randomUUID(),active:false})).announcement;assert.equal((await request(f,inactive.pdfUrl)).status,404);
 ok(await request(f,path+'delete',admin,{id:input.id,revision:5,operationId:crypto.randomUUID()}));assert.equal(f.objects.size,0);assert.equal(f.db.prepare("SELECT count(*) n FROM academy_settings WHERE setting_key LIKE 'AnnouncementPdf:%'").get().n,0);assert.equal((await request(f,saved.pdfUrl,admin)).status,404);
}));
test('PDF-only announcements, independent removal, safe filenames, HEAD and bounded upload validation',()=>use(async f=>{
 const admin=await f.login('0001'),input={...blank(),message:'',active:true,removePdf:false};
 const saved=ok(await save(f,admin,input,null,pdf())).announcement;assert.equal(saved.imageUrl,'');assert.equal(f.objects.size,1);
 const response=await worker.fetch(new WorkspaceRequest('https://synthetic.invalid'+saved.pdfUrl,{method:'HEAD'}),f.env);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Length'),String(saved.pdfBytes));assert.equal((await response.arrayBuffer()).byteLength,0);
 assert.equal((await save(f,admin,{...input,revision:1,operationId:crypto.randomUUID(),removePdf:true})).status,400);assert.equal(f.objects.size,1);
 const removed=ok(await save(f,admin,{...input,revision:1,operationId:crypto.randomUUID(),message:'Now a message',removePdf:true})).announcement;assert.equal(removed.pdfUrl,'');assert.equal(f.objects.size,0);assert.equal((await request(f,saved.pdfUrl)).status,404);
 for(const file of [new Blob(['<html>'],{type:'application/pdf'}),new Blob(['%PDF-1.4'],{type:'text/html'}),new Blob([],{type:'application/pdf'})])assert.equal((await save(f,admin,blank(),null,file)).status,400);
 assert.equal((await save(f,admin,blank(),null,new Blob([new Uint8Array(10*1024*1024+1)],{type:'application/pdf'}))).status,413);
 assert.equal((await save(f,admin,{...blank(),removePdf:'true'},null,pdf())).status,400);
 const form=new FormData();form.append('metadata',JSON.stringify({...blank(),active:true}));form.append('pdf',pdf(),'السلام "book".pdf');const named=ok(await request(f,path+'save',admin,form)).announcement;
 const namedResponse=await request(f,named.pdfUrl);assert.match(namedResponse.headers.get('Content-Disposition'),/filename\*=UTF-8''%D8/);assert.equal(named.pdfName,'السلام "book".pdf');
}));
test('failed PDF commits clean up unreferenced uploads and preserve the previous attachment',()=>use(async f=>{
 const admin=await f.login('0001'),input={...blank(),active:true},saved=ok(await save(f,admin,input,null,pdf())).announcement;
 f.db.exec("CREATE TRIGGER fail_pdf_audit BEFORE INSERT ON audit_events WHEN NEW.record_kind='ANNOUNCEMENTS' BEGIN SELECT RAISE(ABORT,'injected'); END");
 assert.equal((await save(f,admin,{...input,revision:1,operationId:crypto.randomUUID()},null,pdf('Uncommitted'))).status,503);assert.equal(f.objects.size,1);assert(Buffer.from((await request(f,saved.pdfUrl)).body).includes(Buffer.from('Synthetic prospectus')));
 f.db.exec('DROP TRIGGER fail_pdf_audit');const put=f.env.LESSON_MEDIA_BUCKET.put;f.env.LESSON_MEDIA_BUCKET.put=async(k,b)=>{await put(k,b);f.db.exec("UPDATE global_role_assignments SET active=0 WHERE account_id='account-0001'");};
 assert((await save(f,admin,{...input,revision:1,operationId:crypto.randomUUID()},null,pdf('Revoked admin'))).status>=400);assert.equal(f.objects.size,1);assert.equal(f.db.prepare('SELECT revision FROM academy_announcements').get().revision,1);
}));

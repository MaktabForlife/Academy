import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/academy-runtime.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
import {pdfBookmark,publicPdfFile,pdfBookmarkLink} from '../../js/m4l-pdf-bookmarks-model.mjs';
const file='/pdf-file/'+Buffer.from('https://archive.org/download/collection/Volume2.pdf').toString('base64url');
const bookmark={file,title:'Collection · Volume 2',page:11,pageLabel:'11'};
async function post(env,action,input={},token=''){
 const path=action.startsWith('/')?action:'/api/academy/bookmarks/'+action;
 const response=await worker.fetch(new Request('http://synthetic.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);
 return {status:response.status,body:await response.json()};
}
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
const login=async(env,id='0002')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+id,pin:'1234'})).token;
async function fixture(){const f=await courseFixture();f.db.exec(readFileSync(new URL('../migrations/academy/0025_pdf_bookmarks.sql',import.meta.url),'utf8'));return f;}

test('bookmarks are private to each signed-in account, including when another Global Admin knows the key',async()=>{
 const f=await fixture();try{
  const student=await login(f.env),other=await login(f.env,'0003'),admin=await login(f.env,'0001');
  assert.equal((await post(f.env,'list')).status,401);assert.equal((await post(f.env,'save',{bookmark})).status,401);
  const saved=ok(await post(f.env,'save',{bookmark,accountId:'account-0003'},student)).bookmark;
  assert.equal(f.db.prepare('SELECT account_id FROM academy_pdf_bookmarks').get().account_id,'account-0002');
  for(const token of [other,admin]){assert.deepEqual(ok(await post(f.env,'list',{accountId:'account-0002'},token)).bookmarks,[]);ok(await post(f.env,'delete',{key:saved.key,accountId:'account-0002'},token));}
  assert.equal(ok(await post(f.env,'list',{},student)).bookmarks.length,1);
  const secondDevice=await login(f.env);assert.equal(ok(await post(f.env,'list',{},secondDevice)).bookmarks[0].page,11);
  ok(await post(f.env,'delete',{key:saved.key},secondDevice));ok(await post(f.env,'delete',{key:saved.key},secondDevice));assert.deepEqual(ok(await post(f.env,'list',{},student)).bookmarks,[]);
 }finally{f.db.close();}
});
test('book and individual-page bookmarks are distinct, bounded and idempotent with indexed account reads',async()=>{
 const f=await fixture();try{
  const token=await login(f.env),input={bookmark};const before=f.queries.length;
  const first=ok(await post(f.env,'save',input,token));assert.ok(f.queries.length-before<15);
  const again=ok(await post(f.env,'save',input,token));assert.equal(first.bookmark.key,again.bookmark.key);
  ok(await post(f.env,'save',{bookmark:{...bookmark,page:0,pageLabel:''}},token));ok(await post(f.env,'save',{bookmark:{...bookmark,page:4}},token));
  const list=ok(await post(f.env,'list',{},token)).bookmarks;assert.deepEqual(list.map(b=>b.page).sort((a,b)=>a-b),[0,4,11]);assert.ok(list.every(b=>b.file===file&&b.title.includes('Volume 2')));
  const plan=f.db.prepare('EXPLAIN QUERY PLAN SELECT * FROM academy_pdf_bookmarks WHERE account_id=? ORDER BY updated_at DESC,bookmark_key LIMIT 200').all('account-0002');assert.ok(plan.some(row=>/SEARCH.*PRIMARY KEY.*account_id/.test(row.detail)));
 }finally{f.db.close();}
});
test('invalid PDF sources, page numbers and bookmark keys cannot be persisted',async()=>{
 const f=await fixture();try{
  const token=await login(f.env);
  for(const change of [{file:'/private.pdf'},{file:'/pdf-file/'+Buffer.from('https://evil.example/file.pdf').toString('base64url')},{page:-1},{page:1.1},{page:100001},{title:''},{title:'x'.repeat(241)},{pageLabel:'x'.repeat(41)}])assert.equal((await post(f.env,'save',{bookmark:{...bookmark,...change}},token)).status,400);
  assert.equal((await post(f.env,'delete',{key:'invalid'},token)).status,400);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_pdf_bookmarks').get().n,0);
 }finally{f.db.close();}
});
test('a revoked session is rejected inside the bookmark transaction and injected failures roll back',async()=>{
 const f=await fixture();try{
  const token=await login(f.env),native=f.env.ACADEMY_DB.withSession();let revoked=false;
  f.env.ACADEMY_DB={...native,withSession(){return this;},prepare(sql){if(!revoked&&/INSERT INTO academy_write_guards/.test(sql)){revoked=true;f.db.exec("UPDATE account_sessions SET revoked_at='2026-01-01' WHERE account_id='account-0002'");}return native.prepare(sql);}};
  assert.equal((await post(f.env,'save',{bookmark},token)).status,401);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_pdf_bookmarks').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);
 }finally{f.db.close();}
 const g=await fixture();try{
  const token=await login(g.env);g.db.exec("CREATE TRIGGER bookmark_fail BEFORE INSERT ON academy_pdf_bookmarks BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");assert.equal((await post(g.env,'save',{bookmark},token)).status,503);assert.equal(g.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);
 }finally{g.db.close();}
});
test('the per-account bookmark limit allows retrying an existing bookmark without scanning other accounts',async()=>{
 const f=await fixture();try{
  const token=await login(f.env);ok(await post(f.env,'save',{bookmark},token));
  const insert=f.db.prepare('INSERT INTO academy_pdf_bookmarks VALUES(?,?,?,?,?,?,?,?)');
  for(let i=1;i<200;i++)insert.run('account-0002',i.toString(16).padStart(64,'0'),file,'Seed book',i,'','2026-01-01','2026-01-01');
  ok(await post(f.env,'save',{bookmark},token));const full=await post(f.env,'save',{bookmark:{...bookmark,page:999}},token);assert.equal(full.status,400);assert.equal(full.body.code,'BOOKMARK_LIMIT');assert.equal(ok(await post(f.env,'list',{},token)).bookmarks.length,200);
 }finally{f.db.close();}
});
test('bookmark links contain the selected PDF and physical page; source validation rejects private and active URLs',()=>{
 assert.equal(new URL(pdfBookmarkLink(bookmark),'https://academy.invalid').searchParams.get('page'),'11');assert.equal(pdfBookmark({...bookmark,page:0}).pageLabel,'');
 for(const url of ['https://archive.org.evil.example/download/a.pdf','https://user:pass@archive.org/download/a.pdf','http://archive.org/download/a.pdf','https://archive.org/download/a.pdf?ticket=secret','https://drive.google.com/file/secret','javascript:alert(1)'])assert.equal(publicPdfFile('/pdf-file/'+Buffer.from(url).toString('base64url')),'');
 assert.equal(publicPdfFile(file),file);
});

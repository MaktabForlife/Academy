import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {fixtureDatabase} from './fixtures/academy-d1-fixture.mjs';
const path='/api/admin/platform/user-profiles/';
async function post(env,url,input={},token=''){
  const response=await worker.fetch(new Request('http://localhost'+url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);
  return {status:response.status,body:await response.json()};
}
const login=(env,id='login-0001',pin='1234')=>post(env,'/api/account/login',{uniqueid:id,pin});
async function use(fn){
  const f=await fixtureDatabase();
  for(const name of ['0004_management_transactions.sql','0011_account_contact_details.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));
  f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
  const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('External services prohibited');};
  try{await fn(f);assert.deepEqual(f.db.prepare('SELECT * FROM academy_write_guards').all(),[]);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{globalThis.fetch=old;f.db.close();}
}
const directory=async(env,token)=>(await post(env,path+'get',{},token)).body;
const edit=(a,extra={})=>({mode:'profile',accountId:a.accountId,creating:false,displayName:a.displayName,active:a.active,uniqueId:a.uniqueId,whatsappNumber:a.whatsappNumber,baseRevision:a.revision,operationId:crypto.randomUUID(),...extra});

test('Login IDs and WhatsApp contacts are editable without replacing account identity or credentials',()=>use(async({env,db})=>{
  const token=(await login(env)).body.token,a=(await directory(env,token)).accounts.find(a=>a.accountId==='account-0002');
  const before=db.prepare('SELECT * FROM account_credentials WHERE account_id=?').get(a.accountId),memberships=db.prepare('SELECT * FROM class_memberships WHERE account_id=?').all(a.accountId);
  const input=edit(a,{uniqueId:'Learner2026',whatsappNumber:'+27 82 123 4567'}),saved=await post(env,path+'save',input,token);
  assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.profile.uniqueId,'Learner2026');assert.equal(saved.body.profile.whatsappNumber,'+27 82 123 4567');
  assert.equal((await directory(env,token)).accounts.find(entry=>entry.accountId===a.accountId).revision,saved.body.profile.revision);
  assert.equal((await login(env,'learner2026')).status,200);assert.equal((await login(env,'login-0002')).status,404);
  assert.deepEqual(db.prepare('SELECT * FROM account_credentials WHERE account_id=?').get(a.accountId),before);
  assert.deepEqual(db.prepare('SELECT * FROM class_memberships WHERE account_id=?').all(a.accountId),memberships);
  assert.equal((await post(env,path+'save',input,token)).body.replayed,true);
  const current=(await directory(env,token)).accounts.find(a=>a.accountId==='account-0002');
  for(const uniqueId of ['','a b','a-b','a_b','a@b','école','123'.repeat(44)])assert.equal((await post(env,path+'save',edit(current,{uniqueId}),token)).body.code,'INVALID_LOGIN_ID');
  assert.equal((await post(env,path+'save',edit(current,{whatsappNumber:'not a number'}),token)).body.code,'INVALID_WHATSAPP');
  assert.equal((await post(env,path+'save',edit(current,{whatsappNumber:''}),token)).status,200);
  assert.equal(db.prepare('SELECT whatsapp_number FROM account_contact_details WHERE account_id=?').get(a.accountId).whatsapp_number,'');
}));

test('case-insensitive Login ID collisions include inactive users; concurrent saves cannot duplicate IDs',()=>use(async({env,db})=>{
  const token=(await login(env)).body.token,data=await directory(env,token),a=data.accounts.find(a=>a.accountId==='account-0002'),b=data.accounts.find(a=>a.accountId==='account-0003');
  const results=await Promise.all([post(env,path+'save',edit(a,{uniqueId:'SharedID'}),token),post(env,path+'save',edit(b,{uniqueId:'sharedid'}),token)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(results.find(r=>r.status===409).body.code,'DUPLICATE_LOGIN_ID');
  const owner=db.prepare("SELECT account_id FROM accounts WHERE login_link_id='sharedid'").get().account_id;
  db.prepare('UPDATE accounts SET active=0,revision=revision+1 WHERE account_id=?').run(owner);
  const other=(await directory(env,token)).accounts.find(a=>a.accountId===(owner===a.accountId?b.accountId:a.accountId));
  assert.equal((await post(env,path+'save',edit(other,{uniqueId:'SHAREDID'}),token)).body.code,'DUPLICATE_LOGIN_ID');
  const before=db.prepare('SELECT account_id,display_name,login_link_id FROM accounts').all(),latest=await directory(env,token);
  const entries=latest.accounts.filter(a=>['account-0004','account-0005'].includes(a.accountId)).map((a,i)=>edit(a,{displayName:'Should roll back '+i,uniqueId:i?'SameBatch':'samebatch'}));
  assert.equal((await post(env,path+'save',{mode:'batch',entries,operationId:crypto.randomUUID()},token)).body.code,'DUPLICATE_LOGIN_ID');assert.deepEqual(db.prepare('SELECT account_id,display_name,login_link_id FROM accounts').all(),before);
}));

test('Global Admin PIN reset revokes every session, supports setup, and replay cannot reset a newly chosen PIN',()=>use(async({env,db})=>{
  const token=(await login(env)).body.token,student=(await login(env,'login-0002')).body.token,student2=(await login(env,'login-0002')).body.token;
  const data=await directory(env,token),a=data.accounts.find(a=>a.accountId==='account-0002');assert.equal(data.resetPinEditable,true);assert.equal(data.whatsappEditable,true);
  const input={mode:'reset-pin',accountId:a.accountId,baseRevision:a.revision,operationId:crypto.randomUUID()},reset=await post(env,path+'save',input,token);
  assert.equal(reset.status,200,JSON.stringify(reset.body));assert.equal(reset.body.loginPath,'/account/login-0002');
  assert.equal((await post(env,'/api/account/session',{},student)).status,401);assert.equal((await post(env,'/api/account/session',{},student2)).status,401);
  assert.equal((await login(env,'login-0002')).body.code,'PIN_NOT_SET');assert.equal((await post(env,'/api/account/check',{uniqueid:'login-0002'})).body.account.pinsetup,false);
  const setup=await post(env,'/api/account/setup-pin',{uniqueid:'login-0002',pin:'5678',pinConfirmation:'5678'});assert.equal(setup.status,200,JSON.stringify(setup.body));
  const credential=db.prepare('SELECT * FROM account_credentials WHERE account_id=?').get(a.accountId);
  assert.equal((await post(env,path+'save',input,token)).body.replayed,true);assert.deepEqual(db.prepare('SELECT * FROM account_credentials WHERE account_id=?').get(a.accountId),credential);
  assert.equal((await login(env,'login-0002','5678')).status,200);
  const audit=db.prepare("SELECT * FROM audit_events WHERE action='reset-pin'").all();assert.equal(audit.length,1);assert.equal(audit[0].authority,'GLOBAL_ADMIN');
  assert(!JSON.stringify([reset.body,audit]).includes('5678'));assert(!JSON.stringify([reset.body,audit]).includes('pin_hash'));
}));

test('PIN reset rejects scoped roles, stale records, own account, and revoked administrators',()=>use(async({env,db})=>{
  const token=(await login(env)).body.token,data=await directory(env,token),a=data.accounts.find(a=>a.accountId==='account-0002');
  const request=()=>({mode:'reset-pin',accountId:a.accountId,baseRevision:a.revision,operationId:crypto.randomUUID()});
  for(const id of ['0002','0003','0004']){const scoped=(await login(env,'login-'+id)).body.token;assert.equal((await post(env,path+'get',{},scoped)).status,403);assert.equal((await post(env,path+'save',request(),scoped)).status,403);}
  assert.equal((await post(env,path+'save',{...request(),accountId:'account-0001',baseRevision:data.accounts[0].revision},token)).body.code,'OWN_PIN_RESET');
  db.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id=?').run(a.accountId);
  assert.equal((await post(env,path+'save',request(),token)).body.code,'ROW_CHANGED');assert.equal(db.prepare('SELECT pin_setup FROM account_credentials WHERE account_id=?').get(a.accountId).pin_setup,1);
  db.exec("UPDATE global_role_assignments SET active=0 WHERE account_id='account-0001'");
  assert.ok([401,403].includes((await post(env,path+'save',request(),token)).status));
}));

test('credential changes during reset planning roll back instead of clearing a newly set PIN',()=>use(async({env,db})=>{
  const token=(await login(env)).body.token,a=(await directory(env,token)).accounts.find(a=>a.accountId==='account-0002'),native=env.ACADEMY_DB.batch.bind(env.ACADEMY_DB);let changed=false;
  const sqlByStatement=new WeakMap(),prepare=env.ACADEMY_DB.prepare.bind(env.ACADEMY_DB);
  env.ACADEMY_DB.withSession=()=>({prepare:sql=>{const statement=prepare(sql),bind=statement.bind;statement.bind=(...values)=>{const bound=bind(...values);sqlByStatement.set(bound,sql);return bound;};sqlByStatement.set(statement,sql);return statement;},batch:async statements=>{
    if(!changed&&statements.some(s=>sqlByStatement.get(s)?.includes("UPDATE account_credentials SET pin_hash=''"))){changed=true;db.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id=?').run(a.accountId);}
    return native(statements);
  }});
  const result=await post(env,path+'save',{mode:'reset-pin',accountId:a.accountId,baseRevision:a.revision,operationId:crypto.randomUUID()},token);
  assert.equal(changed,true,JSON.stringify(result));assert.equal(result.body.code,'ROW_CHANGED');assert.equal(db.prepare('SELECT pin_setup FROM account_credentials WHERE account_id=?').get(a.accountId).pin_setup,1);
}));

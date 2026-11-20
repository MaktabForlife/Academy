import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database} from './helpers.mjs';
import {captureDDL,inspectCaptureSchema,assertRegistrySurface} from '../capture.mjs';
const q=n=>'"'+n+'"';
function ensureOwner(f,sub){if(!f.raw.prepare('SELECT 1 FROM accounts WHERE account_id=?').get(sub))f.raw.prepare('INSERT INTO accounts(account_id,active) VALUES(?,1)').run(sub);}
const regs=new Map(['Academy','AcademyStudio','Hifz'].map(app=>[app,JSON.parse(readFileSync(new URL('../../../../'+app+'/security/v2/native-authority.json',import.meta.url),'utf8'))]));
function nativeFixture(registry){
 const f=database(registry.app),available={};
 for(const [table,rule] of Object.entries(registry.rules)){
  const columns=registry.schemaColumns[table];available[table]=columns;
  f.raw.exec('CREATE TABLE '+q(table)+'(_fixture_id INTEGER PRIMARY KEY,'+columns.map(c=>q(c)+' '+(/(?:epoch|revision|active|enabled|generation|pin_setup|global_admin|admitted|singleton)$/.test(c)?'INTEGER':'TEXT')).join(',')+');');
 }
 const recipe=captureDDL({registry,available,ownerEpoch:'isolated-owner-epoch'});f.raw.exec(recipe.sql);
 return {...f,available,recipe};
}
for(const [app,registry] of regs){
 test(app+' database capture covers INSERT, UPDATE and DELETE for every declared authority table',()=>{
  const f=nativeFixture(registry);
  for(const [table,rule] of Object.entries(registry.rules)){
   if(app==='Hifz'&&table==='students')f.raw.prepare('INSERT INTO academy_profile_links(academy_user_id,student_id,source_revision,source_credential_epoch,pin_reset_version) VALUES(?,?,1,1,0)').run('mapped-academy','synthetic-id');
   if(rule.canonicalOwner)ensureOwner(f,'synthetic-account_id');
   const cols=registry.schemaColumns[table],values=cols.map(c=>table==='academy_settings'&&c==='setting_key'?'PersonalMemorisationCards':/(?:epoch|revision|active|enabled|generation|pin_setup|global_admin|admitted|singleton)$/.test(c)?1:'synthetic-'+c),before=f.raw.prepare('SELECT count(*) n FROM jwt_v2_authority_changes').get().n;
   f.raw.prepare('INSERT INTO '+q(table)+'('+cols.map(q).join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').run(...values);
   assert(f.raw.prepare('SELECT count(*) n FROM jwt_v2_authority_changes').get().n>before,table+' insert');
   let n=f.raw.prepare('SELECT count(*) n FROM jwt_v2_authority_changes').get().n;
   const field=table==='academy_settings'?'setting_value':rule.columns.find(c=>c!==rule.accountColumn)||rule.columns[0];
   if(rule.canonicalOwner&&field===rule.accountColumn)ensureOwner(f,'changed-'+field);
   f.raw.prepare('UPDATE '+q(table)+' SET '+q(field)+'=?').run(/(?:epoch|revision|active|enabled|generation|pin_setup|global_admin|admitted|singleton)$/.test(field)?2:'changed-'+field);
   assert(f.raw.prepare('SELECT count(*) n FROM jwt_v2_authority_changes').get().n>n,table+' update');
   n=f.raw.prepare('SELECT count(*) n FROM jwt_v2_authority_changes').get().n;f.raw.exec('DELETE FROM '+q(table));
   assert(f.raw.prepare('SELECT count(*) n FROM jwt_v2_authority_changes').get().n>n,table+' delete');
  }
 });
 test(app+' capture rolls back with the failed native business transaction',()=>{
  const f=nativeFixture(registry),table=Object.keys(registry.rules)[0],cols=registry.schemaColumns[table],values=cols.map(c=>/(?:epoch|revision|active|enabled|generation|pin_setup|global_admin|admitted|singleton)$/.test(c)?1:'value');
  f.raw.exec('BEGIN');f.raw.prepare('INSERT INTO '+q(table)+'('+cols.map(q).join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').run(...values);f.raw.exec('ROLLBACK');
  assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_authority_changes').get().n,0);
 });
 test(app+' installer refuses missing required authority tables and columns',()=>{
  const f=nativeFixture(registry),name=Object.entries(registry.rules).find(([,r])=>r.required)[0],absent={...f.available};delete absent[name];
  assert.throws(()=>captureDDL({registry,available:absent,ownerEpoch:'epoch'}),/REQUIRED_AUTHORITY_TABLE/);
  assert.throws(()=>captureDDL({registry,available:{...f.available,[name]:[]},ownerEpoch:'epoch'}),/COLUMN_MISMATCH/);
 });
}
test('Hifz role and canonical Academy/native-student mapping are captured using their actual field names',()=>{
 const r=regs.get('Hifz');assert(r.rules.students.columns.includes('role'));assert(r.rules.academy_profile_links.columns.includes('academy_user_id'));assert(r.rules.academy_profile_links.columns.includes('source_credential_epoch'));
});
test('Studio account status and paid/month/course/source gates are authority inputs',()=>{
 const r=regs.get('AcademyStudio');
 for(const c of ['active','admitted','epoch','global_admin'])assert(r.rules.accounts.columns.includes(c));
 assert(r.rules.paid_months.columns.includes('month'));assert(r.rules.source_access_scopes.columns.includes('authority'));
});
test('unclassified authority fields cannot be added to the rights serializer',()=>{
 assert.throws(()=>assertRegistrySurface({registry:regs.get('Hifz'),rightsInputs:{students:['role','unreviewed_grant']}}),/UNCLASSIFIED/);
});
test('Hifz journal saves and progress stay outside authentication invalidation',()=>{
 const r=regs.get('Hifz'),f=nativeFixture(r);
 f.raw.exec('CREATE TABLE sabaq_log(id TEXT,student_id TEXT,notes TEXT);INSERT INTO sabaq_log VALUES(\'row\',\'student\',\'saved work\');UPDATE sabaq_log SET notes=\'updated work\';');
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_authority_changes').get().n,0);assert.deepEqual(Object.keys(r.rules).sort(),['academy_identity_migrations','academy_profile_links','academy_profile_provenance','students']);
});
test('monthly payment note/revision change does not invalidate rights and capture never contains PIN hashes',()=>{
 const r=regs.get('Academy'),f=nativeFixture(r),table='program_monthly_subscriptions',cols=r.schemaColumns[table],values=cols.map(c=>/(?:revision|active)$/.test(c)?1:'synthetic-'+c);
 ensureOwner(f,'synthetic-account_id');f.raw.prepare('INSERT INTO '+table+'('+cols.map(q).join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').run(...values);
 const n=f.raw.prepare('SELECT count(*) n FROM jwt_v2_authority_changes').get().n;
 f.raw.exec("UPDATE program_monthly_subscriptions SET note='payment detail',revision=revision+1;");
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_authority_changes').get().n,n);
 ensureOwner(f,'synthetic');f.raw.prepare('INSERT INTO account_credentials(account_id,pin_hash,pin_setup,credential_epoch) VALUES(?,?,1,4)').run('synthetic','DO-NOT-LOG-HASH');
 assert(!JSON.stringify(f.raw.prepare('SELECT * FROM jwt_v2_authority_changes').all()).includes('DO-NOT-LOG-HASH'));
});

import {academyD1Repository} from '../../src/academy/d1/repository.js';
import {restoreSnapshot,digest} from './snapshot.mjs';
import {sqliteD1} from './sqlite-d1.mjs';
const roleSet=state=>[...new Set(state.roles.map(r=>r.activity_key.toUpperCase()+'|'+r.role))].sort();
const subscriptions=state=>state.subscriptions.map(r=>r.activity_key.toUpperCase()).sort();
export async function verifyCurrentAuthority(snapshot,selection,prepared){
 const original=restoreSnapshot(snapshot),run=original.prepare("SELECT run_id FROM migration_runs WHERE state='CUTOVER'").get();if(!run){original.close();throw Error('Verified active source run missing.');}
 const common={ENVIRONMENT:'development',ACADEMY_D1_MODE:'ACTIVE',ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY',ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MEDIA_SEPARATION:'1',ACADEMY_SPLIT_COORDINATOR:{getByName(){throw Error('Offline authority verification cannot write.');}}};
 const source=academyD1Repository({...common,ACADEMY_DB:sqliteD1(original),ACADEMY_D1_RUN_ID:run.run_id}),target=academyD1Repository({...common,ACADEMY_DB:sqliteD1(prepared.databases.core),ACADEMY_ADMIN_DB:sqliteD1(prepared.databases.admin),ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:selection.manifest.sourceDigest});
 try{
  await source.ready();const mismatches=[];
  for(const account of selection.rows.accounts){const before=await source.byLogin(account.login_link_id),after=await target.byLogin(account.login_link_id);const expected={active:before.account.active,globalAdmin:before.account.global_admin,epoch:before.account.credential_epoch,pinDigest:digest(before.account.pin_hash||''),roles:roleSet(before),subscriptions:subscriptions(before),contexts:before.contexts};const actual={active:after.account.active,globalAdmin:after.account.global_admin,epoch:after.account.credential_epoch,pinDigest:digest(after.account.pin_hash||''),roles:roleSet(after),subscriptions:subscriptions(after),contexts:after.contexts};if(JSON.stringify(expected)!==JSON.stringify(actual))mismatches.push({accountDigest:digest(account.account_id),fields:Object.keys(expected).filter(k=>JSON.stringify(expected[k])!==JSON.stringify(actual[k]))});}
  const selected=new Set(selection.rows.accounts.map(r=>r.account_id)),hifzBefore=original.prepare('SELECT account_id,role,active FROM hifz_profile_sync_projection ORDER BY account_id').all().filter(r=>selected.has(r.account_id)),hifzAfter=prepared.databases.core.prepare('SELECT account_id,role,active FROM hifz_profile_sync_projection ORDER BY account_id').all();
  const report={accountsChecked:selection.rows.accounts.length,authorityMismatches:mismatches,hifzEquivalent:JSON.stringify(hifzBefore)===JSON.stringify(hifzAfter),credentialsRemainCore:true};
  if(mismatches.length||!report.hifzEquivalent)throw Object.assign(Error('Current authority equivalence failed'),{findings:report});return report;
 }finally{original.close();}
}

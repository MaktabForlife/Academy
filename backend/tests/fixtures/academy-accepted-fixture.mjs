// Seed a synthetic accepted vector through the production guarded merge.
// Fixture-only: never expose broad source capture as an application endpoint.
import {setupSchema} from '../../src/academy/d1/setup-schema.js';
import {jsonRowSQL} from '../../src/academy/d1/json-row.js';
import {definitionSettingsSQL,acceptedRepository} from '../../src/academy/d1/setup-reader.js';
import {academyD1Repository} from '../../src/academy/d1/repository.js';
import {authenticatedD1Account} from '../../src/academy/d1/session.js';
import {acceptFeatureChange} from '../../src/academy/d1/setup-publication.js';
import {warmPublishedAssessments} from '../../src/academy/d1/published-assessments.js';
export async function acceptFixtureSetup(env,token,scopes,families){
 const base=academyD1Repository(env);await base.ready();const auth=await authenticatedD1Account(new Request('http://localhost/api/academy/changes/accept',{headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':'ADMIN'}}),env,base),repository=base.authoringRepository(),db=repository.db,p=(sql,...v)=>db.prepare(sql).bind(...v),selection=scopes.map(s=>s.toUpperCase()),names=Object.keys(setupSchema).filter(t=>!families||families.includes(setupSchema[t].family));
 const permitted=scope=>selection.includes(String(scope).toUpperCase())||selection.includes('GLOBAL')&&String(scope).startsWith('TEACHER:');
 base.bindActor(auth);
 const previous=(await p('SELECT c.* FROM setup_head_components v JOIN setup_components c USING(component_id) WHERE v.head_id=(SELECT head_id FROM setup_head_state WHERE singleton=1)').all()).results;
 const source=(await p(`WITH captured(table_name,rows_json) AS(VALUES ${names.map(name=>`('${name}',(SELECT json_group_array(json_object('scope',${setupSchema[name].scope},'row',json(${jsonRowSQL(setupSchema[name].columns)}))) FROM ${name}${name==='academy_settings'?' WHERE '+definitionSettingsSQL:''}))`).join(',')}) SELECT * FROM captured`).all()).results;
 const changes=source.map(c=>({table:c.table_name,before:previous.filter(p=>p.table_name===c.table_name&&permitted(p.scope_key)).flatMap(p=>JSON.parse(p.rows_json).map(row=>({scope:p.scope_key,row}))),after:JSON.parse(c.rows_json).filter(r=>permitted(r.scope))})).filter(c=>JSON.stringify(c.before)!==JSON.stringify(c.after));
 const reference={dataset:'FIXTURE_ACCEPTED_SETUP',scope:selection.join(','),operationId:crypto.randomUUID()};
 await p('INSERT INTO operation_receipts(dataset_key,scope_key,operation_id,payload_sha256,result_json,actor_account_id,completed_at) VALUES(?,?,?,?,?,?,?)',reference.dataset,reference.scope,reference.operationId,'0'.repeat(64),JSON.stringify({_acceptedChange:{tables:changes,fullRows:true,scopes:selection}}),auth.user.accountid,new Date().toISOString()).run();
 return acceptFeatureChange({...repository,onAssessmentPublication:head=>warmPublishedAssessments(acceptedRepository(base,head),auth)},auth,reference);
}

// Clean target schemas, not a replay of the old import/migration history.
import {setupSchema,privateSetupTables} from '../../src/academy/d1/setup-schema.js';
import {excludedTables} from './selection.mjs';
export const adminMasters=new Set([...Object.keys(setupSchema),...privateSetupTables]);
export const controls=new Set(['academy_write_state','academy_write_guards','management_revisions','operation_receipts','audit_events']);
const actorColumn=/^(?:created_by|updated_by|uploaded_by|reviewed_by|submitted_by|confirmed_by|ready_for_assessment_by|deleted_by|moderator_id|examiner_id|actor_id|actor_account_id|granted_by_account_id|updated_by_account_id|reviewed_by_account_id|submitted_by_account_id)$/;
export function splitDefinitions(sql){
 const start=sql.indexOf('('),end=sql.lastIndexOf(')'),parts=[];let depth=0,quote='',begin=start+1;
 for(let i=begin;i<end;i++){const ch=sql[i];if(quote){if(ch===quote){if(sql[i+1]===quote)i++;else quote='';}continue;}if(ch==="'"||ch==='"'||ch==='`'){quote=ch;continue;}if(ch==='(')depth++;else if(ch===')')depth--;else if(ch===','&&depth===0){parts.push(sql.slice(begin,i).trim());begin=i+1;}}
 parts.push(sql.slice(begin,end).trim());return {prefix:sql.slice(0,start+1),parts,suffix:sql.slice(end)};
}
function tableDDL(record,owner,names){
 const definition=splitDefinitions(record.data),parts=[];
 for(let part of definition.parts){
  const ref=part.match(/\bREFERENCES\s+["`]?([a-z_0-9]+)/i),column=part.match(/^["`]?([a-z_0-9]+)/i)?.[1];
  if(ref){
   let target=ref[1];
   if(owner==='ADMIN'&&target==='accounts')target='identity_refs';
   else if(owner==='CORE'&&target==='accounts'&&actorColumn.test(column))target='actor_refs';
   else if(owner==='ADMIN'&&target==='assessment_files')target='file_refs';
   if(!names.has(target)){
    if(/^FOREIGN KEY/i.test(part))continue;
    // Retain an opaque provenance value without an obsolete import-table FK.
    part=part.replace(/\s+REFERENCES\s+["`]?[a-z_0-9]+["`]?\s*\([^)]*\)(?:\s+ON\s+(?:UPDATE|DELETE)\s+(?:NO ACTION|CASCADE|RESTRICT|SET NULL|SET DEFAULT))*/i,'');
   }else part=part.replace(/(\bREFERENCES\s+)["`]?[a-z_0-9]+["`]?/i,'$1'+target);
  }
  if(owner==='CORE'&&record.name==='course_subscription_decisions'&&column==='updated_by_account_id')part=part.replace(/\bNOT NULL\b/i,'');
  parts.push(part);
 }
 if(owner==='CORE'&&record.name==='role_assignments')parts.push("grant_source TEXT NOT NULL DEFAULT 'EXPLICIT' CHECK(grant_source IN('EXPLICIT','LEGACY_MAPPED'))","legacy_source_role TEXT");
 return definition.prefix+'\n '+parts.join(',\n ')+definition.suffix+';';
}
export function cleanSchemas(sourceSchema){
 const tables=sourceSchema.filter(r=>r.type==='table'),coreNames=new Set(tables.filter(r=>!excludedTables.includes(r.name)&&!privateSetupTables.includes(r.name)).map(r=>r.name)),adminNames=new Set(tables.filter(r=>adminMasters.has(r.name)||controls.has(r.name)||['setup_batches','setup_components'].includes(r.name)).map(r=>r.name));
 coreNames.add('actor_refs');adminNames.add('identity_refs');adminNames.add('file_refs');
 const outputs={};
 for(const [owner,names]of [['CORE',coreNames],['ADMIN',adminNames]]){
  const sql=['-- '+owner+' target. No legacy import, old attendance or discussion tables.'];
  sql.push(owner==='CORE'?'CREATE TABLE actor_refs(account_id TEXT PRIMARY KEY COLLATE NOCASE);':'CREATE TABLE identity_refs(account_id TEXT PRIMARY KEY COLLATE NOCASE);\nCREATE TABLE file_refs(file_id TEXT PRIMARY KEY);');
  for(const table of tables.filter(t=>names.has(t.name)))sql.push(tableDDL(table,owner,names));
  const tableSQL=sql.join('\n\n')+'\n',after=[];
  for(const object of sourceSchema.filter(r=>['index','trigger'].includes(r.type))){
   const target=object.data.match(/\bON\s+["`]?([a-z_0-9]+)/i)?.[1];if(!names.has(target))continue;
   const references=[...object.data.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|REFERENCES)\s+(?:main\.)?["`]?([a-z_0-9]+)/gi)].map(m=>m[1]);
   if(references.some(n=>tables.some(t=>t.name===n)&&!names.has(n)))continue;
   after.push(object.data+';');
  }
  if(owner==='CORE'){
   after.unshift("CREATE VIEW effective_activity_roles AS SELECT r.assignment_id,r.account_id,r.activity_key,r.role FROM role_assignments r JOIN accounts a USING(account_id) WHERE a.active=1 AND r.active=1 AND r.review_state='CONFIRMED' AND r.grant_source='EXPLICIT';",'CREATE VIEW effective_course_subscriptions AS SELECT account_id,activity_key FROM course_subscription_decisions WHERE active=1;');
   for(const view of sourceSchema.filter(r=>r.type==='view'&&!['effective_activity_roles','effective_course_subscriptions'].includes(r.name)))after.unshift(view.data+';');
   sql.push("CREATE TABLE split_deployment_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),generation TEXT NOT NULL CHECK(generation='SPLIT_V1'),state TEXT NOT NULL CHECK(state IN('PREPARING','READY')),source_digest TEXT NOT NULL,selection_digest TEXT NOT NULL,prepared_at TEXT NOT NULL);");
  }
  const extra=sql.slice(sql.length-(owner==='CORE'?1:0));
  const createSQL=owner==='CORE'?tableSQL+extra.join('\n')+'\n':tableSQL;
  outputs[owner.toLowerCase()]={sql:createSQL+after.join('\n\n')+'\n',tableSQL:createSQL,afterSQL:after.join('\n\n')+'\n',tables:[...names].sort()};
 }
 return outputs;
}

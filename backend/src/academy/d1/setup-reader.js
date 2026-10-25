import {setupSchema,privateSetupTables} from './setup-schema.js';
import {rehearsalError as fail} from './repository.js';

export const setupEnabled=env=>env.ACADEMY_ACCEPTED_SETUP==='1';
export const definitionSetting=key=>key==='PlatformTimezone'||key==='PersonalMemorisationCards'||key==='AcademyPdfToolDefaults'||/^(?:ProgramZoom:|AcademyCoursePublicCard:|AcademyHijriAnnual:|AcademyHolidayAnnual:)/.test(key);
export const definitionSettingsSQL="setting_key IN ('PlatformTimezone','PersonalMemorisationCards','AcademyPdfToolDefaults') OR setting_key LIKE 'ProgramZoom:%' OR setting_key LIKE 'AcademyCoursePublicCard:%' OR setting_key LIKE 'AcademyHijriAnnual:%' OR setting_key LIKE 'AcademyHolidayAnnual:%'";
const literal=value=>"'"+value.replaceAll("'","''")+"'";
export async function acceptedHead(repository,requested=''){
 if(requested&&!/^[a-zA-Z0-9_-]{8,100}$/.test(requested))throw fail('Refresh the Academy publication.',409,'SETUP_HEAD_INVALID');
 let row;
 try{row=await repository.db.prepare(requested?'SELECT head_id FROM setup_heads WHERE head_id=?':'SELECT head_id FROM setup_head_state WHERE singleton=1').bind(...(requested?[requested]:[])).first();}
 catch(e){if(/no such table: (?:main\.)?setup_/.test(e.message))throw fail('Accepted setup needs its database upgrade.',503,'SETUP_SCHEMA_REQUIRED');throw e;}
 if(!row)throw fail('Accepted Academy setup is not available. Refresh before continuing.',503,'SETUP_PUBLICATION_REQUIRED');
 return row.head_id;
}
function tableProjection(name,head,features={}){
 const spec=setupSchema[name],extract=column=>`json_extract(r.value,'$.${column}')`;
 const key=spec.keys.map(c=>`live.${c}=${extract(c)} COLLATE NOCASE`).join(' AND ');
 const hasLive=spec.live?.length||spec.columns.includes('active')||name==='lesson_media_lessons'||name==='lesson_media_links';
 const columns=spec.columns.map(column=>{
  let value=extract(column);
  if(name==='academy_settings'&&column==='setting_value')value=`CASE WHEN json_extract(r.value,'$.setting_key')='PersonalMemorisationCards' AND (SELECT setting_value FROM main.academy_settings WHERE setting_key='PersonalMemorisationCards')='0' THEN '0' ELSE ${value} END`;
  if(name==='course_run_state'&&column==='stage')value=`CASE WHEN live.stage IN ('COMPLETE','CANCELLED','ARCHIVED') THEN live.stage ELSE ${value} END`;
  else if(spec.live?.includes(column))value=`live.${column}`;
  else if(column==='active'||name==='activities'&&column==='website_visible')value=`CASE WHEN live.${column}=0 THEN 0 ELSE ${value} END`;
  else if(name==='lesson_media_lessons'&&column==='state')value=`CASE WHEN live.state='HIDDEN' ${features.mediaSeparation?"OR EXISTS(SELECT 1 FROM main.lesson_media_visibility visibility WHERE visibility.lesson_id=live.lesson_id AND visibility.visible=0)":''} THEN 'HIDDEN' ELSE ${value} END`;
  else if(name==='course_run_state'&&column.startsWith('draft_'))value='NULL';
  return `${value}${spec.nocase?.includes(column)?' COLLATE NOCASE':''} AS ${column}`;
 }).join(',');
 const accepted=`SELECT ${columns} FROM main.setup_head_components v JOIN main.setup_components c ON c.component_id=v.component_id JOIN json_each(c.rows_json) r ${hasLive?`JOIN main.${name} live ON ${key}`:''} WHERE v.head_id=${literal(head)} AND v.table_name=${literal(name)}`;
 if(name==='memorisation_activity_settings')return `${accepted} UNION ALL SELECT ${spec.columns.map(c=>c==='learners_per_card'?'20 AS learners_per_card':'live.'+c).join(',')} FROM main.memorisation_activity_settings live WHERE NOT EXISTS(SELECT 1 FROM main.setup_head_components v JOIN main.setup_components c USING(component_id) JOIN json_each(c.rows_json) r WHERE v.head_id=${literal(head)} AND v.table_name='memorisation_activity_settings' AND json_extract(r.value,'$.activity_key')=live.activity_key COLLATE NOCASE)`;
 return name==='academy_settings'?`${accepted} UNION ALL SELECT * FROM main.academy_settings WHERE NOT (${definitionSettingsSQL})`:accepted;
}
export function acceptedDatabase(db,head,features={}){
 const rewrite=sql=>{
  if(!/^\s*(?:SELECT|WITH)\b/i.test(sql))return sql;
  const names=new Set([...sql.matchAll(/\b(?:FROM|JOIN)\s+(?!main\.)([a-z_][a-z0-9_]*)\b/gi)].map(m=>m[1].toLowerCase()));
  // Joined JSON projections need a stable temporary relation. Flattening them
  // into nested loops reparses the same accepted component for every join row.
  // Keep simple one-table reads eligible for SQLite's normal push-down plan.
  const projected=[...names].filter(n=>setupSchema[n]||privateSetupTables.includes(n));
  const joined=projected.length>1||projected.some(n=>[...sql.matchAll(new RegExp(`\\b(?:FROM|JOIN)\\s+${n}\\b`,'gi'))].length>1);
  const ctes=projected.map(n=>`${n} AS ${joined?'MATERIALIZED ':''}(${privateSetupTables.includes(n)?`SELECT * FROM main.${n} WHERE 0`:tableProjection(n,head,features)})`);
  if(!ctes.length)return sql;
  return /^\s*WITH\b/i.test(sql)?sql.replace(/^\s*WITH(\s+RECURSIVE)?\s+/i,(_,recursive)=>`WITH${recursive||''} ${ctes.join(',')}, `):`WITH ${ctes.join(',')} ${sql}`;
 };
 return new Proxy(db,{get(target,name){if(name==='prepare')return sql=>target.prepare(rewrite(sql));const value=target[name];return typeof value==='function'?value.bind(target):value;}});
}
export function acceptedRepository(repository,head){
 const db=acceptedDatabase(repository.db,head,repository.features);
 return {...repository,db,setup:{...repository.setup,head,reader:true},
  homeConfiguration:async()=>{const row=await db.prepare("SELECT setting_value,(SELECT setting_value FROM academy_settings WHERE setting_key='PersonalMemorisationCards') memorisation_cards FROM academy_settings WHERE setting_key='PlatformTimezone'").first();const base=await repository.homeConfiguration();return {...base,...row,memorisationCards:row?.memorisation_cards==='1'};}};
}

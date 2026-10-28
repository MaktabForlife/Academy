// Only resolved, non-personal published source data crosses request boundaries.
// DB handles, in-flight I/O, permissions and final audience/date projections do not.
const values=new Map(),maxEntries=64,maxBytes=8*1024*1024;
let bytes=0;
const clone=value=>structuredClone(value);
function remember(key,value){
 const copy=clone(value),size=new TextEncoder().encode(JSON.stringify(copy)).byteLength+key.length*2;
 if(size>maxBytes)return;
 if(values.has(key)){bytes-=values.get(key).size;values.delete(key);}
 while(values.size>=maxEntries||bytes+size>maxBytes){const first=values.keys().next().value;bytes-=values.get(first).size;values.delete(first);}
 values.set(key,{data:copy,size});bytes+=size;
}
function hit(key){const entry=values.get(key);if(!entry)return null;values.delete(key);values.set(key,entry);return {value:clone(entry.data)};}
const sourceFor=repository=>repository.setup?.reader&&repository.setup.head&&repository.publishedFactsSource;
const changed=()=>Object.assign(Error('Published information changed while loading. Please refresh.'),{status:409,code:'PUBLISHED_FACTS_CHANGED'});
function requestValue(source,key,read){
 if(source.requests.has(key))return source.requests.get(key).then(clone);
 // This map belongs to one repository/request. Never share its I/O promises.
 const pending=read().catch(error=>{source.requests.delete(key);throw error;});source.requests.set(key,pending);return pending.then(clone);
}
async function stableValue(source,identity,metadata,load,{allowed=()=>true,keyFor=meta=>meta.components,first,project=value=>value}={}){
 for(let attempt=0;attempt<2;attempt++){
  const before=attempt===0&&first?first:await metadata();
  if(!allowed(before))return load(); // No reliable revision tracking: preserve the existing reader.
  const key=JSON.stringify(['PUBLISHED_FACTS_V1',source.namespace,identity,keyFor(before)]),saved=hit(key);
  if(saved)return project(saved.value,before);
  const data=await load(),after=await metadata();
  if(JSON.stringify(before)!==JSON.stringify(after))continue;
  remember(key,data);return project(data,after);
 }
 throw changed();
}
const holidayPrefix='AcademyHolidayAnnual:';
const calendarStatements=db=>[
 db.prepare('SELECT * FROM academy_calendar_events'),db.prepare('SELECT * FROM academy_calendar_suppressions'),
 db.prepare("SELECT * FROM academy_settings WHERE setting_key='PlatformTimezone' OR setting_key LIKE 'AcademyHijriAnnual:%' OR setting_key LIKE 'AcademyHolidayAnnual:%'")
];
export async function calendarFacts(repository){
 const load=async()=>{const [calendar,suppressions,settings]=(await repository.db.batch(calendarStatements(repository.db))).map(r=>r.results);return {calendar,suppressions,settings};};
 const source=sourceFor(repository);if(!source)return load();
 const head=repository.setup.head;
 // Definitions change through immutable components. The deployed calendar
 // counter also tracks immediate live disables/deletes and suppressions.
 // Do not key by the whole head or operational version: unrelated saves and
 // publications should keep these source facts warm. Cold fills still verify
 // the operational version before/after loading the live-overlay projection.
 return requestValue(source,JSON.stringify(['calendar',head]),()=>stableValue(source,'calendar',()=>source.db.prepare(`SELECT
  (SELECT json_group_array(json_array(table_name,scope_key,component_id)) FROM (
   SELECT table_name,scope_key,component_id FROM setup_head_components WHERE head_id=? AND table_name IN ('academy_calendar_events','academy_calendar_suppressions')
   UNION ALL SELECT table_name,scope_key,component_id FROM setup_head_components WHERE head_id=? AND table_name='academy_settings' AND scope_key='GLOBAL'
   ORDER BY table_name,scope_key)) components,
  (SELECT setting_value FROM academy_settings WHERE setting_key='AcademySnapshot:Schema') revision_schema,
  coalesce((SELECT setting_value FROM academy_settings WHERE setting_key='AcademySnapshot:calendar:GLOBAL'),'0') calendar_revision,
  ${source.versionSQL} guard_version`).bind(head,head).first(),load,{allowed:meta=>meta.revision_schema==='1',keyFor:meta=>[meta.components,meta.calendar_revision]}));
}
export const holidaySettings=facts=>facts.settings.filter(row=>row.setting_key.startsWith(holidayPrefix));

// Known, server-selected website tables only. Never accept SQL identifiers from input.
const websites={
 course_website_documents:{column:'activity_key',live:true},program_surah_website_documents:{column:'surah_id',live:true},
 course_website_assets:{column:'activity_key'},program_surah_website_assets:{column:'surah_id'}
};
export async function publishedWebsiteValue(repository,{table,scope,id},load){
 const source=sourceFor(repository),spec=websites[table];if(!source||!spec)return load();
 const head=repository.setup.head,identity=JSON.stringify(['website',table,scope,id]);
 return requestValue(source,JSON.stringify([identity,head]),async()=>{
  // Keep the ID column's declared collation so Surah UUID primary-key lookups
  // remain indexed. Activity/scope columns retain their existing NOCASE rules.
  const metadata=()=>source.db.prepare(`SELECT (SELECT component_id FROM setup_head_components WHERE head_id=? AND table_name=? AND scope_key=? COLLATE NOCASE) components,${spec.live?`(SELECT enabled FROM ${table} WHERE ${spec.column}=?)`:'1'} live_enabled,${source.versionSQL} guard_version`).bind(head,table,scope,...(spec.live?[id]:[])).first();
  const before=await metadata();
  if(spec.live&&before.components&&before.live_enabled===null)return null;
  // enabled stays live on every request and is NEVER part of the stored decision.
  return stableValue(source,identity,metadata,load,{first:before,project:(raw,meta)=>raw&&spec.live?{...raw,enabled:meta.live_enabled}:raw});
 });
}

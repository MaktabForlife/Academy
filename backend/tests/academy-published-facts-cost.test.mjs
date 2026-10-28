import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {acceptedDatabase} from '../src/academy/d1/setup-reader.js';
import {setupSchema} from '../src/academy/d1/setup-schema.js';
import {calendarFacts,holidaySettings,publishedWebsiteValue} from '../src/academy/d1/published-facts-cache.js';
function counted(db,log){
 const wrapper={prepare(sql){let native=db.prepare(sql);const statement={sql,get native(){return native;},bind(...args){native=native.bind(...args);return statement;},async all(){const result=await native.all();log.push({sql,rows:result.meta.rows_read});return result;},async first(){const result=await statement.all();return result.results[0]||null;},run:()=>native.run()};return statement;},async batch(statements){const result=await db.batch(statements.map(s=>s.native));result.forEach((r,i)=>log.push({sql:statements[i].sql,rows:r.meta.rows_read}));return result;}};return wrapper;
}
test('real local D1 warm calendar and website reads avoid published JSON scans, including empty results',async()=>{
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("Synthetic source-cache benchmark");}}',compatibilityDate:'2026-09-28',d1Databases:{DB:'published-facts-'+crypto.randomUUID()}}));
 try{
  const raw=await runtime.getD1Database('DB'),log=[],db=counted(raw,log),head='benchmark-'+crypto.randomUUID(),namespace=['local',crypto.randomUUID()];
  await raw.batch([
   raw.prepare('CREATE TABLE setup_head_components(head_id TEXT,table_name TEXT,scope_key TEXT COLLATE NOCASE,component_id TEXT,PRIMARY KEY(head_id,table_name,scope_key))'),
   raw.prepare('CREATE TABLE setup_components(component_id TEXT PRIMARY KEY,rows_json TEXT)'),
   raw.prepare('CREATE TABLE academy_write_state(singleton INTEGER PRIMARY KEY,version INTEGER)'),
   raw.prepare('INSERT INTO academy_write_state VALUES(1,1)')
  ]);
  const events=Array.from({length:48},(_,i)=>({event_id:'event-'+i,event_type:'TERM',description:'Synthetic event '+i,start_date:'2026-01-01',end_date:'2026-01-02',alternate_date:null,teaching_impact:'INFORMATION',active:1,scope_key:'ACADEMY',calendar_kind:'TERM',revision:1}));
  const settings=[{setting_key:'PlatformTimezone',setting_value:'Africa/Johannesburg',updated_at:'now',updated_by_account_id:null},...Array.from({length:90},(_,i)=>({setting_key:'ProgramZoom:PROGRAM:'+i,setting_value:'value-'+i,updated_at:'now',updated_by_account_id:null}))];
  const documents=Array.from({length:12},(_,i)=>({activity_key:'COURSE:'+i,document_json:JSON.stringify({name:'Published website '+i,text:'x'.repeat(12000)}),schema_version:1,source_kind:'TEMPLATE',revision:1,enabled:1,updated_at:'now',updated_by:'admin'}));
  const surahs=Array.from({length:8},(_,i)=>({surah_id:'surah-'+i,activity_key:'PROGRAM:TAFSEER',document_json:JSON.stringify({name:'Published Surah '+i,text:'x'.repeat(12000)}),schema_version:1,source_kind:'TEMPLATE',revision:1,enabled:1,updated_at:'now',updated_by:'admin'}));
  const assets=[{asset_id:'asset-a',activity_key:'COURSE:0',object_key:'private/file.pdf',filename:'shared.pdf',mime_type:'application/pdf',byte_size:100,sha256:'hash',created_at:'now',created_by:'admin'}];
  const surahAssets=[{...assets[0],asset_id:'surah-asset',activity_key:'PROGRAM:TAFSEER',surah_id:'surah-7'}];
  const tables={academy_calendar_events:events,academy_calendar_suppressions:[],academy_settings:settings,course_website_documents:documents,program_surah_website_documents:surahs,course_website_assets:assets,program_surah_website_assets:surahAssets};
  for(const [name,rows] of Object.entries(tables)){
   const spec=setupSchema[name];
   await raw.prepare('CREATE TABLE '+name+'('+spec.columns.map(c=>'"'+c+'" '+(['active','enabled','revision','byte_size','schema_version'].includes(c)?'INTEGER':'TEXT')+(spec.nocase?.includes(c)?' COLLATE NOCASE':'')).join(',')+',PRIMARY KEY('+spec.keys.join(',')+'))').run();
   for(let i=0;i<rows.length;i+=30)await raw.batch(rows.slice(i,i+30).map(row=>raw.prepare('INSERT INTO '+name+'('+Object.keys(row).join(',')+') VALUES('+Object.keys(row).map(()=>'?').join(',')+')').bind(...Object.values(row))));
   const groups=new Map();
   for(const row of rows){const scope=name.includes('website')?row.activity_key:name==='academy_settings'&&row.setting_key.startsWith('ProgramZoom:')?row.setting_key.slice(12):'GLOBAL';if(!groups.has(scope))groups.set(scope,[]);groups.get(scope).push(row);}
   if(!groups.size)groups.set('GLOBAL',[]);
   for(const [scope,group] of groups){const component=name+'|'+scope;await raw.batch([raw.prepare('INSERT INTO setup_head_components VALUES(?,?,?,?)').bind(head,name,scope,component),raw.prepare('INSERT INTO setup_components VALUES(?,?)').bind(component,JSON.stringify(group))]);}
  }
  await raw.batch([raw.prepare("INSERT INTO academy_settings(setting_key,setting_value) VALUES('AcademySnapshot:Schema','1')"),raw.prepare("INSERT INTO academy_settings(setting_key,setting_value) VALUES('AcademySnapshot:calendar:GLOBAL','0')")]);
  const reader=acceptedDatabase(db,head),request=()=>({db:reader,setup:{reader:true,head},publishedFactsSource:{db,namespace,requests:new Map(),versionSQL:'(SELECT version FROM academy_write_state WHERE singleton=1)'}}),take=()=>{const result={rows:log.reduce((sum,r)=>sum+r.rows,0),queries:log.length};log.length=0;return result;};
  log.length=0;
  const baseline=await reader.batch([reader.prepare('SELECT * FROM academy_calendar_events'),reader.prepare('SELECT * FROM academy_calendar_suppressions'),reader.prepare("SELECT * FROM academy_settings WHERE setting_key LIKE 'AcademyHolidayAnnual:%'")]),calendarBefore=take();
  const cold=await calendarFacts(request()),calendarCold=take(),warm=await calendarFacts(request()),calendarWarm=take();
  assert.deepEqual(warm.calendar,baseline[0].results);assert.deepEqual(warm.suppressions,baseline[1].results);assert.deepEqual(holidaySettings(warm),baseline[2].results);assert.deepEqual(cold,warm);assert.deepEqual(holidaySettings(warm),[]);
  assert(calendarWarm.rows<calendarBefore.rows/3,JSON.stringify({calendarBefore,calendarWarm}));assert.equal(calendarWarm.queries,1);
  // Irrelevant scopes must not turn a cache-validity check into a head scan.
  await raw.prepare("INSERT INTO setup_components VALUES('unrelated-empty','[]')").run();
  for(let i=0;i<250;i++)await raw.batch([
   raw.prepare("INSERT INTO setup_head_components VALUES(?,'unrelated-table',?,'unrelated-empty')").bind(head,'PROGRAM:'+i),
   raw.prepare("INSERT INTO setup_head_components VALUES(?,'academy_settings',?,'unrelated-empty')").bind(head,'PROGRAM:UNRELATED-'+i)
  ]);
  await calendarFacts(request());const largeHeadWarm=take();assert.deepEqual(largeHeadWarm,calendarWarm,'500 unrelated publication components add no metadata scans');
  const costs=[{name:'calendar and empty annual holidays',before:calendarBefore,cold:calendarCold,warm:calendarWarm}];
  for(const [table,id,scope] of [['course_website_documents','COURSE:11','COURSE:11'],['program_surah_website_documents','surah-7','PROGRAM:TAFSEER'],['course_website_assets','COURSE:0','COURSE:0'],['program_surah_website_assets','surah-7','PROGRAM:TAFSEER']]){
   const column=table.startsWith('program_surah')?'surah_id':'activity_key',load=()=>reader.prepare('SELECT * FROM '+table+' WHERE '+column+'=?').bind(id).first();
   const beforeValue=await load(),before=take();assert.deepEqual(await publishedWebsiteValue(request(),{table,scope,id},load),beforeValue);const cold=take();assert.deepEqual(await publishedWebsiteValue(request(),{table,scope,id},load),beforeValue);const warm=take();
   assert(warm.rows<before.rows,JSON.stringify({table,before,warm}));assert.equal(warm.queries,1);assert(warm.rows<=3,JSON.stringify({table,warm}));costs.push({name:table,before,cold,warm});
  }
  console.log('Synthetic published-fact D1 costs',JSON.stringify(costs));
 }finally{await runtime.dispose();}
});

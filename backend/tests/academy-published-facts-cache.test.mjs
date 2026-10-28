import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarFacts,holidaySettings,publishedWebsiteValue} from '../src/academy/d1/published-facts-cache.js';
function fixture(){
 const state={components:'calendar-components-'+crypto.randomUUID(),calendar_revision:'0',revision_schema:'1',guard_version:1,live_enabled:1};
 const data={calendar:[],suppressions:[],settings:[]},stats={metadata:0,payload:0};let hook,metadataError,payloadError;
 const namespace=['local',crypto.randomUUID(),'SPLIT_V1'];
 const sourceDB={prepare(){return {bind(){return this;},async first(){stats.metadata++;if(metadataError)throw metadataError;return {...state};}};}};
 const request=(head='head')=>({setup:{reader:true,head},publishedFactsSource:{db:sourceDB,namespace,requests:new Map(),versionSQL:'1'},db:{prepare(sql){return {sql};},async batch(){stats.payload++;if(payloadError)throw payloadError;const value=structuredClone(data);if(hook)await hook();return [value.calendar,value.suppressions,value.settings].map(results=>({results}));}}});
 return {state,data,stats,request,setHook:value=>{hook=value;},metadataError:value=>{metadataError=value;},payloadError:value=>{payloadError=value;}};
}
test('calendar facts include empty results and share one source read within and across requests',async()=>{
 const f=fixture(),repository=f.request();f.data.settings.push({setting_key:'PlatformTimezone',setting_value:'Africa/Johannesburg'});
 const [one,two]=await Promise.all([calendarFacts(repository),calendarFacts(repository)]);
 assert.deepEqual(one,two);assert.deepEqual(holidaySettings(one),[]);assert.equal(f.stats.payload,1);assert.equal(f.stats.metadata,2);
 const warm=await calendarFacts(f.request());assert.deepEqual(warm,one);assert.equal(f.stats.payload,1);assert.equal(f.stats.metadata,3,'A warm request checks only indexed source metadata');
 one.calendar.push({event_id:'poison'});two.settings[0].setting_value='Wrong';
 assert.deepEqual(await calendarFacts(f.request()),warm,'Returned arrays cannot poison another request');
});
test('calendar source IDs and immediate calendar revisions invalidate; unrelated writes and heads do not',async()=>{
 const f=fixture();await calendarFacts(f.request());f.data.calendar.push({event_id:'holiday',active:1});
 f.state.guard_version++;assert.deepEqual((await calendarFacts(f.request())).calendar,[],'Unaccepted edits do not change accepted facts');
 await calendarFacts(f.request('unrelated-head'));assert.equal(f.stats.payload,1,'Identical components survive an unrelated accepted publication');
 f.state.components='new-components';assert.equal((await calendarFacts(f.request())).calendar.length,1);assert.equal(f.stats.payload,2);
 f.data.calendar[0].active=0;f.state.calendar_revision='1';assert.equal((await calendarFacts(f.request())).calendar[0].active,0);assert.equal(f.stats.payload,3);
 f.data.suppressions.push({calendar_date:'2026-12-25'});f.state.calendar_revision='2';assert.equal((await calendarFacts(f.request())).suppressions.length,1);assert.equal(f.stats.payload,4);
});
test('cold source changes retry, and unstable data or errors never become a cached result',async()=>{
 const f=fixture();let changes=0;
 f.setHook(()=>{if(changes++===0){f.state.calendar_revision='1';f.state.guard_version++;f.data.calendar.push({event_id:'new'});}});
 assert.equal((await calendarFacts(f.request())).calendar[0].event_id,'new');assert.equal(f.stats.payload,2);
 f.metadataError(Error('metadata unavailable'));await assert.rejects(calendarFacts(f.request()),/metadata unavailable/);f.metadataError(null);
 assert.equal((await calendarFacts(f.request())).calendar[0].event_id,'new');assert.equal(f.stats.payload,2);
 const broken=fixture();broken.payloadError(Error('payload unavailable'));const request=broken.request();await assert.rejects(calendarFacts(request),/payload unavailable/);broken.payloadError(null);await calendarFacts(request);assert.equal(broken.stats.payload,2,'Failed promises are removed from request reuse too');
 const racing=fixture();racing.setHook(()=>{racing.state.calendar_revision=String(Number(racing.state.calendar_revision)+1);racing.state.guard_version++;});
 await assert.rejects(calendarFacts(racing.request()),{code:'PUBLISHED_FACTS_CHANGED'});racing.setHook(null);await calendarFacts(racing.request());assert.equal(racing.stats.payload,3);
});
test('missing revision tracking and unpublished repositories preserve the existing uncached reader',async()=>{
 const f=fixture();f.state.revision_schema=null;await calendarFacts(f.request());await calendarFacts(f.request());assert.equal(f.stats.payload,2);
 const repository=f.request();delete repository.setup.reader;await calendarFacts(repository);await calendarFacts(repository);assert.equal(f.stats.payload,4);
});
test('different requests do not share in-flight I/O or namespace data',async()=>{
 const f=fixture();let release;const gate=new Promise(resolve=>{release=resolve;});f.setHook(()=>gate);
 const one=calendarFacts(f.request()),two=calendarFacts(f.request());await new Promise(resolve=>setTimeout(resolve,0));assert.equal(f.stats.payload,2);release();await Promise.all([one,two]);
 const other=fixture();other.state.components=f.state.components;other.data.calendar.push({event_id:'another-database'});assert.equal((await calendarFacts(other.request())).calendar[0].event_id,'another-database');
});
test('website source caching keeps withdrawals live and never lets newer drafts replace the publication',async()=>{
 const f=fixture(),spec={table:'course_website_documents',scope:'COURSE:A',id:'COURSE:A'};let loads=0;
 let row={document_json:'published',enabled:1,revision:2};const read=()=>publishedWebsiteValue(f.request(),spec,async()=>{loads++;return {...row};});
 assert.equal((await read()).document_json,'published');row.document_json='private draft';f.state.guard_version++;
 assert.equal((await read()).document_json,'published');assert.equal(loads,1);
 f.state.live_enabled=0;assert.equal((await read()).enabled,0);assert.equal(loads,1);
 f.state.live_enabled=null;assert.equal(await read(),null,'A removed live row cannot be resurrected from the cache');
 f.state.live_enabled=1;f.state.components='next-publication';assert.equal((await read()).document_json,'private draft');assert.equal(loads,2);
});
test('website metadata, empty assets and absent publications are isolated by website and component',async()=>{
 const f=fixture();let loads=0;const spec={table:'program_surah_website_assets',scope:'PROGRAM:TAFSEER',id:'surah-a'};
 const read=(target=spec)=>publishedWebsiteValue(f.request(),target,async()=>{loads++;return [];});
 assert.deepEqual(await read(),[]);assert.deepEqual(await read(),[]);assert.equal(loads,1);
 await read({...spec,id:'surah-b'});assert.equal(loads,2,'Two Surahs in one component keep separate asset lists');
 f.state.components='accepted-upload';await read();assert.equal(loads,3);
 f.state.components=null;let documents=0;const record=()=>publishedWebsiteValue(f.request(),{table:'program_surah_website_documents',scope:'PROGRAM:TAFSEER',id:'surah-empty'},async()=>{documents++;return null;});
 assert.equal(await record(),null);assert.equal(await record(),null);assert.equal(documents,1);
});
test('a withdrawal during a cold website load uses the new live gate on retry',async()=>{
 const f=fixture();let loads=0;const result=await publishedWebsiteValue(f.request(),{table:'course_website_documents',scope:'COURSE:RACE',id:'COURSE:RACE'},async()=>{loads++;f.state.live_enabled=0;f.state.guard_version=2;return {document_json:'protected content',enabled:1};});
 assert.equal(result.enabled,0);assert.equal(loads,2);
});
test('the cross-request cache has bounded entries and skips oversized payloads',async()=>{
 const f=fixture(),spec={table:'course_website_assets',scope:'COURSE:LIMIT',id:'initial'};let loads=0;
 const read=id=>publishedWebsiteValue(f.request(),{...spec,id},async()=>{loads++;return [];});
 await read('initial');for(let i=0;i<70;i++)await read('entry-'+i);await read('initial');assert.equal(loads,72);
 let largeLoads=0;const large='x'.repeat(8*1024*1024+1),big=()=>publishedWebsiteValue(f.request(),{...spec,id:'oversized'},async()=>{largeLoads++;return [{text:large}];});
 await big();await big();assert.equal(largeLoads,2);
});

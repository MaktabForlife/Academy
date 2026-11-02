import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const code=readFileSync(new URL('../../js/m4l-course-participants.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<16;i++)await new Promise(r=>setImmediate(r));};
function fixture({model='PAID',lose,conflict,delaySearch=false,ownership='WEBSITE'}={}){
 const {window,document}=parseHTML('<html><body><main id="host"></main></body></html>'),create=document.createElement.bind(document);
 document.createElement=name=>{const el=create(name);if(name==='dialog'){Object.defineProperty(el,'open',{get(){return this.hasAttribute('open');}});el.showModal=()=>el.setAttribute('open','');el.close=()=>el.removeAttribute('open');}return el;};
 let token='admin-A',revision=1,release;const people=new Map([['alice',{account_id:'alice',display_name:'Alice',active:1,admitted:1,enrolled:1,live:1,purchased:1,cohort:'original'}],['former',{account_id:'former',display_name:'Former student',active:1,admitted:1,enrolled:0,live:0,purchased:0}]]),core=[{accountId:'alice',displayName:'Alice'},{accountId:'bob',displayName:'Bob'},{accountId:'carol',displayName:'Carol'}],calls=[],receipts=new Map(),jobs=new Map();
 const result=async(command)=>{
  if(command.action==='read')return {success:true,revision,ownership:{authority:ownership,phase:ownership==='WEBSITE'?'COMMITTED':'FROZEN'},kind:'COURSE',coursePolicy:{model,revision},canLinkAccount:true,participants:[...people.values()],more:false,...(command.accountId?{person:people.get(command.accountId)}:{})};
  if(command.action==='course-user-search'){if(delaySearch)await new Promise(r=>release=r);return {success:true,accounts:core.filter(a=>!command.search||a.displayName.toLowerCase().includes(command.search.toLowerCase())),more:false};}
  if(command.action==='provision'){jobs.set(command.input.operationId,command.input.accountId);return {success:true};}
  if(command.action==='resume'){const id=jobs.get(command.input.jobId),a=core.find(a=>a.accountId===id);people.set(id,{account_id:id,display_name:a.displayName,enrolled:1,live:0,purchased:0});revision++;return {success:true,accountId:id};}
  const change=command.change,old=receipts.get(change.operationId);if(old){assert.equal(old,JSON.stringify(command));return {success:true,replayed:true};}
  assert.equal(command.revision,revision);receipts.set(change.operationId,JSON.stringify(command));
  if(change.action==='course-policy')model=change.accessModel;
  else for(const c of change.action==='access-batch'?change.changes:[change])Object.assign(people.get(c.accountId),{enrolled:Number(c.enrolled),live:Number(c.live),purchased:Number(c.purchased),cohort:c.cohort});
  revision++;if(lose?.(command))throw Error('Lost acknowledgement');return {success:true};
 };
 const fetcher=async(url,options)=>{const body=JSON.parse(options.body),command=body.command;calls.push({url,body,headers:options.headers});if(command.action==='read'&&command.accountId&&!people.has(command.accountId))return Response.json({success:false,error:'Link the account first'},{status:404});if(command.action==='save'&&conflict?.(command)){revision++;return Response.json({success:false,error:'The register changed. Refresh before editing.',code:'CHANGE_CONFLICT'},{status:409});}return Response.json(await result(command));};
 vm.runInContext(code,vm.createContext({window,document,localStorage:{getItem:()=>token},fetch:fetcher,crypto,Response,DOMException,console}));
 const ui=window.M4L_COURSE_PARTICIPANTS,host=document.getElementById('host');ui.attach(host,'COURSE:one',{selectionKey:1,current:()=>true});
 const click=selector=>{const el=document.querySelector(selector);assert(el,'Missing '+selector);assert(!el.disabled,'Disabled '+selector);el.click();};
 const change=(selector,value)=>{const el=document.querySelector(selector);assert(el);el.checked=value;el.dispatchEvent(new window.Event('change',{bubbles:true}));};
 return {window,document,calls,people,ui,host,click,change,release:()=>release(),switchAccount(){token='admin-B';window.dispatchEvent(new window.Event('pageshow'));}};
}
test('Paid Participants shows only students with access and makes no directory or credential request on open',async()=>{
 const f=fixture();await settle();assert.match(f.host.textContent,/Alice/);assert.doesNotMatch(f.host.textContent,/Former student/);assert(f.document.querySelector('[data-cp-person=alice]').hasAttribute('checked'));assert(f.document.querySelector('[name=cp-policy][value=PAID]').hasAttribute('checked'));assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.command.action,'read');assert.equal(f.calls[0].headers['X-Academy-Workspace'],'ADMIN');
});
test('unticking stages access removal and an uncertain save retries exactly without losing original cohort',async()=>{
 let lost=false;const f=fixture({lose:c=>c.change.action==='access-batch'&&!lost&&(lost=true)});await settle();f.change('[data-cp-person=alice]',false);assert.equal(f.calls.length,1);assert.equal(f.ui.canLeave(),false);f.click('[data-cp=save]');await settle();assert.match(f.host.textContent,/Lost acknowledgement/);assert.equal(f.document.querySelector('[data-cp=save]').textContent,'Retry save');f.click('[data-cp=save]');await settle();const saves=f.calls.filter(c=>c.body.command.action==='save');assert.equal(saves.length,2);assert.deepEqual(saves[0].body,saves[1].body);assert.equal(saves[0].body.command.change.changes[0].cohort,'original');assert.equal(f.people.get('alice').purchased,0);assert(!f.document.querySelector('[data-cp-person=alice]'));assert.equal(f.ui.canLeave(),true);
});
test('Free radio uses a guarded exact retry, grants automatic eligibility and preserves purchases',async()=>{
 let lost=false;const f=fixture({lose:c=>c.change.action==='course-policy'&&!lost&&(lost=true)});await settle();f.change('[name=cp-policy][value=FREE]',true);f.click('[data-cp=policy-save]');await settle();assert.equal(f.document.querySelector('[data-cp=policy-save]').textContent,'Retry save');f.click('[data-cp=policy-save]');await settle();const saves=f.calls.filter(c=>c.body.command.action==='save');assert.deepEqual(saves[0].body,saves[1].body);assert.equal(f.people.get('alice').purchased,1);assert.equal(f.document.querySelectorAll('[data-cp-person]').length,3);assert([...f.document.querySelectorAll('[data-cp-person]')].every(c=>c.hasAttribute('checked')&&c.disabled));assert.equal(f.ui.canLeave(),true);
});
test('existing-user search supports multiple selections and resumes the unfinished user without duplicating earlier grants',async()=>{
 let lost=false;const f=fixture({lose:c=>c.change.accountId==='carol'&&!lost&&(lost=true)});await settle();f.click('[data-cp=add]');await settle();f.document.querySelector('[name=cp-search]').value='';f.click('[data-cp-dialog=search]');await settle();f.change('[data-cp-candidate=bob]',true);f.change('[data-cp-candidate=carol]',true);f.click('[data-cp-dialog=add]');await settle();assert.match(f.document.querySelector('dialog').textContent,/Lost acknowledgement/);assert.equal(f.ui.canLeave(),false);f.click('[data-cp-dialog=add]');await settle();const grants=f.calls.filter(c=>c.body.command.change?.action==='participant');assert.equal(grants.filter(c=>c.body.command.change.accountId==='bob').length,1);const carol=grants.filter(c=>c.body.command.change.accountId==='carol');assert.equal(carol.length,2);assert.deepEqual(carol[0].body,carol[1].body);assert.equal(f.people.get('bob').purchased,1);assert.equal(f.people.get('carol').purchased,1);assert(f.calls.filter(c=>c.body.command.action==='provision').every(c=>c.body.command.input.accountId&&!c.body.command.input.displayName));assert.equal(f.ui.canLeave(),true);
});
test('empty user search results are cached and account switching clears the private table and popup',async()=>{
 const f=fixture();await settle();f.click('[data-cp=add]');await settle();f.document.querySelector('[name=cp-search]').value='nobody';f.click('[data-cp-dialog=search]');await settle();f.click('[data-cp-dialog=search]');await settle();assert.equal(f.calls.filter(c=>c.body.command.action==='course-user-search').length,1);assert.equal(f.calls.find(c=>c.body.command.action==='course-user-search').body.command.search,'nobody');assert.match(f.document.querySelector('.cp-results').textContent,/No matching users/);f.switchAccount();assert.equal(f.host.textContent,'');assert.equal(f.document.querySelector('dialog'),null);assert.equal(f.ui.canLeave(),true);
});
test('a confirmed concurrent change releases unfinished additions for fresh review and keeps completed access',async()=>{
 let conflicted=false;const f=fixture({conflict:c=>c.change.accountId==='carol'&&!conflicted&&(conflicted=true)});await settle();f.click('[data-cp=add]');await settle();f.click('[data-cp-dialog=search]');await settle();f.change('[data-cp-candidate=bob]',true);f.change('[data-cp-candidate=carol]',true);f.click('[data-cp-dialog=add]');await settle();assert.equal(f.people.get('bob').purchased,1);assert.equal(f.people.get('carol').purchased,0);assert.match(f.host.textContent,/Refresh Participants/);assert.equal(f.ui.canLeave(),true);assert(!f.document.querySelector('dialog').open);f.click('[data-cp=refresh]');await settle();f.click('[data-cp=add]');await settle();f.click('[data-cp-dialog=search]');await settle();assert(f.document.querySelector('[data-cp-candidate=bob]').disabled);f.change('[data-cp-candidate=carol]',true);f.click('[data-cp-dialog=add]');await settle();assert.equal(f.people.get('carol').purchased,1);assert.equal(f.calls.filter(c=>c.body.command.change?.accountId==='bob').length,1);assert.equal(f.ui.canLeave(),true);
});
test('a late previous-account search cannot show names in the new account',async()=>{
 const f=fixture({delaySearch:true});await settle();f.click('[data-cp=add]');await settle();f.click('[data-cp-dialog=search]');await settle();f.switchAccount();f.release();await settle();assert.equal(f.host.textContent,'');assert(!f.document.body.textContent.includes('Bob'));
});
test('a frozen owner shows no policy or student mutation controls',async()=>{
 const f=fixture({ownership:'FROZEN'});await settle();assert.match(f.host.textContent,/setup is pending/);assert.equal(f.document.querySelector('[data-cp=save]'),null);assert.equal(f.document.querySelector('[name=cp-policy]'),null);assert.equal(f.calls.length,1);
});

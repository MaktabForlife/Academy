import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../js/m4l-enrolment-common.js',import.meta.url),'utf8');
test('native enrolment authenticated transport uses checked cookie client and never reads localStorage bearer data',async()=>{
 const requests=[],publicRequests=[],client={getState:()=>({context:{app:'academy'}}),hasSession:()=>true,ownerKey:()=> 'synthetic-family-selector',prepareBusiness:async()=>{},prepareSensitive:async()=>{},async request(path,body,options){requests.push({path,body,options});return {success:true,current:true};}};
 const sandbox={URL,TextEncoder,crypto,location:{origin:'https://ummabbadacademy.app'},document:{querySelector:s=>({content:s.includes('uaa-auth-version')?'2':'academy'})},localStorage:{getItem(){throw Error('V2 must not read old bearer storage');}},fetch:async(path,options)=>{publicRequests.push({path,options});return Response.json({success:true,entries:[]});},Response};sandbox.window=sandbox;sandbox.M4L_ACADEMY_AUTH={ready:Promise.resolve(client),hasSession:client.hasSession,ownerKey:client.ownerKey};
 vm.runInNewContext(source,sandbox);const api=sandbox.M4L_ENROLMENT;
 assert.equal(api.token(),'synthetic-family-selector');await api.api('/api/admin/platform/enrolment/get',{activityKey:'PROGRAM:synthetic'},true);assert.equal(requests.length,1);assert.equal(requests[0].options.headers['X-Academy-Workspace'],'ADMIN');assert.equal(Object.hasOwn(requests[0].options.headers,'Authorization'),false);
 await api.api('/api/academy/enrolment/catalogue');assert.equal(publicRequests.length,1);assert.equal(publicRequests[0].path,'/api/academy/enrolment/catalogue');
 await assert.rejects(api.api('/api/other/private-route',undefined,false),{code:'NATIVE_PUBLIC_ROUTE_REQUIRED'});
 assert.match(await api.ownerKey(),/^uaa-enrolment-pending-v2:[a-f0-9]{64}$/);
});

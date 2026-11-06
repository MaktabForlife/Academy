import test from 'node:test';import assert from 'node:assert/strict';
import {featureSmoke,portalOrigin} from '../tools/feature-bounded-smoke.mjs';
const reply=(body,status=200)=>new Response(status===204?null:JSON.stringify(body),{status,headers:{'Access-Control-Allow-Origin':portalOrigin,'Cache-Control':'private, no-store'}});
test('The exact final hosted flow has six calls, ends its single synthetic session and retains no credentials',async()=>{
 const calls=[],states=[],values=[reply(null,204),reply({success:true,databaseGeneration:'SPLIT_V1',store:'D1_ACTIVE'}),reply({success:true,account:{uniqueid:'feature-test-admin'},sessionStore:'D1',token:'mock-sensitive-token'}),reply({account:{uniqueid:'feature-test-admin'}}),reply({success:true}),reply({success:false},401)];
 const result=await featureSmoke({pin:'2468',onSession:v=>states.push(v),request:async(url,options)=>{calls.push({url,method:options.method});assert.equal(options.redirect,'error');return values.shift();}});
 assert.equal(calls.length,6);assert.deepEqual(states,[true,false]);assert.equal(result.sessionEnded,true);assert(!JSON.stringify(result).includes('mock-sensitive-token'));assert(!JSON.stringify(result).includes('2468'));
});
test('Unexpected pre-login result stops the flow without retries or sign-in',async()=>{
 let calls=0;await assert.rejects(featureSmoke({pin:'2468',request:async()=>{calls++;return reply({success:false},503);}}),e=>e.safeEvidence.workerRequests===1);assert.equal(calls,1);
});
test('Failure after login uses only one remaining reserved request to sign out',async()=>{
 let calls=0;const values=[reply(null,204),reply({success:true,databaseGeneration:'SPLIT_V1',store:'D1_ACTIVE'}),reply({success:true,account:{uniqueid:'feature-test-admin'},sessionStore:'D1',token:'mock-sensitive-token'}),reply({success:false},503),reply({success:true})],states=[];
 await assert.rejects(featureSmoke({pin:'2468',onSession:v=>states.push(v),request:async()=>{calls++;return values.shift();}}),e=>e.safeEvidence.workerRequests===5&&!JSON.stringify(e.safeEvidence).includes('mock-sensitive-token'));
 assert.equal(calls,5);assert.deepEqual(states,[true,false]);
});

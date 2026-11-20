import assert from 'node:assert/strict';
import {opaque,b64u,sha256} from '../../../security/v2/codec.mjs';
import {digestState} from '../../../security/v2/ceremonies.mjs';
import {ORIGINS} from '../../../security/v2/tokens.mjs';
export async function childJourney(f,app,{purpose='admission',expected=null,academyContext}={}){
 const boot=await f.post(app,'/auth/v2/bootstrap',{purpose:purpose+'/start',expectedContext:expected});assert.equal(boot.response.status,200,JSON.stringify(boot.data));
 const state=opaque(),verifier=opaque(),stateHash=await digestState(state),start=await f.post(app,'/auth/v2/'+purpose+'/start',{operationId:boot.data.intent.id,expectedContext:expected,stateHash,challenge:b64u(await sha256(verifier)),callback:ORIGINS[app]+'/auth/v2/'+purpose+'/callback',returnTo:'/'},boot.data);assert.equal(start.response.status,200,JSON.stringify(start.data));
 let proceed=await f.post('academy','/auth/v2/bootstrap',{purpose:'admission/proceed',tx:start.data.tx,expectedContext:academyContext});assert.equal(proceed.response.status,200,JSON.stringify(proceed.data));
 let tries=0;while(proceed.data.action==='PREPARE'){assert(++tries<=32,'bounded preparation did not finish');proceed=await f.post('academy','/auth/v2/bootstrap',{purpose:'admission/proceed',tx:start.data.tx,expectedContext:academyContext});assert.equal(proceed.response.status,200,JSON.stringify(proceed.data));}
 let issued;
 if(proceed.data.action==='PIN'){
  const pinBoot=await f.post('academy','/auth/v2/bootstrap',{purpose:'pin',journeyTx:start.data.tx,expectedContext:proceed.data.context});assert.equal(pinBoot.response.status,200,JSON.stringify(pinBoot.data));
  const pin=await f.post('academy','/auth/v2/pin',{journeyTx:start.data.tx,tx:pinBoot.data.tx,attemptId:pinBoot.data.attemptId,operationId:pinBoot.data.intent.id,expectedContext:pinBoot.data.context,pin:'1234'},pinBoot.data);assert.equal(pin.response.status,200,JSON.stringify(pin.data));issued=pin.data;
 }else{
  assert.equal(proceed.data.action,'CONTINUE');const code=await f.post('academy','/auth/v2/admission/start',{tx:proceed.data.tx,operationId:proceed.data.intent.id,expectedContext:proceed.data.context},proceed.data);assert.equal(code.response.status,200,JSON.stringify(code.data));issued=code.data;
 }
 assert.equal(issued.post.tx,start.data.tx);assert.equal(issued.post.stateHash,stateHash);assert.equal(new URL(issued.post.callback).search,'');
 const callback=await f.dispatch(new Request(issued.post.callback,{method:'POST',headers:{Origin:ORIGINS.academy,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({tx:issued.post.tx,stateHash:issued.post.stateHash,code:issued.post.code})}));assert.equal(callback.status,200,await callback.clone().text());assert.equal(callback.headers.getSetCookie().length,0);
 const finalBoot=await f.post(app,'/auth/v2/bootstrap',{purpose:purpose+'/finalize',tx:start.data.tx,observedOperationId:start.data.operationId,expectedContext:expected});assert.equal(finalBoot.response.status,200,JSON.stringify(finalBoot.data));assert.equal(finalBoot.data.intent.id,start.data.operationId);
 const result=await f.post(app,'/auth/v2/'+purpose+'/finalize',{tx:start.data.tx,operationId:start.data.operationId,expectedContext:expected,code:issued.post.code,verifier},finalBoot.data);assert.equal(result.response.status,200,JSON.stringify(result.data));return result.data;
}


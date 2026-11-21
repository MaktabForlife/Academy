import {canonical,equal,exact,requireThat,safeInt,unb64u,uuid} from './codec.mjs';
import {digestState} from './ceremonies.mjs';
import {ORIGINS} from './tokens.mjs';

const purpose='shared-entry-return';
const childApps=new Set(['studio','hifz']);
const callbackPath='/auth/v2/shared-entry/callback';
const noStore={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};

export async function registerSharedReturn(runtime,peer,body){
 const child=peer.sourceApp,origin=ORIGINS[child],callback=origin+callbackPath;
 requireThat(runtime.app==='academy'&&runtime.sharedAcademySessions&&childApps.has(child)
  &&runtime.settings.callbacks?.[child]?.origin===origin,'CEREMONY_SERVICE_DIRECTION',403);
 const mode=Object.hasOwn(body,'mode')?body.mode:'continue';
 exact(body,['tx','purpose','targetApp','stateHash','challenge','callback','expiresAt',...(Object.hasOwn(body,'mode')?['mode']:[])]);
 requireThat(uuid(body.tx)&&body.purpose===purpose&&body.targetApp===child&&body.callback===callback
  &&['continue','select','renew'].includes(mode)&&/^[0-9a-f]{64}$/.test(body.stateHash),'UNREGISTERED_CALLBACK',400);
 unb64u(body.challenge,32);
 const store=runtime.store,now=runtime.clock();
 requireThat(safeInt(body.expiresAt,now+1)&&body.expiresAt<=now+330,'CEREMONY_EXPIRED',409);
 const beforeSelection=mode==='select'?(await store.first('SELECT coalesce(max(ordinal),0) AS latest FROM jwt_v2_families')).latest:null;
 await store.stmt('INSERT INTO jwt_v2_ceremonies(tx,purpose,target_app,state_hash,challenge,callback,return_to,created_at,expires_at,expected_json) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tx) DO NOTHING',
  body.tx,purpose,child,body.stateHash,body.challenge,callback,callback,now,body.expiresAt,
  mode==='continue'?null:canonical({mode,beforeSelection})).run();
 const row=await store.first('SELECT * FROM jwt_v2_ceremonies WHERE tx=?',body.tx);
 requireThat(row?.status==='PENDING'&&row.purpose===purpose&&row.target_app===child&&row.state_hash===body.stateHash
  &&row.challenge===body.challenge&&row.callback===callback&&row.expires_at===body.expiresAt&&returnMode(row).mode===mode,'CEREMONY_CONFLICT',409);
 return {success:true,tx:row.tx,expiresAt:row.expires_at};
}

function returnMode(row){
 return row.expected_json?JSON.parse(row.expected_json):{mode:'continue'};
}

async function registered(runtime,tx){
 requireThat(runtime.app==='academy'&&runtime.sharedAcademySessions,'UNKNOWN_AUTH_PATH',404);
 requireThat(uuid(tx),'INVALID_BROWSER_TRANSACTION',400);
 const row=await runtime.store.first('SELECT * FROM jwt_v2_ceremonies WHERE tx=?',tx);
 requireThat(row?.purpose===purpose&&childApps.has(row.target_app)&&row.callback===ORIGINS[row.target_app]+callbackPath,'UNREGISTERED_CALLBACK',403);
 return row;
}

export async function finishSharedReturn(runtime,request,body){
 exact(body,['tx','state']);
 const row=await registered(runtime,body.tx);
 requireThat(row.status==='PENDING'&&runtime.clock()<row.expires_at,'CEREMONY_EXPIRED',409);
 requireThat(equal(await digestState(body.state),row.state_hash),'STATE_CONFLICT',403);
 const check=new Request(runtime.config.origin+'/auth/v2/shared-return',{headers:{Cookie:request.headers.get('Cookie')||''}});
 const cap=await runtime.authorise(check,{action:'read'}),selection=returnMode(row);
 if(selection.mode==='select'){
  const family=await runtime.store.family(cap.binding.sid);
  requireThat(family&&family.ordinal>selection.beforeSelection,'ACADEMY_ACCOUNT_SELECTION_REQUIRED',409);
 }
 return runtime.json({success:true,post:{callback:row.callback,tx:row.tx,state:body.state}});
}

export async function sharedReturnPage(runtime,request){
 const url=new URL(request.url);
 if(url.pathname.endsWith('.mjs')){
  requireThat(runtime.sharedAcademySessions&&!url.search,'UNKNOWN_AUTH_PATH',404);
  return new Response(client,{headers:{...noStore,'Content-Type':'text/javascript'}});
 }
 requireThat([...url.searchParams].length===1&&url.searchParams.has('tx'),'INVALID_AUTH_ROUTE',400);
 const row=await registered(runtime,url.searchParams.get('tx'));
 const data=canonical({tx:row.tx,callback:row.callback,mode:returnMode(row).mode,expired:row.status!=='PENDING'||runtime.clock()>=row.expires_at});
 const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Academy sign-in</title><main><h1>Academy sign-in</h1><p id="status" role="status">Checking your Academy session…</p><form id="pin" hidden><label id="account">Academy account ID <input name="loginId" autocomplete="username" maxlength="180" required></label><label>PIN <input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required></label><button>Continue</button></form><button id="check" hidden>Check sign-in</button><button id="restart" hidden>Start a new PIN check</button><button id="return" hidden>Return to Studio</button></main><script id="config" type="application/json">'+data+'</script><script type="module" src="/auth/v2/shared-return-client.mjs"></script>';
 return new Response(html,{headers:{...noStore,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self' "+ORIGINS[row.target_app]+"; form-action 'none'"+"; base-uri 'none'; frame-ancestors 'none'"}});
}

const client=String.raw`import {createBrowserSession} from '/auth/v2/browser-session.mjs';

const settings=JSON.parse(document.getElementById('config').textContent);
const state=location.hash.slice(1);
const status=document.getElementById('status'),form=document.getElementById('pin');
const check=document.getElementById('check'),restart=document.getElementById('restart'),back=document.getElementById('return');
const session=createBrowserSession({app:'academy'});
let busy=false,lockedSelection=false;
async function relay(){
 // CORS keeps the exact Origin while no-referrer keeps the browser location private.
 const response=await fetch(settings.callback,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',
  redirect:'error',referrerPolicy:'no-referrer',body:new URLSearchParams({tx:settings.tx,state})});
 const result=await response.json();
 if(!response.ok||result.success!==true||result.tx!==settings.tx||result.state!==state)throw Error('STATE_CONFLICT');
 const target=new URL(settings.callback);
 target.hash=new URLSearchParams({tx:settings.tx,state,expired:result.expired?'1':'0'});
 location.assign(target.href);
}

async function finish(){
 const response=await fetch('/auth/v2/shared-return',{method:'POST',mode:'same-origin',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'same-origin',referrer:location.origin+'/',
  headers:{'Content-Type':'application/json','X-UAA-Request':'2'},body:JSON.stringify({tx:settings.tx,state})});
 const result=await response.json();
 if(!response.ok||result.success!==true)throw Object.assign(Error(result.code),{status:response.status});
 if(result.post.callback!==settings.callback||result.post.tx!==settings.tx||result.post.state!==state)throw Error('STATE_CONFLICT');
 await relay();
}
function showPin(locked){
 const account=document.getElementById('account');
 account.hidden=locked;form.elements.loginId.required=!locked;
 status.textContent=locked?'Enter your Academy PIN to continue.':'Enter your Academy account ID and PIN.';
 form.hidden=false;
}
function failed(error){
 if(error.message==='CEREMONY_EXPIRED'){form.hidden=true;back.hidden=false;status.textContent='The sign-in window expired. Return to the programme to continue.';return;}
 if(['PIN_CHECK_PENDING','PIN_INSTALLATION_UNCONFIRMED'].includes(error.code)){
  form.elements.pin.disabled=true;form.elements.loginId.readOnly=true;form.querySelector('button').disabled=true;
  check.hidden=false;restart.hidden=error.code!=='PIN_INSTALLATION_UNCONFIRMED';
  status.textContent='Academy could not confirm sign-in yet. Check the result to continue.';
 }else status.textContent=error.code==='WRONG_PIN'?'That PIN did not match. Try again.':'Academy could not confirm sign-in. Try again.';
}
async function attempt(action){
 if(busy)return;
 busy=true;check.hidden=true;restart.hidden=true;
 const field=form.elements.pin,button=form.querySelector('button'),pin=field.value;
 field.value='';field.placeholder='••••';field.disabled=true;button.disabled=true;form.elements.loginId.readOnly=true;
 const checking=setTimeout(()=>{status.textContent='Checking PIN…';},300);
 const slow=setTimeout(()=>{status.textContent='Connection is slow. Still checking…';},5000);
 try{
  if(action==='restart'){await session.restartPinCheck();showPin(false);}
  else if(action==='check'){await session.checkPinResult();await finish();}
  else{
   if(lockedSelection){
    const switched=await session.switchAccount();
    if(switched.outcome!=='BROWSER_CANCELLED')throw Error('ACCOUNT_SWITCH_UNAVAILABLE');
    lockedSelection=false;
   }
   await session.submitPin({loginId:form.elements.loginId.value.trim(),pin});
   await finish();
  }
 }catch(error){failed(error);}
 finally{
  clearTimeout(checking);clearTimeout(slow);busy=false;
  if(check.hidden){field.disabled=false;field.placeholder='';button.disabled=false;form.elements.loginId.readOnly=false;}
 }
}
form.elements.pin.addEventListener('input',()=>{if(!busy&&form.checkValidity()&&/^[0-9]{4}$/.test(form.elements.pin.value))form.requestSubmit();});
form.addEventListener('submit',event=>{event.preventDefault();if(form.checkValidity())void attempt('pin');});
check.onclick=()=>void attempt('check');restart.onclick=()=>void attempt('restart');back.onclick=()=>void relay().catch(failed);
try{
 if(!/^[A-Za-z0-9_-]{43}$/.test(state))throw Error('STATE_CONFLICT');
 if(settings.expired)throw Error('CEREMONY_EXPIRED');
 if(settings.mode==='select'){
  const current=await session.bootstrap();
  lockedSelection=current.state==='LOCKED';
  showPin(false);
 }else{
  if(settings.mode==='renew'){
   const current=await session.bootstrap();
   if(current.state!=='UNLOCKED')showPin(current.state==='LOCKED');
   else{
    await new Promise(resolve=>setTimeout(resolve,1000));
    await session.refresh({activeWork:false});
    await finish();
   }
  }else{
   try{await finish();}
   catch(error){
    if(![401,423].includes(error.status))throw error;
    const current=await session.bootstrap();
    if(current.state==='UNLOCKED'){await session.refresh({activeWork:false});await finish();}
    else showPin(current.state==='LOCKED');
   }
  }
 }
}catch(error){failed(error);}
`;

// Root fixed service transports. No URL/callback/global fetch/child DB.
import {assertLocalIntegrationProfile} from './local-integration-profile.mjs';
import {pumpMasterOutbox} from './master-outbox-pump.mjs';
const keys={studio:'JWT_LOCAL_STUDIO_AUTH_SERVICE',hifz:'JWT_LOCAL_HIFZ_AUTH_SERVICE'};
const fail=()=>{throw Object.assign(Error('LOCAL_NATIVE_AUTH_SERVICE_UNAVAILABLE'),{code:'LOCAL_NATIVE_AUTH_SERVICE_UNAVAILABLE',status:503});};
export function withoutChildAuthServices(env){const next={...env};for(const key of Object.values(keys))delete next[key];return next;}
export function createNativeChildAuthPeers(env){
 const captured=Object.fromEntries(Object.entries(keys).map(([app,k])=>[app,env[k]]));
 if(!captured.studio||!captured.hifz||captured.studio===captured.hifz||Object.values(captured).some(s=>typeof s.stageAdmission!=='function'||typeof s.deliverMasterEvent!=='function'))fail();
 return Object.freeze(Object.fromEntries(['studio','hifz'].map(app=>[app,Object.freeze({
  async stageAdmission(packet){if(packet?.app!==app||packet.deadlineMs!==5000||!(packet.signal instanceof AbortSignal)||packet.signal.aborted)fail();const r=await captured[app].stageAdmission({app,body:packet.body,signature:packet.signature,deadlineMs:5000});if(packet.signal.aborted)fail();return r;},
  async deliverMasterEvent(packet){if(packet?.app!==app||!(packet.signal instanceof AbortSignal)||packet.signal.aborted)fail();const r=await captured[app].deliverMasterEvent({app,body:packet.body,signature:packet.signature,deadlineMs:5000});if(packet.signal.aborted)fail();return r;}
 })])));
}
// Explicit bounded foreground/server coordinator pass only; no scheduler/route,
// drain loop, polling or automatic timer. Existing durable retry/backoff stays.
export async function deliverPendingNativeMasterEvents(env){
 assertLocalIntegrationProfile(env);
 if(env.JWT_LOCAL_OUTBOX!=='1'||env.JWT_V110_MASTER!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1'||env.JWT_LOCAL_STAGE!=='V110_INTEGRATION'||env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||env.JWT_LOCAL_AI!=='OFF'||env.JWT_LOCAL_PROVIDERS!=='OFF'||env.JWT_LOCAL_TRANSCRIPTION!=='OFF'||env.JWT_LOCAL_SCHEDULES!=='OFF'||typeof env.ACADEMY_DB?.withSession!=='function'||env.JWT_LOCAL_APP_BINDING!=='academy:'+env.JWT_LOCAL_NATIVE_RUN_ID||env.ACADEMY_D1_RUN_ID!==env.JWT_LOCAL_NATIVE_RUN_ID)fail();
 const peers=createNativeChildAuthPeers(env),core=env.ACADEMY_DB.withSession('first-primary'),results=[];
 for(const app of ['studio','hifz']){
  const secret=env[app==='studio'?'JWT_LOCAL_MASTER_EVENT_SECRET_STUDIO':'JWT_LOCAL_MASTER_EVENT_SECRET_HIFZ'];
  if(typeof secret!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(secret))fail();
  for(const kind of ['account','lifecycle'])results.push(await pumpMasterOutbox({core,app,kind,secret,send:peers[app].deliverMasterEvent,limit:2,deliveryTimeoutMs:5000}));
 }
 const remaining=await core.prepare('SELECT (SELECT count(*) FROM jwt_v110_master_outbox WHERE delivered_at_s IS NULL)+(SELECT count(*) FROM jwt_v110_master_lifecycle_outbox WHERE delivered_at_s IS NULL) n').first('n');
 if(!Number.isSafeInteger(remaining)||remaining<0)fail();
 return Object.freeze({selected:results.reduce((n,r)=>n+r.selected,0),delivered:results.reduce((n,r)=>n+r.delivered,0),retry:results.reduce((n,r)=>n+r.retry,0),remaining,confirmed:remaining===0});
}

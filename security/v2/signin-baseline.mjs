import {canonical,digest,exact,requireThat,safeInt,uuid} from './codec.mjs';
import {requireExpected,expectedContext} from './http-context.mjs';
import {serviceFetch} from './http-service.mjs';

const exchangePath='/internal/auth/v2/account-baseline';
const stream='account-security';
const operationTtl=120;
const maxAttempts=3;
const exchangeTimeout=1500;
const leaseSeconds=8;
const recipients=['studio','hifz'];

export function signInBaselinePlan(runtime,binding,operationId,now) {
 if(runtime.settings.raw.signInBaselineRefresh!==true||!runtime.sharedAcademySessions)return [];
 return recipients.map(recipient=>runtime.store.stmt(`
  INSERT INTO jwt_v2_signin_baseline_jobs(operation_id,recipient,sid,sub,ce,ae,generation,expires_at)
  VALUES(?,?,?,?,?,?,?,?)`,operationId,recipient,binding.psid,binding.sub,binding.ce,binding.ae,
  runtime.settings.raw.signInBaselineGeneration,Math.min(now+operationTtl,binding.s_exp)));
}

const sourceSQL=`SELECT j.*,f.psid,f.bsid,f.bv,f.le,f.s_exp,
 s.owner_epoch,s.next_sequence-1 AS coverage,
 CASE j.recipient WHEN 'studio' THEN NOT EXISTS(
  SELECT 1 FROM website_platform_admissions w WHERE w.account_id=j.sub AND w.active=0)
 ELSE EXISTS(SELECT 1 FROM hifz_profile_sync h JOIN hifz_profile_sync_projection p USING(account_id)
  WHERE h.account_id=j.sub AND p.active=1) END AS eligible,
 CASE j.recipient WHEN 'studio' THEN coalesce((
  SELECT max(c.change_id) FROM jwt_v2_authority_changes c WHERE c.sub=j.sub AND c.source_table IN('accounts','website_platform_admissions')),0)
 ELSE coalesce((SELECT h.revision FROM hifz_profile_sync h WHERE h.account_id=j.sub),0) END AS decision_revision,
 NOT EXISTS(SELECT 1 FROM jwt_v2_native_outbox o JOIN jwt_v2_authority_changes c USING(change_id)
  WHERE o.target_app=j.recipient AND o.event_json IS NULL AND (c.sub IS NULL OR c.sub=j.sub)) AS security_ready
 FROM jwt_v2_signin_baseline_jobs j
 JOIN jwt_v2_families f ON f.sid=j.sid AND f.psid=f.sid AND f.sub=j.sub AND f.ce=j.ce AND f.ae=j.ae
 JOIN jwt_v2_accounts a ON a.sub=j.sub AND a.ce=j.ce AND a.ae=j.ae AND a.le=f.le AND a.active=1
 JOIN accounts n ON n.account_id=j.sub AND n.active=1
 JOIN account_credentials credentials ON credentials.account_id=n.account_id AND credentials.credential_epoch=a.ce AND credentials.pin_setup=1
 JOIN jwt_v2_parents p ON p.psid=f.psid AND p.bsid=f.bsid AND p.bv=f.bv AND p.state='UNLOCKED'
 JOIN jwt_v2_browsers b ON b.bsid=f.bsid AND b.sub=f.sub AND b.psid=f.psid AND b.bv=f.bv AND b.cancelled_through<f.bv
 JOIN jwt_v2_http_transactions t ON t.operation_id=j.operation_id AND t.sub=j.sub AND t.status='COMMITTED'
  AND json_extract(t.result_json,'$.sid')=j.sid
 JOIN jwt_v2_sender_streams s ON s.target_app=j.recipient AND s.stream='account-security'
 JOIN jwt_v2_objects published ON published.object_key=?||f.sid AND published.state='ACTIVE'
  AND published.semantic_revision=f.cr
 WHERE j.operation_id=? AND j.recipient=? AND j.sid=? AND j.generation=?
 AND f.state='UNLOCKED' AND f.authority_ready=1 AND min(f.deadline,f.idle_until,f.s_exp)>?
 AND NOT EXISTS(SELECT 1 FROM split_write_fence)`;

function sourceArgs(runtime,operationId,recipient,sid) {
 return [runtime.store.controlKey('security/session/'),operationId,recipient,sid,
  runtime.settings.raw.signInBaselineGeneration,runtime.clock()];
}

function currentDecision(runtime,row,proof) {
 return row?.eligible===1&&row.security_ready===1&&proof.sub===row.sub&&proof.ce===row.ce&&proof.ae===row.ae
  &&proof.eligibilityRevision===row.decision_revision&&proof.ownerEpoch===row.owner_epoch
  &&proof.generation===row.generation&&proof.expiresAt>runtime.clock();
}

const newerProofSQL=`SELECT 1 FROM jwt_v2_signin_baseline_jobs j
 WHERE j.sub=? AND j.recipient=? AND j.ce=? AND j.ae=? AND j.generation=? AND j.ordinal>?
 AND j.status IN('PENDING','APPLIED') AND j.proof IS NOT NULL
 AND json_extract(j.proof,'$.coverage')>=?`;
const newerProofArgs=p=>[p.sub,p.recipient,p.ce,p.ae,p.generation,p.ordinal,p.coverage];

async function recordDecision(runtime,args,job,proof,status,receipt) {
 const {store}=runtime;
 const guard=store.guard(`SELECT 1 FROM (${sourceSQL}) current
  WHERE current.status='PENDING' AND current.eligible=1 AND current.security_ready=1 AND current.decision_revision=? AND current.owner_epoch=?
   AND current.attempts=? AND current.expires_at>? AND NOT EXISTS(${newerProofSQL})`,
  [...args,proof.eligibilityRevision,proof.ownerEpoch,job.attempts,runtime.clock(),...newerProofArgs(proof)]);
 await store.batch([guard[0],store.stmt(`UPDATE jwt_v2_signin_baseline_jobs
  SET status=?,proof=?,receipt=?,lease_until=0 WHERE ordinal=? AND status='PENDING'`,
  status,canonical(proof),canonical(receipt),job.ordinal),guard[1]]);
 return status;
}

function acknowledgement(reply,proof,proofDigest) {
 exact(reply,['schema','kind','status','proofDigest','env','recipient','generation','ownerEpoch','operationId','psid',
  'sub','ce','ae','eligibilityRevision','coverage','verifiedCoverage','highestSeen']);
 requireThat(reply.schema===1&&reply.kind==='signin-account-baseline-receipt'&&reply.proofDigest===proofDigest
  &&['env','recipient','generation','ownerEpoch','operationId','psid','sub','ce','ae','eligibilityRevision','coverage']
   .every(key=>reply[key]===proof[key])
  &&['APPLIED','PENDING'].includes(reply.status)&&safeInt(reply.verifiedCoverage)&&safeInt(reply.highestSeen)
  &&reply.verifiedCoverage<=reply.highestSeen
  &&(reply.status!=='APPLIED'||reply.verifiedCoverage>=proof.coverage&&reply.verifiedCoverage===reply.highestSeen),'INVALID_BASELINE_RECEIPT',503);
 return reply;
}

async function deliverRecipient(runtime,operationId,recipient,sid) {
 const {store}=runtime,args=sourceArgs(runtime,operationId,recipient,sid),job=await store.first(sourceSQL,...args);
 if(!job)return 'PENDING';
 if(job.eligible!==1)return 'INELIGIBLE';
 const now=runtime.clock();
 if(job.security_ready!==1)return 'PENDING';
 if(job.status!=='PENDING'){
  const installed=job.proof&&JSON.parse(job.proof);
  return installed&&currentDecision(runtime,job,installed)&&installed.coverage===job.coverage
   &&!await store.first(newerProofSQL,...newerProofArgs(installed))?job.status:'PENDING';
 }
 if(job.expires_at<=now||job.attempts>=maxAttempts)return 'PENDING';
 if(job.lease_until>now)return {state:'PENDING',retryAfterMs:(job.lease_until-now)*1000};

 if(!job.proof) {
  const previous=await store.first(`SELECT proof FROM jwt_v2_signin_baseline_jobs
   WHERE sub=? AND recipient=? AND ce=? AND ae=? AND generation=? AND status='APPLIED'
   ORDER BY ordinal DESC LIMIT 1`,job.sub,recipient,job.ce,job.ae,job.generation);
  if(previous?.proof) {
   const proof=JSON.parse(previous.proof);
   if(currentDecision(runtime,job,proof)&&proof.coverage===job.coverage)
    return recordDecision(runtime,args,job,proof,'REUSED',{status:'REUSED',operationId});
  }
 }

 const proof=job.proof?JSON.parse(job.proof):{
  schema:1,kind:'signin-account-baseline',env:runtime.config.env,recipient,generation:job.generation,
  ownerEpoch:job.owner_epoch,operationId,sub:job.sub,ce:job.ce,ae:job.ae,psid:job.psid,bsid:job.bsid,
  bv:job.bv,le:job.le,eligibilityRevision:job.decision_revision,coverage:job.coverage,ordinal:job.ordinal,
  issuedAt:now,expiresAt:job.s_exp
 };
 if(!currentDecision(runtime,job,proof))return 'PENDING';
 const guard=store.guard(`SELECT 1 FROM (${sourceSQL}) current
  WHERE current.status='PENDING' AND current.attempts=? AND current.lease_until<=? AND current.expires_at>?
   AND current.eligible=1 AND current.security_ready=1 AND current.decision_revision=? AND current.owner_epoch=?
   AND (current.proof IS NOT NULL OR current.coverage=?)`,
  [...args,job.attempts,now,now,proof.eligibilityRevision,proof.ownerEpoch,proof.coverage]);
 await store.batch([guard[0],store.stmt(`UPDATE jwt_v2_signin_baseline_jobs SET
  proof=coalesce(proof,?),attempts=attempts+1,lease_until=? WHERE ordinal=? AND status='PENDING'`,
  canonical(proof),now+leaseSeconds,job.ordinal),guard[1]]);
 job.attempts++;
 try {
  const reply=acknowledgement(await serviceFetch(runtime,{targetApp:recipient,path:exchangePath,body:proof,
   operationId,timeoutMs:exchangeTimeout}),proof,await digest(proof));
  if(reply.status==='APPLIED')
   return await recordDecision(runtime,sourceArgs(runtime,operationId,recipient,sid),job,proof,'APPLIED',reply);
  const current=await store.first(sourceSQL,...sourceArgs(runtime,operationId,recipient,sid));
  if(currentDecision(runtime,current,proof)&&current.expires_at>runtime.clock()
   &&reply.verifiedCoverage<Math.min(Math.max(proof.coverage,reply.highestSeen),current.coverage)) {
   const event=await store.first(`SELECT event_json FROM jwt_v2_sender_facts
    WHERE target_app=? AND stream=? AND owner_epoch=? AND sequence=?`,
    recipient,stream,proof.ownerEpoch,reply.verifiedCoverage+1);
   if(event) {
    const batchId=crypto.randomUUID();
    await serviceFetch(runtime,{targetApp:recipient,path:'/internal/auth/v2/events',operationId:batchId,
     body:{schema:2,env:runtime.config.env,sourceApp:'academy',targetApp:recipient,batchId,events:[JSON.parse(event.event_json)]},
     timeoutMs:exchangeTimeout});
   }
  }
  return 'PENDING';
 } finally {
  await store.stmt("UPDATE jwt_v2_signin_baseline_jobs SET lease_until=0 WHERE ordinal=? AND attempts=? AND status='PENDING'",
   job.ordinal,job.attempts).run();
 }
}

export async function signInReadiness(runtime,request,body) {
 requireThat(runtime.app==='academy'&&runtime.sharedAcademySessions&&runtime.settings.raw.signInBaselineRefresh===true,
  'SIGNIN_BASELINE_DISABLED',404);
 exact(body,['operationId','expectedContext']);
 requireThat(uuid(body.operationId),'INVALID_OPERATION',400);
 // The public POST has already passed verifyBootstrap. Require the installed,
 // current cookie pair explicitly, independent of historical PIN attempt proof.
 const cap=await runtime.authorise(new Request(request.url,{headers:request.headers}));
 requireExpected(cap.context,expectedContext(request,body));
 // A new authenticated holder can finish prior local logout publication after
 // the old browser and its intent have gone. Keep this independent of child ACKs.
 const priorLogout=await runtime.store.first(`SELECT o.operation_id FROM jwt_v2_worksets w
  JOIN jwt_v2_operations o ON o.operation_id=w.work_id
  WHERE o.sub=? AND o.kind='VOLUNTARY_LOGOUT' AND w.state='PENDING'
   AND (CAST(json_extract(w.target_json,'$.maxCe') AS INTEGER)<?
    OR (CAST(json_extract(w.target_json,'$.maxCe') AS INTEGER)=? AND CAST(json_extract(w.target_json,'$.maxAe') AS INTEGER)<?))
  ORDER BY w.created_at,w.work_id LIMIT 1`,cap.context.sub,cap.context.ce,cap.context.ce,cap.context.ae);
 const localReady=!priorLogout||await runtime.publishPending(priorLogout.operation_id,{limit:3});
 const results=await Promise.allSettled(recipients.map(app=>deliverRecipient(runtime,body.operationId,app,cap.context.sid)));
 const outcomes=results.map(result=>result.status==='fulfilled'?result.value:'PENDING');
 const readiness=Object.fromEntries(outcomes.map((outcome,i)=>[recipients[i],localReady?(outcome.state??outcome):'PENDING']));
 const retryAfterMs=Math.min(leaseSeconds*1000,Math.max(0,...outcomes.map(outcome=>outcome.retryAfterMs??0)));
 return runtime.json({success:true,operationId:body.operationId,readiness,retryAfterMs},200,cap);
}

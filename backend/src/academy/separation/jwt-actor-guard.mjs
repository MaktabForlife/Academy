// Only actorProof's server-verified cookie producer supplies this optional
// binding over the existing private coordinator RPC. It is not a browser DTO.
const fail=()=>{throw Object.assign(Error('Your app session changed. Sign in again.'),{status:401,code:'SESSION_ENDED'});};
export function jwtActorPredicate(proof){
 const c=proof?.jwt;if(c===undefined)return {sql:'',values:[]};
 if(!c||Object.getPrototypeOf(c)!==Object.prototype||Object.keys(c).sort().join(',')!=='bsid,bv,ce,exp,iat,psid,pv,s_exp,s_iat,sid,sub,ue'||['sub','sid','psid','bsid'].some(k=>typeof c[k]!=='string'||!/^[-A-Za-z0-9_:]{1,180}$/.test(c[k]))||['bv','ce','pv','ue','iat','exp','s_iat','s_exp'].some(k=>!Number.isSafeInteger(c[k])||c[k]<0)||c.sub!==proof.accountId||c.sid!==proof.sid||c.ce!==proof.epoch||c.psid!==c.sid||c.s_iat>c.iat||c.exp<=c.iat||c.exp-c.iat>900||c.exp>c.s_exp||c.s_exp<=c.s_iat||c.s_exp-c.s_iat>604800)fail();
 const time="CAST(strftime('%s','now') AS INTEGER)";
 const sql=" AND ?<="+time+" AND ?>"+time+" AND EXISTS(SELECT 1 FROM jwt_v110_families f JOIN jwt_v110_accounts v USING(account_id) JOIN jwt_v110_browser_heads b USING(browser_id) WHERE f.family_id=? AND f.account_id=a.account_id AND f.parent_session_id=? AND f.browser_id=? AND f.browser_generation=? AND f.credential_epoch=? AND f.unlock_generation=? AND f.original_signed_in_at_s=? AND f.original_expires_at_s=? AND f.revoked=0 AND v.active=1 AND v.credential_epoch=f.credential_epoch AND v.permission_version=? AND b.generation=f.browser_generation AND f.original_expires_at_s>"+time+" AND f.last_fg_refresh_s>=f.original_signed_in_at_s AND f.last_fg_refresh_s<="+time+" AND "+time+"-f.last_fg_refresh_s<5400 AND NOT EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones t WHERE t.parent_session_id=f.parent_session_id))";
 return {sql,values:[c.iat,c.exp,c.sid,c.psid,c.bsid,c.bv,c.ce,c.ue,c.s_iat,c.s_exp,c.pv]};
}

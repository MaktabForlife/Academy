const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function studioMonthlyMedia(host,activityKey,{current=()=>true,onHistorical=()=>{}}={}){
 const owner=localStorage.getItem('m4l_account_token')||'';
 const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/studio-access',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+owner,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({activityKey,command:{action:'media-location'}})});
 if(!current()||owner!==localStorage.getItem('m4l_account_token'))return true;
 const result=await response.json();
 if(response.status===404||response.ok&&result.legacyOnly)return false;
 if(!response.ok||!result.success)throw Error(result.error||'This media workspace could not be checked.');
 if(!result.managed&&!result.monthly)return false;
 const label=result.kind==='COURSE'?'Course':result.programmeKey==='mothers'?'MOU':'Tafseer';
 const target=new URL(result.destination);if(!['https:','http:'].includes(target.protocol)||target.pathname!=='/studio/'||target.searchParams.get('offering')!==result.offeringId||target.searchParams.get('section')!=='media')throw Error('This media destination could not be checked.');
 host.innerHTML='<header><h2>'+label+' media</h2><p>Build playlists, attach recordings and review private drafts in the programme’s current media workspace.</p><a class="button" href="'+esc(target.href)+'">Open '+label+' media →</a></header><details data-academy-historical><summary>Historical Academy material</summary><p>Original Academy recordings and Surah websites keep their existing identities and access. No playlist mapping has been inferred.</p><div data-academy-history></div></details>';
 let loaded=false;host.querySelector('[data-academy-historical]').addEventListener('toggle',event=>{if(!event.target.open||loaded||!current()||owner!==localStorage.getItem('m4l_account_token'))return;loaded=true;onHistorical(host.querySelector('[data-academy-history]'));});return true;
}

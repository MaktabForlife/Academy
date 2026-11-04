const owner=localStorage.getItem('m4l_account_token')||'',query=new URLSearchParams(location.search),active=()=>owner&&owner===localStorage.getItem('m4l_account_token');
try{
 if(!active())throw Error('Sign in to Academy before opening Website Studio.');
 const input={codeChallenge:query.get('challenge'),state:query.get('state'),...(query.get('activityKey')?{activityKey:query.get('activityKey')}:{}),...(query.get('surahId')?{surahId:query.get('surahId')}:{})};
 const response=await fetch(window.M4L_CONFIG.API_BASE+'/api/academy/website-studio/handoff',{method:'POST',headers:{Authorization:'Bearer '+owner,'X-Academy-Workspace':'ADMIN','Content-Type':'application/json'},body:JSON.stringify(input)}),result=await response.json();if(!active())throw Error('Your Academy account changed. Reopen Website Studio.');if(!response.ok||!result.success)throw Error(result.error||'Website Studio could not be opened.');
 const target=new URL(result.url);if(query.get('edit')==='text'){target.hash+='&edit=text';if(query.get('lesson'))target.hash+='&lesson='+encodeURIComponent(query.get('lesson'));}location.replace(target.href);
}catch(error){document.getElementById('status').textContent=error.message;}

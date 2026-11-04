const config=globalThis.AcademyHosting,params=new URL(location.href).searchParams;
const status=document.querySelector('[role=status]');
async function start(){
 const state=params.get('state'),challenge=params.get('challenge');
 if(![state,challenge].every(v=>/^[A-Za-z0-9_-]{43}$/.test(v||'')))throw Error('Reopen Studio from your dashboard.');
 const token=localStorage.getItem('m4l_account_token');
 if(!token){const next=new URL('/',location.origin);next.searchParams.set('login','1');next.searchParams.set('studioResume',state);sessionStorage.setItem('academy-studio-resume-v1',JSON.stringify({state,challenge,createdAt:Date.now()}));location.replace(next);return;}
 const response=await fetch(config.academyApiOrigin+'/api/academy/hub/studio-start',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({state,challenge})}),result=await response.json();
 if(!response.ok)throw Error(result.error||'Studio could not be opened. Please retry.');
 if(localStorage.getItem('m4l_account_token')!==token)throw Error('Your account changed. Reopen Studio.');
 const next=new URL('/academy-connect.html',config.studioOrigin);next.hash=new URLSearchParams({code:result.code,state});location.replace(next.href);
}
start().catch(error=>{status.textContent=error.message;document.querySelector('button').hidden=false;});
document.querySelector('button').onclick=()=>location.reload();

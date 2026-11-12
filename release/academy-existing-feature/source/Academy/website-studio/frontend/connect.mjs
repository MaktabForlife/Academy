const status=document.getElementById('status'),random=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
try{
 const config=await (await fetch('/api/config')).json(),query=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));
 if(fragment.get('code')){
  const saved=JSON.parse(sessionStorage.getItem('website-studio-connect')||'null');history.replaceState(null,'','/connect');if(!saved||saved.state!==fragment.get('state'))throw Error('Reopen Website Studio from Academy.');
  const response=await fetch('/api/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:fragment.get('code'),state:saved.state,verifier:saved.verifier})}),result=await response.json();sessionStorage.removeItem('website-studio-connect');if(!response.ok)throw Error(result.error);localStorage.setItem('website-studio-account',result.sourceTokenHash);
  const target=new URL(fragment.get('edit')==='text'?'/text/':'/',location.origin);for(const [key,value]of Object.entries(result.selection||{}))target.searchParams.set(key,value);if(fragment.get('lesson'))target.hash='lesson/'+encodeURIComponent(fragment.get('lesson'));location.replace(target.href);
 }else{
  const verifier=random(),state=random(),challenge=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');sessionStorage.setItem('website-studio-connect',JSON.stringify({verifier,state}));
  const target=new URL('/academy/website-studio/connect/',config.academyOrigin);for(const key of ['activityKey','surahId','edit','lesson'])if(query.get(key))target.searchParams.set(key,query.get(key));target.searchParams.set('challenge',challenge);target.searchParams.set('state',state);location.replace(target.href);
 }
}catch(error){status.textContent=error.message;}

const status=document.getElementById('status');
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
try{
 const base=window.M4L_CONFIG?.API_BASE||window.M4L_CONFIG?.API_URL||location.origin;
 const request=async(path,body)=>{const response=await fetch(base.replace(/\/$/,'')+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'}),result=await response.json();if(!response.ok)throw Error(result.error||'Academy is unavailable.');return result;};
 const config=await request('/api/website-platform/config');if(!window.opener||!config.enabled||new URL(config.websiteOrigin).origin!==config.websiteOrigin)throw Error('Open Academy using the Academy button on the website.');
 const verifier=encode(crypto.getRandomValues(new Uint8Array(32))),state=encode(crypto.getRandomValues(new Uint8Array(32))),challenge=encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
 const received=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('This handoff expired. Reopen Academy from the website.')),60_000);const listener=event=>{if(event.source!==window.opener||event.origin!==config.websiteOrigin||event.data?.type!=='WEBSITE_ACADEMY_CODE'||event.data.state!==state)return;clearTimeout(timer);window.removeEventListener('message',listener);resolve(event.data);};window.addEventListener('message',listener);});
 window.opener.postMessage({type:'ACADEMY_WEBSITE_CHALLENGE',state,challenge},config.websiteOrigin);
 const result=await received,session=await request('/api/website-platform/exchange',{code:result.code,state,verifier});
 localStorage.setItem('m4l_account_token',session.token);window.dispatchEvent(new Event('m4l-academy-session'));location.replace('/academy/');
}catch(error){status.textContent=error.message;}

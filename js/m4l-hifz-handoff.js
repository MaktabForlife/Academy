(async function(){
 'use strict';
 const status=document.getElementById('hifz-signin-status');
 try{
  const query=new URLSearchParams(location.search),state=query.get('state'),codeChallenge=query.get('challenge'),expectedLoginId=query.get('login');
  // Remove the temporary request from browser history before doing any I/O.
  history.replaceState(null,'','/academy/hifz/');
  if(!/^[A-Za-z0-9_-]{43}$/.test(state||'')||! /^[A-Za-z0-9_-]{43}$/.test(codeChallenge||'')||! /^[A-Za-z0-9]+$/.test(expectedLoginId||''))throw new Error('Open Hifz using the link in Academy.');
  const token=localStorage.getItem('m4l_account_token');
  if(!token)throw new Error('Please sign into Academy, then select HifzHelper again.');
  const config=window.M4L_CONFIG,base=new URL(config.HIFZHELPER_URL),api=config.API_BASE;
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw new Error('Hifz sign-in is unavailable.');
  const response=await fetch(api+'/api/academy/hifz/sign-in',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({codeChallenge,expectedLoginId}),redirect:'error',cache:'no-store'});
  const result=await response.json();
  if(!response.ok||!result.success)throw new Error(result.error||'Hifz sign-in could not be completed.');
  if(!/^[A-Za-z0-9_-]{43}$/.test(result.code||''))throw new Error('Hifz sign-in could not be completed.');
  const target=new URL('academy',base);target.hash=new URLSearchParams({code:result.code,state}).toString();
  status.textContent='Opening your Hifz journal…';location.replace(target.href);
 }catch(error){status.textContent=error.message||'Please return to Academy and try again.';}
})();

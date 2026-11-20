/* Course Media uses the existing checked Academy → current Studio owner proxy. */
(()=>{'use strict';
 const v2=()=>window.M4L_ACADEMY_AUTH?.selected===true;
 const owner=()=>v2()?window.M4L_ACADEMY_AUTH.ownerKey():localStorage.getItem('m4l_account_token')||'';
 let panel=null,generation=0;
 const modules=Promise.all([import('./m4l-course-media-view.mjs'),import('./m4l-playlist-card.mjs')]);
 function reset(){generation++;panel?.dispose?.();panel=null;}
 async function open({hostId,activityKey,courseName,current=()=>true}){
  const host=document.getElementById(hostId);if(!host)return;
  const client=v2()?await window.M4L_ACADEMY_AUTH.ready:null;
  if(client)await client.ensureFresh();
  const context={owner:owner(),generation:++generation,host,activityKey};panel?.dispose?.();panel={...context,dispose:null};
  const active=()=>panel?.generation===context.generation&&context.owner===owner()&&current()&&host.isConnected;
  const responses=new WeakMap();
  const send=async command=>{if(!active())throw new DOMException('The account or Course changed.','AbortError');
   const headers={'Content-Type':'application/json','X-Academy-Workspace':'ADMIN'};if(!client)headers.Authorization='Bearer '+context.owner;
   const transport=window.M4L_ACADEMY_WORKSPACE?.adminFetch?((url,options)=>window.M4L_ACADEMY_WORKSPACE.adminFetch(url,options,{activityKey})):client?.protectedFetch?.bind(client)||fetch;
   const response=await transport((client?'':window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/studio-access'+(command.action==='mou-playlist-cover-upload'?'/playlist-cover':''),{method:'POST',headers,body:JSON.stringify({activityKey,command})});
   const result=await response.json();if(!active())throw new DOMException('The account or Course changed.','AbortError');
   if(client){client.trackResult(result,response);if(!client.isCurrentResult(result))throw new DOMException('The Academy session changed.','AbortError');responses.set(result,response);}
   if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Course Media is unavailable.'),{status:response.status,code:result.code});return result;
  };
  host.innerHTML='<p role="status">Checking Course Media…</p>';
  try{const location=await send({action:'media-location'});if(!location.managed||location.kind!=='COURSE'||location.ownership!=='STUDIO')throw Error('Course Media is waiting for its existing Studio setup. Resume setup in Details.');
   const [{mountCourseMedia},cardTools]=await modules;if(!active())return;
   for(const href of ['/css/m4l-course-media.css','/css/m4l-playlist-card.css'])if(!document.querySelector('link[href="'+href+'"]')){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
   const prepare=async(action,input={})=>{
    if(action==='mou-playlist-cover-upload'){const {file,image,...rest}=input,bytes=new Uint8Array(await file.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));return {action,...rest,operationId:rest.operationId||crypto.randomUUID(),sha256:image.sha256,type:file.type,data:btoa(data)};}
    if(action==='mou-playlist-cover-preview')return {action,playlistId:input.playlistId,assetId:input.image.assetId};
    return {action,...input};
   };
   const request=async(action,input={})=>{const value=await send(await prepare(action,input));if(action==='mou-playlist-cover-preview'){const bytes=Uint8Array.from(atob(value.data),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:value.image.type});if(client)client.trackResult(blob,responses.get(value));return blob;}return value;};
   request.prepare=prepare;request.sendPrepared=send;
   panel.dispose=mountCourseMedia(host,{request,client,activityKey,cardTools,courseName,websiteOrigin:new URL(location.destination).origin,current:active});
  }catch(error){if(active()){host.replaceChildren();const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;host.append(message);const retry=document.createElement('button');retry.type='button';retry.className='button secondary';retry.textContent='Try again';retry.onclick=()=>open({hostId,activityKey,courseName,current});host.append(retry);}}
 }
 window.M4L_COURSE_MEDIA={open,reset,canLeave:()=>panel?.dispose?.canLeave?.()!==false};
 for(const event of ['storage','m4l-academy-session','m4l-academy-session-ended','m4l-academy-workspace'])window.addEventListener(event,()=>{if(panel&&(panel.owner!==owner()||window.M4L_ACADEMY_WORKSPACE?.current?.()!=='ADMIN'))reset();});
})();

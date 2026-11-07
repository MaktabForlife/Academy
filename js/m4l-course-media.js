/* Course Media uses the existing signed Academy → current Studio owner proxy. */
(()=>{'use strict';
 let panel=null,generation=0;const token=()=>localStorage.getItem('m4l_account_token')||'';
 const modules=Promise.all([import('./m4l-course-media-view.mjs'),import('./m4l-playlist-card.mjs')]);
 function reset(){generation++;panel?.dispose?.();panel=null;}
 async function open({hostId,activityKey,courseName,current=()=>true}){
  const host=document.getElementById(hostId);if(!host)return;
  const context={token:token(),generation:++generation,host,activityKey};panel?.dispose?.();panel={...context,dispose:null};
  const active=()=>panel?.generation===context.generation&&context.token===token()&&current()&&host.isConnected;
  const send=async command=>{if(!active())throw new DOMException('The account or Course changed.','AbortError');
   const response=await (window.M4L_ACADEMY_WORKSPACE?.adminFetch?((url,options)=>window.M4L_ACADEMY_WORKSPACE.adminFetch(url,options,{activityKey})):fetch)((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/studio-access'+(command.action==='mou-playlist-cover-upload'?'/playlist-cover':''),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+context.token,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({activityKey,command})});
   const result=await response.json();if(!active())throw new DOMException('The account or Course changed.','AbortError');if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Course Media is unavailable.'),{status:response.status,code:result.code});return result;
  };
  host.innerHTML='<p role="status">Checking Course Media…</p>';
  try{const location=await send({action:'media-location'});if(!location.managed||location.kind!=='COURSE'||location.ownership!=='STUDIO')throw Error('Course Media is waiting for its existing Studio setup. Resume setup in Details.');
   const [{mountCourseMedia,academyReaderOrigin},cardTools]=await modules;if(!active())return;
   for(const href of ['/css/m4l-course-media.css','/css/m4l-playlist-card.css'])if(!document.querySelector('link[href="'+href+'"]')){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
   const request=async(action,input={})=>{
    if(action==='mou-playlist-cover-upload'){const {file,image,...rest}=input,bytes=new Uint8Array(await file.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));return send({action,...rest,operationId:crypto.randomUUID(),sha256:image.sha256,type:file.type,data:btoa(data)});}
    if(action==='mou-playlist-cover-preview'){const value=await send({action,playlistId:input.playlistId,assetId:input.image.assetId}),bytes=Uint8Array.from(atob(value.data),c=>c.charCodeAt(0));return new Blob([bytes],{type:value.image.type});}
    return send({action,...input});
   };
   const processingRequest=async(action,input={})=>{
    if(!active())throw new DOMException('The account or Course changed.','AbortError');
    const part=action==='video-source-upload-part',{file,...fields}=input;
    if(part&&(!(file instanceof Blob)||file.size>5*1024*1024))throw Error('Choose a valid recording part.');
    const path='/api/admin/platform/studio-processing'+(part?'/recording-part?'+new URLSearchParams({activityKey,assetId:fields.assetId,partNumber:fields.partNumber}):'');
    const response=await (window.M4L_ACADEMY_WORKSPACE?.adminFetch?((url,options)=>window.M4L_ACADEMY_WORKSPACE.adminFetch(url,options,{activityKey})):fetch)((window.M4L_CONFIG?.API_BASE||'')+path,{method:'POST',headers:{'Content-Type':part?'application/octet-stream':'application/json',Authorization:'Bearer '+context.token,'X-Academy-Workspace':'ADMIN'},body:part?file:JSON.stringify({activityKey,command:{action,...fields}})});
    const result=await response.json();if(!active())throw new DOMException('The account or Course changed.','AbortError');if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Video processing is unavailable.'),{status:response.status,code:result.code});return result;
   };
   const websiteOrigin=new URL(location.destination).origin;
   const readerOrigin=academyReaderOrigin({portalOrigin:window.M4L_CONFIG?.PORTAL_ORIGIN,studioOrigin:window.M4L_CONFIG?.STUDIO_ORIGIN,currentOrigin:window.location.origin,websiteOrigin});
   panel.dispose=mountCourseMedia(host,{request,processingRequest,offeringId:location.offeringId,processingStyleHref:'/css/m4l-media-attachment.css',cardTools,courseName,websiteOrigin,readerOrigin,current:active});
  }catch(error){if(active()){host.replaceChildren();const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;host.append(message);const retry=document.createElement('button');retry.type='button';retry.className='button secondary';retry.textContent='Try again';retry.onclick=()=>open({hostId,activityKey,courseName,current});host.append(retry);}}
 }
 window.M4L_COURSE_MEDIA={open,reset,canLeave:()=>panel?.dispose?.canLeave?.()!==false};
 for(const event of ['storage','m4l-academy-session','m4l-academy-workspace'])window.addEventListener(event,()=>{if(panel&&(panel.token!==token()||window.M4L_ACADEMY_WORKSPACE?.current?.()!=='ADMIN'))reset();});
})();

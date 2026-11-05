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
   const [{mountCourseMedia},cardTools]=await modules;if(!active())return;
   for(const href of ['/_assets/bac8771016a34ecca0a09245ad6860841274abada5de0a1c812ea6e2d8610efc/css/m4l-course-media.css','/_assets/bac8771016a34ecca0a09245ad6860841274abada5de0a1c812ea6e2d8610efc/css/m4l-playlist-card.css'])if(!document.querySelector('link[href="'+href+'"]')){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
   const request=async(action,input={})=>{
    if(action==='mou-playlist-cover-upload'){const {file,image,...rest}=input,bytes=new Uint8Array(await file.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));return send({action,...rest,operationId:crypto.randomUUID(),sha256:image.sha256,type:file.type,data:btoa(data)});}
    if(action==='mou-playlist-cover-preview'){const value=await send({action,playlistId:input.playlistId,assetId:input.image.assetId}),bytes=Uint8Array.from(atob(value.data),c=>c.charCodeAt(0));return new Blob([bytes],{type:value.image.type});}
    return send({action,...input});
   };
   panel.dispose=mountCourseMedia(host,{request,cardTools,courseName,websiteOrigin:new URL(location.destination).origin,current:active});
  }catch(error){if(active()){host.replaceChildren();const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;host.append(message);const retry=document.createElement('button');retry.type='button';retry.className='button secondary';retry.textContent='Try again';retry.onclick=()=>open({hostId,activityKey,courseName,current});host.append(retry);}}
 }
 window.M4L_COURSE_MEDIA={open,reset,canLeave:()=>panel?.dispose?.canLeave?.()!==false};
 for(const event of ['storage','m4l-academy-session','m4l-academy-workspace'])window.addEventListener(event,()=>{if(panel&&(panel.token!==token()||window.M4L_ACADEMY_WORKSPACE?.current?.()!=='ADMIN'))reset();});
})();

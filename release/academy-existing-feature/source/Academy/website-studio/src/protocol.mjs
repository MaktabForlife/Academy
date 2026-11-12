export const format='ACADEMY_WEBSITE_STUDIO_V1';
export const objectLimit=1200000,documentLimit=500000;
export const error=(message,status=400,code='WEBSITE_STUDIO_REQUEST')=>Object.assign(Error(message),{status,code});
export const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const digest=value=>/^[a-f0-9]{64}$/.test(value||'');
export const siteId=input=>input.surahId!==undefined&&uuid(input.surahId)&&/^PROGRAM:[^:]{1,160}$/.test(input.activityKey||'')?'SURAH:'+input.surahId.toLowerCase():input.surahId===undefined&&/^COURSE:[^:]{1,160}$/.test(input.activityKey||'')?input.activityKey.toUpperCase():(()=>{throw error('Choose a website.');})();
export const canonicalSite=input=>({activityKey:String(input.activityKey).toUpperCase(),...(input.surahId?{surahId:input.surahId.toLowerCase()}:{})});
export const sha256=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value))].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function boundedBytes(body,limit){const reader=body?.getReader();if(!reader)return new Uint8Array();const parts=[];let size=0;try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>limit){await reader.cancel();throw error('This website request is too large.',413);}parts.push(next.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}return bytes;}
export async function boundedJSON(body,limit=objectLimit){let result;try{result=JSON.parse(new TextDecoder().decode(await boundedBytes(body,limit)));}catch(e){if(e.status)throw e;throw error('The website request is invalid.');}if(!result||typeof result!=='object'||Array.isArray(result))throw error('The website request is invalid.');return result;}
export const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...headers}});
export const failure=e=>json({success:false,error:e.status?e.message:'Website Studio is temporarily unavailable.',code:e.code||'WEBSITE_STUDIO_UNAVAILABLE'},e.status||503);
export const versionKey=(id,hash)=>'websites/'+encodeURIComponent(id)+'/versions/'+hash+'.json';
export const imageKey=hash=>'images/sha256/'+hash;

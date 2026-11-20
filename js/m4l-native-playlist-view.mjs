const schema='PLAYLIST_MODEL_V1';
export function recordingViewMarker(marker,{nonce,activityKey}){
 if(!marker||marker.nonce!==nonce||marker.activityKey!==activityKey||!marker.view||typeof marker.view!=='object')return null;
 const view={};for(const key of ['group','lesson'])if(marker.view[key]!==undefined){if(typeof marker.view[key]!=='string'||marker.view[key].length>8000)return null;view[key]=marker.view[key];}
 if(view.lesson){try{const ids=JSON.parse(view.lesson);if(!Array.isArray(ids)||ids.length!==2||ids.some(id=>typeof id!=='string'||!id||id.length>256))return null;}catch{return null;}}
 if(marker.view.tab!==undefined&&!['listen','read'].includes(marker.view.tab))return null;if(marker.view.tab)view.tab=marker.view.tab;
 if(marker.playlistId!==null&&marker.playlistId!==undefined&&(typeof marker.playlistId!=='string'||!/^[-A-Za-z0-9_:]{1,160}$/.test(marker.playlistId)))return null;
 return {view,playlistId:marker.playlistId||null};
}
export function nativePlaylistReader({request,isCurrent=()=>true,onChange=()=>{}}){
 const auth=globalThis.window?.M4L_ACADEMY_AUTH,v2=auth?.selected===true;let owner='',catalogueProof=null,selectedProof=null,listening=false;
 const valid=proof=>!v2||auth.hasSession()&&auth.ownerKey()===owner&&(!proof||auth.isCurrentResult(proof));
 let ticket=0,selectionTicket=0,listTicket=0,catalogue=null,selected=null,pending=false,error='';const requests=new Map();
 const state=()=>({catalogue:valid(catalogueProof)?catalogue:null,selected:valid(selectedProof)?selected:null,pending,error});
 const invalidate=()=>{ticket++;requests.clear();catalogue=null;selected=null;catalogueProof=null;selectedProof=null;pending=false;error='';onChange(state());};
 const mask=event=>{if(event.detail?.masked!==false)invalidate();};
 const events=[['academy-v2-mask',mask],['academy-v2-context',invalidate],['academy-v2-revalidate',invalidate],['pagehide',invalidate]];
 const listen=()=>{if(v2&&!listening){listening=true;for(const [name,fn] of events)window.addEventListener(name,fn);}};
 const stop=()=>{if(listening){listening=false;for(const [name,fn] of events)window.removeEventListener(name,fn);}};
 async function load(action,input,{more=false}={}){
  if(v2){listen();if(!owner)owner=auth.ownerKey();if(!valid(null))throw new DOMException('The Academy session changed.','AbortError');}
  const key=JSON.stringify([action,input,more]);if(requests.has(key))return requests.get(key);
  const generation=ticket,operation=action==='get'?++selectionTicket:++listTicket,current=()=>generation===ticket&&isCurrent()&&operation===(action==='get'?selectionTicket:listTicket);pending=true;error='';onChange(state());
  const task=Promise.resolve().then(()=>request(action,input)).then(value=>{
   if(!current()||v2&&!auth.isCurrentResult(value))return null;
   if(value.schema!==schema||value.activityKey!==input.activityKey)throw Error('The playlist context changed. Refresh to continue.');
   if(action==='list'){catalogueProof=value;catalogue={...value,playlists:[...new Map([...(more?catalogue?.playlists||[]:[]),...value.playlists].filter(p=>p.published===true).map(p=>[p.id,p])).values()]};}
   else {selectedProof=value;if(value.playlist.id!==input.playlistId)throw Error('The selected playlist changed.');if(value.recordings.some(row=>!Number.isSafeInteger(row.position)||row.position<1))throw Error('The saved recording order could not be checked.');if(more&&selected?.revision!==value.revision)throw Error('The playlist changed. Reopen its saved order.');selected={...value,recordings:[...new Map([...(more?selected?.recordings||[]:[]),...value.recordings].map(row=>[row.id,row])).values()].sort((a,b)=>a.position-b.position)};}
   return value;
  }).catch(reason=>{if(current()){error=reason.message;if([401,403].includes(reason.status)){catalogue=null;selected=null;}}return null;}).finally(()=>{if(requests.get(key)===task)requests.delete(key);if(current()){pending=false;onChange(state());/* The owning pane releases its own registered roots after rendering. */}});requests.set(key,task);return task;
 }
 return {state,loadList(input,options={}){if(catalogue&&valid(catalogueProof)&&!options.more&&!options.force)return Promise.resolve(catalogue);return load('list',input,options);},open(input,options={}){if(!options.more)selected=null;return load('get',input,options);},back(){selectionTicket++;selected=null;pending=false;onChange(state());},clear(){stop();owner='';invalidate();},dispose(){stop();owner='';invalidate();}};
}

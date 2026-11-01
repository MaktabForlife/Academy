/* Independent Studio playlists. No Academy subject or recording-date inference. */
(()=>{'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),token=()=>localStorage.getItem('m4l_account_token')||'';
 let state=null;
 const dirty=()=>Boolean(state&&(state.busy||state.pending||state.drafts.size));
 function message(text,error=false){const node=state?.host.querySelector('[data-playlist-status]');if(node){node.textContent=text;node.setAttribute('role',error?'alert':'status');}}
 function canLeave(){if(dirty()){message('Save, discard or retry your playlist changes before leaving.',true);return false;}return true;}
 function reset(){if(!state)return;state.closed=true;state.host.remove();state.drafts.clear();state=null;}
 async function mount(container,{transport}){
  if(!canLeave())return false;reset();const host=document.createElement('section');host.className='mou-playlist-admin';container.append(host);
  const s={host,transport,owner:token(),drafts:new Map(),data:null,busy:false,pending:null,review:null,closed:false};state=s;
  const current=()=>state===s&&!s.closed&&s.owner===token()&&host.isConnected;
  function locked(error){s.closed=true;s.busy=false;s.pending=null;s.review=null;s.data=null;s.drafts.clear();host.replaceChildren();const notice=document.createElement('p');notice.setAttribute('role','alert');notice.textContent=error.message+' Reopen Access Management to check your current permissions.';host.append(notice);}
  async function api(command){const result=await transport(command);if(!current())throw Error('Your account or programme changed. Reopen the playlist table.');return result;}
  function controls(){for(const node of host.querySelectorAll('button,input'))node.disabled=s.busy||Boolean(s.pending&&node.dataset.playlistAction!=='retry');}
  function draw(){
   if(!current())return;host.innerHTML='<h2>MOU playlists</h2><p>Create independent playlists such as Surah Baqarah — Part 1. Open playlists receive recordings week by week and use the current paid month. When complete, enter the close date: that month unlocks the whole published playlist. Original recording dates remain history.</p><p>You decide when to close a playlist and create the next one. Correcting a saved close month preserves actual existing holders; later old-month subscribers gain no extra access.</p><p data-playlist-status role="status" aria-live="polite"></p><div class="pms-toolbar"><button type="button" data-playlist-action="add">Add playlist</button><button type="button" data-playlist-action="discard">Discard edits</button><button type="button" data-playlist-action="refresh">Refresh</button></div><div class="mou-playlist-scroll"><table><thead><tr><th>Playlist</th><th>Close date · blank means open</th><th>Recordings</th><th>Status</th><th>Changes</th></tr></thead><tbody></tbody></table></div><p data-playlist-delta aria-live="polite"></p><div data-playlist-review></div>';
   const rows=new Map((s.data?.playlists||[]).map(row=>[row.id,row]));for(const [id,row]of s.drafts)rows.set(id,row);
   host.querySelector('tbody').innerHTML=[...rows.values()].map(row=>'<tr data-playlist-id="'+esc(row.id)+'"'+(s.drafts.has(row.id)?' class="pms-surah-edited"':'')+'><td><input data-playlist-field="name" aria-label="Playlist name" maxlength="160" value="'+esc(row.name)+'"></td><td><input type="date" data-playlist-field="closeDate" aria-label="Close date for '+esc(row.name||'new playlist')+'" value="'+esc(row.closeDate||'')+'"></td><td>'+Number(row.recordings||0)+'</td><td>'+(s.drafts.has(row.id)?'Unsaved':(row.closeDate?'Closed':'Open')+' · '+(row.enabled?'Published':'Private'))+'</td><td><button type="button" data-playlist-action="save">Save</button>'+(row.revision?'<button type="button" data-playlist-action="publication">'+(row.enabled?'Withdraw':'Publish playlist')+'</button>':'<button type="button" data-playlist-action="remove">Remove row</button>')+'</td></tr>').join('')||'<tr><td colspan="5">No playlists yet. Add a name. Leave the close date blank while recordings are being added.</td></tr>';
   delta();controls();
  }
  function delta(){host.querySelector('[data-playlist-delta]').textContent=s.drafts.size?s.drafts.size+' unsaved playlist change(s)':'No unsaved playlist changes';}
  async function load(){s.busy=true;controls();try{s.data=await api({action:'mou-playlists'});draw();}catch(error){if(current()){if([401,403].includes(error.status))locked(error);else message(error.message,true);}}finally{if(current()){s.busy=false;controls();}}}
  async function commit(command){s.pending=s.pending||command;s.busy=true;controls();message('Saving…');try{await api(s.pending);s.drafts.delete(s.pending.playlistId);s.pending=null;s.review=null;await load();if(current())message('Saved.');}catch(error){if(!current())return;if([401,403].includes(error.status)){locked(error);return;}if(error.status&&error.status<500)s.pending=null;message(error.message,true);if(s.pending)host.querySelector('[data-playlist-review]').innerHTML='<button type="button" data-playlist-action="retry">Retry this save</button>';}finally{if(current()){s.busy=false;controls();}}}
  async function save(id,reviewed=false){
   const row=s.drafts.get(id);if(!row){message('No playlist changes to save.');return;}if(!row.name.trim()){message('Enter a playlist name.',true);return;}
   const old=s.data.playlists.find(r=>r.id===id),changedMonth=old?.closeMonth&&old.closeMonth!==(row.closeDate||'').slice(0,7);
   if(changedMonth&&!reviewed){
    s.busy=true;controls();try{const preview=await api({action:'mou-playlist-correction',playlistId:id});s.review={id,preview};host.querySelector('[data-playlist-review]').innerHTML='<p>This changes the qualifying month. '+preview.paidHolders+' current recording subscriber(s) and '+preview.websiteHolders+' website-month holder(s) will keep acquired access while their original paid rights remain. Later subscribers to the old month will not gain this playlist.</p><button type="button" data-playlist-action="confirm">Save reviewed correction</button>';}catch(error){message(error.message,true);}finally{if(current()){s.busy=false;controls();}}return;
   }
   const preview=reviewed?s.review?.preview:null;
   await commit({action:'mou-playlist-save',operationId:crypto.randomUUID(),playlistId:id,name:row.name.trim(),closeDate:row.closeDate||'',revision:preview?.revision??s.data.revision,playlistRevision:preview?.playlistRevision??old?.revision??0,websiteRevision:preview?.websiteRevision??old?.websiteRevision??0,reviewCorrection:reviewed});
  }
  host.oninput=event=>{
   const control=event.target;if(!control.matches('[data-playlist-field]')||s.busy||s.pending)return;const tr=control.closest('[data-playlist-id]'),id=tr.dataset.playlistId,old=s.data.playlists.find(r=>r.id===id),row={...(s.drafts.get(id)||old)};row[control.dataset.playlistField]=control.value;
   if(old&&row.name===old.name&&(row.closeDate||'')===(old.closeDate||''))s.drafts.delete(id);else s.drafts.set(id,row);s.review=null;host.querySelector('[data-playlist-review]').replaceChildren();tr.classList.toggle('pms-surah-edited',s.drafts.has(id));tr.children[3].textContent=s.drafts.has(id)?'Unsaved':(row.closeDate?'Closed':'Open')+' · '+(old?.enabled?'Published':'Private');delta();
  };
  host.onclick=async event=>{
   const button=event.target.closest('[data-playlist-action]');if(!button||s.busy||!current())return;const action=button.dataset.playlistAction,id=button.closest('[data-playlist-id]')?.dataset.playlistId;
   if(action==='retry'){if(s.pending)await commit(s.pending);return;}if(s.pending)return;
   if(action==='add'){const id=crypto.randomUUID();s.drafts.set(id,{id,name:'',closeDate:'',revision:0,websiteRevision:0,enabled:0,recordings:0});draw();host.querySelector('[data-playlist-id="'+id+'"] input').focus();return;}
   if(action==='remove'){s.drafts.delete(id);draw();return;}
   if(action==='discard'){s.drafts.clear();s.review=null;draw();return;}
   if(action==='refresh'){if(canLeave())await load();return;}
   if(action==='save'){await save(id);return;}
   if(action==='confirm'&&s.review){await save(s.review.id,true);return;}
   if(action==='publication'){
    if(!canLeave())return;const row=s.data.playlists.find(r=>r.id===id);if(!row)return;
    if(!window.confirm((row.enabled?'Withdraw this playlist? Existing acquired rights stay saved.':'Publish this playlist for its eligible subscribers? Reviewed recordings must already be published.')))return;
    await commit({action:'mou-playlist-publication',operationId:crypto.randomUUID(),playlistId:id,published:!row.enabled,revision:s.data.revision,playlistRevision:row.revision,websiteRevision:row.websiteRevision});
   }
  };
  draw();await load();return true;
 }
 window.M4L_MOU_PLAYLISTS={mount,unmount:reset,canLeave,dirty};
 window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
 window.addEventListener('m4l-academy-session-ended',reset);window.addEventListener('m4l-academy-session',reset);window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)reset();});
})();

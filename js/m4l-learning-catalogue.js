/* Shared Academy Subject and Module definitions, with separate usage. */
(()=>{'use strict';
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={data:null,tab:'subjects',search:'',subject:'',status:'',edit:null,pending:null,conflict:false,busy:false,key:'',token:''};
  const tell=(text,error=false)=>{$('lc-message').textContent=text;$('lc-message').classList.toggle('is-error',error);};
  const v2=()=>window.M4L_ACADEMY_AUTH?.selected===true;
  const nativeRowsBaseline={visibility:$('lc-rows').style.visibility||'',inert:$('lc-rows').inert===true};
  let nativeClient=null,nativeForm=null,nativeKey='',nativeOwner=null,nativeEpoch=0,nativeProof=null,nativeCheckpoint=Promise.resolve(),nativeSetup=null;
  async function nativeReady(){if(nativeSetup)return nativeSetup;nativeSetup=(async()=>{nativeClient=await window.M4L_ACADEMY_AUTH.ready;nativeClient.registerPrivateRoot($('lc-workspace'));await nativeClient.ensureFresh();nativeOwner=nativeClient.ownerKey();return nativeClient;})();return nativeSetup;}
  const nativeCurrent=epoch=>epoch===nativeEpoch&&nativeOwner===nativeClient?.ownerKey();
  const nativeDocument=()=>({edit:state.edit?{kind:state.edit.kind,id:state.edit.id,name:state.edit.name,...state.edit.kind==='module'?{subjectId:state.edit.subjectId}:{},active:state.edit.active,baseRevision:state.edit.baseRevision}:null});
  const nativeResource=()=>({type:'academy-learning-catalogue',kind:state.tab==='subjects'?'subject':'module',recordId:state.edit?.id||null});
  function nativeVersion(){const e=state.edit,row=e?(e.kind==='subject'?state.data.subjects.find(r=>r.SubjectID===e.id):state.data.modules.find(r=>r.id===e.id)):null;return row?.Revision||row?.revision||state.data?.emptyRevision||0;}
  const nativeReveal=value=>{if(nativeClient.isCurrentResult(value))nativeClient.revealResult(value,{root:$('lc-workspace')});};
  async function nativeRead(){const value=await api('learning-catalogue/get');nativeProof=value;return value;}
  async function nativeRecovery(){const c=await nativeReady(),resource=nativeResource(),key=JSON.stringify(resource);if(nativeForm&&nativeKey===key)return nativeForm;nativeForm?.dispose();nativeForm=null;nativeKey=key;const outer=$('lc-workspace');outer.style.visibility='hidden';outer.inert=true;const{createAcademyNativeForm}=await import('/js/m4l-v111-editor.mjs');const body=$('lc-rows');body.style.visibility=nativeRowsBaseline.visibility;body.inert=nativeRowsBaseline.inert;
   // The actual tbody owns the editor lease. The permanent outer workspace
   // remains separately masked until our own checked catalogue reader releases it.
   nativeForm=await createAcademyNativeForm({client:c,resource,roots:[body],host:document.body,doc:document,capture:nativeDocument,baseVersion:nativeVersion,isDirty:()=>Boolean(state.edit||state.pending),status:text=>tell(text),
    readCurrent:async()=>{await c.prepareSensitive({activeWork:false});return nativeRead();},
    applyCurrent:value=>{state.data=value;state.edit=null;state.pending=null;state.conflict=false;render();},
    applyRetained:document=>{const saved=document?.edit;if(!saved||saved.kind!==resource.kind||String(saved.id||'')!==String(resource.recordId||''))throw Error('The retained catalogue record does not match this editor.');state.tab=saved.kind==='subject'?'subjects':'modules';state.edit={...saved};const row=currentRow();state.edit.baseRevision=row?.Revision||row?.revision||(saved.kind==='module'?state.data.emptyRevision:'');state.pending=null;state.conflict=false;render();}});return nativeForm;
  }
  function nativeRoute(){const query=new URLSearchParams(location.search);if(state.tab==='modules')query.set('section','modules');else query.delete('section');if(state.edit){query.set('edit','1');if(state.edit.id)query.set('record',state.edit.id);else query.delete('record');}else{query.delete('edit');query.delete('record');}const next=location.pathname+(query.size?'?'+query:'');if(next!==location.pathname+location.search)window.history.replaceState(null,'',next);}
  function nativeRemember(){nativeRoute();if(!nativeForm)return;const epoch=nativeEpoch,document=nativeDocument();nativeCheckpoint=nativeCheckpoint.then(()=>{if(!nativeCurrent(epoch))throw new DOMException('The catalogue account changed.','AbortError');return nativeForm.checkpoint(document);}).catch(error=>{if(nativeCurrent(epoch))tell(error.message,true);});}
  async function nativeLoad(){if(state.busy)return;state.busy=true;render();const epoch=nativeEpoch;try{const c=await nativeReady();if(!nativeCurrent(epoch))return;
    if(!state.data){const{prepareInitialAdminForm}=await import('/js/m4l-native-admin-init.mjs');await prepareInitialAdminForm(c,{hasPrivateWork:()=>!!state.data||!!state.edit||!!nativeForm||!!state.pending});}
    if(!nativeCurrent(epoch))return;const value=await nativeRead();if(!nativeCurrent(epoch))return;state.data=value;state.token=token();const query=new URLSearchParams(location.search),section=query.get('section');if(!state.edit&&['subjects','modules'].includes(section))state.tab=section;render();
    if(!nativeForm&&(state.tab!=='modules'||value.modulesReady)){if(query.get('edit')==='1'&&query.get('record')){const id=query.get('record'),row=state.tab==='subjects'?value.subjects.find(r=>r.SubjectID===id):value.modules.find(r=>r.id===id);if(row)state.edit=draft(row);}const form=await nativeRecovery();await form.open(value);nativeRoute();}
    else if(state.edit&&nativeForm)await nativeForm.revalidate();if(nativeCurrent(epoch)){nativeReveal(nativeProof);tell(state.edit?'Your unfinished entry is kept.':'');}
   }catch(error){if(nativeCurrent(epoch)){if([401,403].includes(error.status)){state.data=null;state.edit=null;state.pending=null;state.conflict=false;render();}tell(error.message,true);}}finally{if(epoch===nativeEpoch){state.busy=false;render();}}}
  async function nativeBegin(row){if(state.busy||state.edit)return;const epoch=nativeEpoch,tab=state.tab,id=tab==='subjects'?row?.SubjectID:row?.id;state.busy=true;render();try{const c=await nativeReady();await c.prepareSensitive({activeWork:true});const value=await nativeRead();if(!nativeCurrent(epoch)||tab!==state.tab)return;state.data=value;const current=id?(tab==='subjects'?value.subjects.find(s=>s.SubjectID===id):value.modules.find(s=>s.id===id)):null;if(id&&!current)throw Error('This catalogue record is no longer available.');state.edit=draft(current);state.conflict=false;nativeRoute();render();const form=await nativeRecovery();await form.open(value);if(nativeCurrent(epoch)){render();nativeReveal(nativeProof);$('lc-rows').querySelector('input')?.focus();}}catch(error){if(nativeCurrent(epoch))tell(error.message,true);}finally{if(epoch===nativeEpoch){state.busy=false;render();}}}
  async function nativeSave(){if(state.busy||state.conflict||!state.edit)return;const epoch=nativeEpoch;state.busy=true;render();let attempt;try{const form=await nativeRecovery();await nativeCheckpoint;const operation=request();state.pending=operation;attempt=await form.beforeMutation({path:'/api/admin/platform/'+operation.path,body:operation.body},{sensitive:true});let value=await api(operation.path,operation.body);value=await form.completeNativeMutation(attempt,value,{operationId:operation.body.operationId});if(!nativeCurrent(epoch))return;state.edit=null;state.pending=null;state.conflict=false;nativeRoute();await form.saved();const fresh=await nativeRead();if(!nativeCurrent(epoch))return;state.data=fresh;render();nativeReveal(fresh);tell('Saved.');}
   catch(error){if(!nativeCurrent(epoch))return;if(attempt){await nativeForm.unknown(attempt);state.pending=null;if(nativeCurrent(epoch)){render();nativeReveal(nativeProof);tell('Current records were reviewed. The original change was not resent. Choose an explicit Save for another change.');}}else{state.pending=null;tell(error.message,true);}}
   finally{if(epoch===nativeEpoch){state.busy=false;render();}}}
  const token=()=>v2()?nativeClient?.ownerKey()||'':localStorage.getItem('m4l_account_token')||'';
  const remember=()=>{if(v2()){nativeRemember();return;}if(state.key)sessionStorage.setItem(state.key,JSON.stringify({edit:state.edit,pending:state.pending,tab:state.tab}));};
  async function api(path,input={}){
    if(v2()){const epoch=nativeEpoch,c=await nativeReady();if(!nativeCurrent(epoch))throw new DOMException('The catalogue account changed.','AbortError');const value=await c.request('/api/admin/platform/'+path,input,{headers:{'X-Academy-Workspace':'ADMIN'}});if(!nativeCurrent(epoch)||!c.isCurrentResult(value))throw new DOMException('The catalogue view changed.','AbortError');return value;}
    const session=token();if(!session)throw Object.assign(Error('Sign in with a Global Admin account to manage Subjects and Modules.'),{status:401});
    const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session},body:JSON.stringify(input)});
    let result;try{result=await response.json();}catch{throw Error('The response could not be read. Your entry is kept.');}
    if(session!==token())throw Object.assign(Error('Your signed-in account changed. Refresh to continue.'),{status:401});
    if(!response.ok||!result.success)throw Object.assign(Error(result.error||'The change could not be confirmed.'),result,{status:response.status});return result;
  }
  const option=(value,label,current)=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`;
  const usedIn=row=>(row?.usedIn||[]).map(a=>`<a href="${a.kind==='PROGRAM'?'/programs/manage.html?program=':'/academy/courses/manage/?course='}${encodeURIComponent(a.id)}">${esc(a.name)} <small>${a.kind==='PROGRAM'?'Program':'Course'}</small></a>`).join(' · ')||'<span class="lc-readonly">Not used yet</span>';
  function draft(row){return state.tab==='subjects'?{kind:'subject',id:row?.SubjectID||'',name:row?.SubjectName||'',baseRevision:row?.Revision||'',active:row?.Active??true}:{kind:'module',id:row?.id||'',name:row?.name||'',subjectId:row?.subjectId||state.subject||'',active:row?.active??true,baseRevision:row?.revision||state.data.emptyRevision};}
  function describe(row){if(!row)return 'Record no longer available.';return [row.name||row.SubjectName,row.subjectName||state.data?.subjects.find(s=>s.SubjectID===row.subjectId)?.SubjectName,row.active===false||row.Active===false?'Archived':'Active'].filter(Boolean).join(' · ');}
  function currentRow(){const e=state.edit;if(!e||!state.data)return null;return e.kind==='subject'?state.data.subjects.find(s=>s.SubjectID===e.id):state.data.modules.find(m=>m.id===e.id);}
  function render(){
    $('lc-workspace').hidden=!state.data;const locked=state.busy||Boolean(state.pending),e=state.edit;
    for(const id of ['lc-add','lc-refresh','lc-subjects','lc-modules'])$(id).disabled=locked;
    $('lc-retry').disabled=state.busy;$('lc-pending').hidden=!state.pending;$('lc-conflict').hidden=!state.conflict;
    $('lc-keep').disabled=locked||!currentRow();$('lc-use-saved').disabled=locked;
    if(!state.data){$('lc-rows').innerHTML='';$('lc-head').innerHTML='';$('lc-comparison').innerHTML='';return;}
    if(state.conflict)$('lc-comparison').innerHTML='<p><strong>Saved:</strong> '+esc(describe(currentRow()))+'</p><p><strong>Your entry:</strong> '+esc(describe(e))+'</p>';
    const modules=state.tab==='modules';$('lc-subjects').setAttribute('aria-pressed',String(!modules));$('lc-modules').setAttribute('aria-pressed',String(modules));
    $('lc-add').disabled=locked||modules&&!state.data.modulesReady;
    $('lc-search').placeholder=modules?'Find a module…':'Find a subject…';$('lc-add').textContent=modules?'＋ Add module':'＋ Add subject';$('lc-area').hidden=!modules;
    $('lc-area').innerHTML=option('','All Subjects',state.subject)+state.data.subjects.map(s=>option(s.SubjectID,s.SubjectName,state.subject)).join('');
    $('lc-help').textContent=modules?(state.data.modulesReady?'Academy Modules belong to Subjects. Used in shows where Programs and Courses use each Module.':'The shared Module catalogue needs its database upgrade.'):'Academy Subjects are shared across Programs and Courses. Used in shows their current usage.';
    $('lc-head').innerHTML=modules?'<tr><th>Module</th><th>Subject</th><th>Status</th><th>Used in</th><th>Changes</th></tr>':'<tr><th>Subject</th><th>Status</th><th>Used in</th><th>Changes</th></tr>';
    $('lc-head').parentElement?.classList.toggle('lc-modules-grid',modules);
    const rows=(modules?state.data.modules:state.data.subjects).filter(r=>{const active=modules?r.active:r.Active;return (!state.status||active===(state.status==='active'))&&(!modules||!state.subject||r.subjectId===state.subject)&&[modules?r.name:r.SubjectName,r.subjectName,...(r.usedIn||[]).map(a=>a.name)].some(v=>String(v||'').toLowerCase().includes(state.search.toLowerCase()));});
    $('lc-count').textContent=rows.length+' '+(modules?'module':'subject')+(rows.length===1?'':'s');
    const editing=e&&(e.kind==='module')===modules;
    let html='';
    if(editing){
      const name=`<input data-field="name" aria-label="${modules?'Module':'Subject'} name" maxlength="160" value="${esc(e.name)}" ${locked?'disabled':''}>`;
      if(!modules)html='<tr class="lc-edit"><td>'+name+'</td><td><select data-field="active" aria-label="Subject status" '+(locked?'disabled':'')+'>'+option('true','Active',String(e.active))+option('false','Archived',String(e.active))+'</select></td><td class="lc-usage">'+usedIn(currentRow())+'</td>';
      else html='<tr class="lc-edit"><td>'+name+'</td><td><select data-field="subjectId" aria-label="Module subject" '+(locked?'disabled':'')+'>'+option('','Choose a Subject',e.subjectId)+state.data.subjects.filter(s=>s.Active||s.SubjectID===e.subjectId).map(s=>option(s.SubjectID,s.SubjectName,e.subjectId)).join('')+'</select></td><td><select data-field="active" aria-label="Module status" '+(locked?'disabled':'')+'>'+option('true','Active',String(e.active))+option('false','Archived',String(e.active))+'</select></td><td class="lc-usage">'+usedIn(currentRow())+'</td>';
      html+='<td><button data-save '+(locked||state.conflict?'disabled':'')+'>Save</button><button data-cancel class="pb-secondary" '+(locked?'disabled':'')+'>Discard</button></td></tr>';
    }
    for(const row of rows){if(editing&&(modules?row.id===e.id:row.SubjectID===e.id))continue;
      const index=(modules?state.data.modules:state.data.subjects).indexOf(row);
      html+=modules?'<tr><td>'+esc(row.name)+'</td><td>'+esc(row.subjectName||'Choose a Subject')+'</td><td>'+(row.active?'Active':'Archived')+'</td>':'<tr><td>'+esc(row.SubjectName)+'</td><td>'+(row.Active?'Active':'Archived')+'</td>';
      html+='<td class="lc-usage">'+usedIn(row)+'</td><td><button data-edit="'+index+'" class="pb-secondary" '+(locked||state.conflict?'disabled':'')+'>Edit</button></td></tr>';
    }
    $('lc-rows').innerHTML=html||'<tr><td class="lc-empty" colspan="'+(modules?5:4)+'">No matching records.</td></tr>';
  }
  async function load(restore=false){
    if(v2())return nativeLoad();
    if(state.busy)return;state.busy=true;render();
    try{const result=await api('learning-catalogue/get');state.data=result;state.token=token();
      const key='m4l-learning-catalogue-v2:'+location.host+':'+result.viewerAccountId;
      if(restore&&state.key!==key){state.key=key;try{const kept=JSON.parse(sessionStorage.getItem(key)||'null');if(kept){state.edit=kept.edit;state.pending=kept.pending;state.tab=kept.tab==='modules'?'modules':'subjects';}}catch{sessionStorage.removeItem(key);}}
      const requestedSection=new URLSearchParams(location.search||'').get('section');
      if(!state.edit&&!state.pending&&['subjects','modules'].includes(requestedSection))state.tab=requestedSection;
      state.key=key;tell(state.pending?'Your unconfirmed save is kept. Retry the same change.':state.edit?'Your unfinished entry is kept.':'');
    }catch(error){if([401,403].includes(error.status)){state.data=null;state.edit=null;state.pending=null;state.conflict=false;state.key='';}tell(error.message,true);}
    finally{state.busy=false;render();}
  }
  function begin(row){if(v2()){void nativeBegin(row);return;}if(state.edit){tell('Save or discard your current entry first.',true);return;}state.edit=draft(row);state.conflict=false;remember();render();$('lc-rows').querySelector?.('input')?.focus();}
  function request(){const e=state.edit,operationId=crypto.randomUUID();
    if(e.kind==='subject')return {path:'academy-subjects/save',body:{mode:e.id?'rename':'create',subjectId:e.id,subjectName:e.name,active:e.active,baseRevision:e.baseRevision,operationId}};
    return {path:'learning-catalogue/module/save',body:{id:e.id,name:e.name,subjectId:e.subjectId,active:e.active,baseRevision:e.baseRevision,operationId}};
  }
  async function save(){
    if(v2())return nativeSave();
    if(state.busy||state.conflict||!state.edit)return;
    try{state.pending=state.pending||request();}catch(error){tell(error.message,true);return;}remember();state.busy=true;render();let confirmed=false;
    try{await api(state.pending.path,state.pending.body);state.edit=null;state.pending=null;state.conflict=false;remember();confirmed=true;tell('Saved.');}
    catch(error){if(error.status&&error.status<500){state.pending=null;if(['ROW_CHANGED','WORKFLOW_CHANGED'].includes(error.code))state.conflict=true;remember();}if([401,403].includes(error.status)){state.data=null;state.key='';}tell(error.message,true);}
    finally{state.busy=false;render();}
    if(confirmed||state.conflict){await load();if(confirmed&&!$('lc-message').classList.contains('is-error'))tell('Saved.');else if(state.conflict)tell('Records changed elsewhere. Compare the saved record with your entry before continuing.',true);}
  }
  for(const tab of ['subjects','modules'])$('lc-'+tab).onclick=()=>{if(state.edit||state.pending){tell('Save or discard your current entry first.',true);return;}state.tab=tab;state.search='';$('lc-search').value='';const query=new URLSearchParams(location.search||'');if(tab==='modules')query.set('section','modules');else query.delete('section');if(v2()){query.delete('edit');query.delete('record');}window.history?.replaceState?.(null,'',location.pathname+(query.size?'?'+query:''));render();};
  $('lc-add').onclick=()=>begin();$('lc-refresh').onclick=()=>void load();$('lc-retry').onclick=()=>void save();
  $('lc-search').oninput=e=>{state.search=e.target.value;render();};$('lc-area').onchange=e=>{state.subject=e.target.value;render();};$('lc-status').onchange=e=>{state.status=e.target.value;render();};
  $('lc-rows').onclick=e=>{const d=e.target.closest('button')?.dataset;if(!d||state.busy||state.pending)return;if(d.edit!==undefined)begin((state.tab==='modules'?state.data.modules:state.data.subjects)[Number(d.edit)]);if(d.save!==undefined)void save();if(d.cancel!==undefined){state.edit=null;state.conflict=false;remember();render();tell('Entry discarded.');}};
  const change=e=>{const field=e.target.dataset.field;if(!field||!state.edit||state.busy||state.pending)return;state.edit[field]=field==='active'?e.target.value==='true':e.target.value;remember();if(['subjectId','active'].includes(field))render();};
  $('lc-rows').oninput=change;$('lc-rows').onchange=change;
  $('lc-use-saved').onclick=()=>{state.edit=null;state.conflict=false;remember();render();tell('Saved version kept.');};
  $('lc-keep').onclick=()=>{const current=currentRow();if(!current)return;state.edit.baseRevision=current.Revision||current.revision||state.data.emptyRevision;state.conflict=false;remember();render();tell('Reviewed. Select Save to apply your changes.');};
  window.addEventListener('beforeunload',e=>{if(state.edit||state.pending){e.preventDefault();e.returnValue='';}});
  window.addEventListener('storage',e=>{if(v2())return;if(e.key==='m4l_account_token'||e.key===null){state.data=null;state.edit=null;state.pending=null;state.conflict=false;state.key='';render();void load(true);}});
  if(v2()){
   window.addEventListener('academy-v2-context',()=>{if(nativeOwner!==null&&nativeOwner!==nativeClient?.ownerKey()){nativeEpoch++;nativeForm?.dispose();nativeForm=null;nativeKey='';nativeProof=null;nativeOwner=nativeClient?.ownerKey()||null;state.data=null;state.edit=null;state.pending=null;state.conflict=false;state.busy=false;render();tell('The Academy account changed. Read the catalogue again.');}});
   window.addEventListener('academy-v2-revalidate',()=>{if(state.busy)return;void (async()=>{try{if(nativeForm){const value=await nativeForm.revalidate();nativeReveal(value);}else await nativeLoad();}catch(error){tell(error.message,true);}})();});
  }
  void load(true);
})();

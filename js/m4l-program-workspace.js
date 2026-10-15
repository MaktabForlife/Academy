(() => {'use strict';
 window.M4L_PROGRAM_WORKSPACE={mount({state,$,esc,api,work,refresh}){
  const retries=new Map();let newClasses=[],classDrafts=new Map(),cardDraft=null,cardBase=null,categoryChoice="",showInactive=false;
  const cardDirty=()=>cardDraft&&JSON.stringify(cardDraft)!==JSON.stringify(cardBase.publicCard||{});
  const classDirty=c=>newClasses.includes(c)||JSON.stringify(c)!==JSON.stringify(state.data.setup.rows.classes.find(saved=>saved.ClassID===c.ClassID));
  function cardPreview(){const card=cardDraft||state.data.program.publicCard||{};$('pw-card-preview').innerHTML=card.title?`<strong>${esc(card.time)}</strong><div><b>${esc(card.title)}</b><p>${esc(card.description).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')}</p></div>`:'';$('pw-save-card').disabled=state.busy||!cardDirty();$('pw-discard-card').disabled=state.busy||!cardDirty();}
  function rowControls(tr,row){const dirty=classDirty(row);tr.classList.toggle('is-editing',dirty);tr.querySelectorAll('[data-pw-save],[data-pw-discard]').forEach(button=>button.disabled=state.busy||!dirty);tr.querySelector('[data-pw-state]').textContent=dirty?'Unsaved':'Saved';}
  const post=async(path,body)=>{
   const session=localStorage.getItem('m4l_account_token');
   const key=JSON.stringify([path,body]);if(!retries.has(key))retries.set(key,crypto.randomUUID());
   const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session},body:JSON.stringify({...body,operationId:retries.get(key)})});
   const result=await response.json();if(!response.ok||!result.success)throw Error(result.error||'Save failed. Your entry is kept.');retries.delete(key);void window.M4L_REFRESH_AFTER_SAVE?.(result,session);return result;
  };
  const note=(text,error=false)=>{$('pw-message').textContent=text;$('pw-message').classList.toggle('is-error',error);};
  const teachers=selected=>'<option value="">No class teacher</option>'+state.data.catalog.teachers.map(t=>`<option value="${esc(t.id)}" ${selected===t.id?'selected':''}>${esc(t.name)}</option>`).join('');
  function controls(){
   if(!state.data?.workspaceReady)return;
   const d=state.data,rows=[...d.setup.rows.classes.filter(c=>c.Active).map(c=>classDrafts.get(c.ClassID)||c),...newClasses];
   $('pw-classes').querySelectorAll('[data-pw-class]').forEach(tr=>rowControls(tr,rows.find(c=>c.ClassID===tr.dataset.pwClass)));
   for(const el of $('pw-setup').querySelectorAll('input,select,textarea,button'))if(!el.matches('[data-pw-save],[data-pw-discard],#pw-save-card,#pw-discard-card'))el.disabled=state.busy||d.managementEditable===false;
   cardPreview();
  }
  function render(){
   if(!$('pw-setup'))return;const d=state.data;if(!d?.workspaceReady)return;window.M4L_PROGRAM_MANAGEMENT_NAV?.update(d.program);
   document.body.classList.add('pw-current');$('pw-setup').hidden=false;
   $('pw-teachers-link').hidden=!d.globalProfilesAvailable;
   const setup=d.setup,rows=[...setup.rows.classes.filter(c=>c.Active).map(c=>classDrafts.get(c.ClassID)||c),...newClasses];$('pw-class-count').textContent=`· ${rows.length}`;
   $('pw-classes').innerHTML=rows.map(c=>`<tr data-pw-class="${esc(c.ClassID)}"><td><input data-pw-field="Name" value="${esc(c.Name)}" maxlength="160" aria-label="Class name"></td><td><select data-pw-field="TeacherAccountID" aria-label="Class teacher">${teachers(c.TeacherAccountID)}</select></td><td><input data-pw-field="ZoomLink" value="${esc(c.ZoomLink)}" type="url" maxlength="2048" placeholder="Optional" aria-label="Class Zoom link"></td><td><div class="pw-row-actions"><button type="button" data-pw-save="${esc(c.ClassID)}">Save</button><button type="button" class="pb-secondary" data-pw-discard="${esc(c.ClassID)}">Discard</button><small data-pw-state></small></div></td></tr>`).join('');
   $('pw-classes').querySelectorAll('[data-pw-class]').forEach(tr=>rowControls(tr,rows.find(c=>c.ClassID===tr.dataset.pwClass)));
   $('pw-card-editor').hidden=!d.program.publicCardEditable;
   if(!cardDraft||!cardDirty()){cardBase=structuredClone(d.program);cardDraft=structuredClone(d.program.publicCard||{});}
   for(const key of ['time','title','description'])$('pw-card-'+key).value=cardDraft[key]||'';
   cardPreview();
   const alphabetical=(a,b)=>String(a.name||a.SubjectName||'').localeCompare(String(b.name||b.SubjectName||''),undefined,{sensitivity:'base',numeric:true});
   const subjects=setup.sharedSubjects.filter(s=>s.Active&&!s.Legacy).slice().sort(alphabetical),mods=setup.sharedModules||[];
   $('pw-category').innerHTML='<option value="">Choose from Academy list…</option>'+subjects.map(s=>`<optgroup label="${esc(s.SubjectName)}"><option value="S:${esc(s.SubjectID)}">${esc(s.SubjectName)} · Subject</option>${mods.filter(m=>m.subjectId===s.SubjectID&&m.active).slice().sort(alphabetical).map(m=>`<option value="M:${esc(m.id)}">${esc(m.name)}</option>`).join('')}</optgroup>`).join('');$('pw-category').value=categoryChoice;
   const selectedSubjects=d.catalog.subjects.filter(s=>showInactive||s.active).slice().sort(alphabetical),selectedModules=d.catalog.modules;
   const actions=(kind,row)=>row.lessonUsed?'<small>Used in Program lessons · protected</small>':`<button type="button" class="pb-secondary" data-pw-active="${row.active?'false':'true'}" data-pw-kind="${kind}" data-pw-id="${esc(row.id)}">${row.active?'Make inactive':'Make active'}</button> <button type="button" class="pb-secondary" data-pw-remove="${esc(row.id)}" data-pw-kind="${kind}">Remove</button>`;
   $('pw-categories').innerHTML=selectedSubjects.map(s=>`<tr class="${s.active?'':'is-inactive'}"><td>Subject${s.active?'':' · Inactive'}</td><td><strong>${esc(s.name)}</strong></td><td>${actions('subjects',s)}</td></tr>`+selectedModules.filter(m=>m.programSubjectId===s.id&&(showInactive||m.active)).slice().sort(alphabetical).map(m=>`<tr class="${m.active?'':'is-inactive'}"><td>Module${m.active?'':' · Inactive'}</td><td class="pw-module-name">${esc(m.name)}</td><td>${actions('modules',m)}</td></tr>`).join('')).join('')||'<tr><td colspan="3">No active Subjects or Modules. Add from the Academy list below.</td></tr>';
   if($('pw-show-inactive'))$('pw-show-inactive').checked=showInactive;
   $('pw-catalogue').hidden=!setup.sharedSubjectsEditable;
   for(const control of $('pw-setup').querySelectorAll('input,select,textarea,button'))if(!control.matches('[data-pw-save],[data-pw-discard],#pw-save-card,#pw-discard-card'))control.disabled=state.busy||d.managementEditable===false;

  }
  async function ensureClass(){
   const d=state.data;if(!d.workspaceReady||d.managementEditable===false||d.setup.rows.classes.length)return d;
   const setup=d.setup,year=new Intl.DateTimeFormat('en',{timeZone:d.program.timezone,year:'numeric'}).format(new Date()),id='CLS-'+d.program.id.replace(/^PRG-/,'');
   try{await post('/api/admin/platform/program-timetable/manage-save',{id:d.program.id,kind:'classes',record:{ClassID:id,Name:d.program.name.slice(0,140)+' Class '+year,AcademicYear:year,TeacherAccountID:'',ZoomLink:'',Active:true},creating:true,baseRowRevision:setup.emptyRowRevision});}
   catch(error){const latest=await api('get');if(!latest.setup.rows.classes.some(c=>c.Active))throw error;return latest;}
   return api('get');
  }
  async function update(){const latest=await api('get');state.data={...state.data,...latest};refresh();render();}
  $('pw-add-class').onclick=()=>{const year=new Date().getFullYear();newClasses.push({ClassID:'CLS-'+crypto.randomUUID(),Name:state.data.program.name+' Class '+year,AcademicYear:String(year),TeacherAccountID:'',ZoomLink:'',Active:true});render();};
  // Keep class fields in their source object so board updates never discard an entry.
  $('pw-classes').oninput=$('pw-classes').onchange=e=>{const tr=e.target.closest('[data-pw-class]'),field=e.target.dataset.pwField;if(!tr||!field)return;const saved=state.data.setup.rows.classes.find(c=>c.ClassID===tr.dataset.pwClass),row=classDrafts.get(tr.dataset.pwClass)||newClasses.find(c=>c.ClassID===tr.dataset.pwClass)||(saved?structuredClone(saved):null);if(row){row[field]=e.target.value;if(saved)classDrafts.set(row.ClassID,row);rowControls(tr,row);}};
  $('pw-classes').onclick=e=>{const discard=e.target.closest('[data-pw-discard]')?.dataset.pwDiscard;if(discard){newClasses=newClasses.filter(c=>c.ClassID!==discard);classDrafts.delete(discard);render();return;}const id=e.target.closest('[data-pw-save]')?.dataset.pwSave;if(!id)return;void work(async()=>{try{const setup=state.data.setup,row=classDrafts.get(id)||[...setup.rows.classes,...newClasses].find(c=>c.ClassID===id);await post('/api/admin/platform/program-timetable/manage-save',{id:state.data.program.id,kind:'classes',record:row,creating:newClasses.includes(row),baseRowRevision:setup.rowRevisions.classes[id]||setup.emptyRowRevision});newClasses=newClasses.filter(c=>c.ClassID!==id);classDrafts.delete(id);await update();note('Class saved.');}catch(e){note(e.message,true);}});};
  $('pw-category').onchange=e=>{categoryChoice=e.target.value;};
  $('pw-classes').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.target.closest('[data-pw-class]')?.querySelector('[data-pw-save]')?.click();}};
  $('pw-add-category').onclick=()=>work(async()=>{try{
   const key=$('pw-category').value,setup=state.data.setup,mod=key.startsWith('M:')?setup.sharedModules.find(m=>m.id===key.slice(2)):null,subjectId=mod?.subjectId||key.slice(2);
   if(!key)throw Error('Choose an Academy Subject or Module.');
   let subject=setup.rows.subjects.find(s=>s.SubjectID===subjectId&&s.Active);
   if(!subject){const result=await post('/api/admin/platform/program-timetable/manage-save',{id:state.data.program.id,kind:'subjects',record:{ProgramSubjectID:setup.rows.subjects.find(s=>s.SubjectID===subjectId)?.ProgramSubjectID||stableId('S:'+subjectId,'PS'),SubjectID:subjectId,Active:true},creating:!setup.rows.subjects.some(s=>s.SubjectID===subjectId),baseRowRevision:setup.rowRevisions.subjects[setup.rows.subjects.find(s=>s.SubjectID===subjectId)?.ProgramSubjectID]||setup.emptyRowRevision});subject=result.record;}
   const previous=mod&&setup.rows.modules.find(m=>m.ProgramSubjectID===subject.ProgramSubjectID&&m.Name===mod.name);
   if(mod&&!previous?.Active)await post('/api/admin/platform/program-timetable/manage-save',{id:state.data.program.id,kind:'modules',record:previous?{...previous,Active:true}:{ProgramModuleID:stableId('M:'+mod.id,'MOD'),ProgramSubjectID:subject.ProgramSubjectID,LevelID:'',Name:mod.name,SortOrder:'0',Active:true},creating:!previous,baseRowRevision:previous?setup.rowRevisions.modules[previous.ProgramModuleID]:setup.emptyRowRevision});
   categoryChoice='';await update();note('Ready to select in sessions.');
  }catch(e){note(e.message,true);}});
  if($('pw-show-inactive'))$('pw-show-inactive').onchange=e=>{showInactive=e.target.checked;render();};
  $('pw-categories').onclick=e=>{const button=e.target.closest('[data-pw-remove],[data-pw-active]');if(!button||state.busy||state.data.managementEditable===false)return;
   if(newClasses.length||[...classDrafts.values()].some(classDirty)||cardDirty()){note('Save or discard the class and public card changes first.',true);return;}
   const kind=button.dataset.pwKind,id=button.dataset.pwRemove||button.dataset.pwId,setup=state.data.setup,key=kind==='subjects'?'ProgramSubjectID':'ProgramModuleID',row=setup.rows[kind].find(r=>r[key]===id);if(!row)return;
   void work(async()=>{try{if(button.dataset.pwRemove)await post('/api/admin/platform/program-timetable/manage-remove',{id:state.data.program.id,kind,recordId:id,baseRowRevision:setup.rowRevisions[kind][id]});else await post('/api/admin/platform/program-timetable/manage-save',{id:state.data.program.id,kind,record:{...row,Active:button.dataset.pwActive==='true'},creating:false,baseRowRevision:setup.rowRevisions[kind][id]});await update();note(button.dataset.pwRemove?'Removed from this Program. Its Academy record remains active.':'Program availability updated. The Academy record is unchanged.');}catch(error){note(error.message,true);}});
  };
  const ids=new Map();function stableId(key,prefix){if(!ids.has(key))ids.set(key,prefix+'-'+crypto.randomUUID());return ids.get(key);}
  for(const key of ['time','title','description'])$('pw-card-'+key).oninput=e=>{cardDraft={...cardDraft,[key]:e.target.value};cardPreview();};
  $('pw-discard-card').onclick=()=>{cardDraft=null;render();};
  $('pw-save-card').onclick=()=>work(async()=>{try{
   const program=cardBase,result=await post('/api/admin/platform/programs/save',{id:program.id,name:program.name,durationYears:program.durationYears,timezone:program.timezone,status:program.status,revision:program.revision,publicCard:cardDraft});
   state.data.program=result.program;cardDraft=null;render();note('Public timetable card saved.');
  }catch(e){note(e.message,true);}});
  window.addEventListener('beforeunload',e=>{if(newClasses.length||[...classDrafts.values()].some(classDirty)||cardDirty()){e.preventDefault();e.returnValue='';}});
  return {render,controls,ensureClass,hasEdits:()=>Boolean(newClasses.length||[...classDrafts.values()].some(classDirty)||cardDirty())};
 }};
})();

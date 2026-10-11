(() => {'use strict';
 window.M4L_PROGRAM_WORKSPACE={mount({state,$,esc,api,work,changed,refresh}){
  const retries=new Map();let newClasses=[],classDrafts=new Map(),nameDraft=null,loadedName='',cardDraft=null,loadedCard='';
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const post=async(path,body)=>{
   const key=JSON.stringify([path,body]);if(!retries.has(key))retries.set(key,crypto.randomUUID());
   const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('m4l_account_token')},body:JSON.stringify({...body,operationId:retries.get(key)})});
   const result=await response.json();if(!response.ok||!result.success)throw Error(result.error||'Save failed. Your entry is kept.');retries.delete(key);return result;
  };
  const note=(text,error=false)=>{$('pw-message').textContent=text;$('pw-message').classList.toggle('is-error',error);};
  const teachers=selected=>'<option value="">No class teacher</option>'+state.data.catalog.teachers.map(t=>`<option value="${esc(t.id)}" ${selected===t.id?'selected':''}>${esc(t.name)}</option>`).join('');
  function render(){
   if(!$('pw-setup'))return;const d=state.data;if(!d?.workspaceReady)return;
   document.body.classList.add('pw-current');$('pw-setup').hidden=false;
   if(loadedName!==d.program.name){loadedName=d.program.name;nameDraft=null;}$('pw-name').value=nameDraft??d.program.name;
   if(loadedCard!==JSON.stringify(d.program.publicCard||{})){loadedCard=JSON.stringify(d.program.publicCard||{});cardDraft=null;}
   for(const key of ['time','title','description'])$('pw-card-'+key).value=(cardDraft||d.program.publicCard||{})[key]||'';cardPreview();
   $('pw-program-zoom').value=state.draft.programZoomLink||'';
   const setup=d.setup,rows=[...setup.rows.classes.filter(c=>c.Active).map(c=>classDrafts.get(c.ClassID)||c),...newClasses];$('pw-class-count').textContent=`· ${rows.length}`;
   $('pw-classes').innerHTML=rows.map(c=>`<tr data-pw-class="${esc(c.ClassID)}"><td><input data-pw-field="Name" value="${esc(c.Name)}" maxlength="160" aria-label="Class name"></td><td><input data-pw-field="AcademicYear" value="${esc(c.AcademicYear)}" maxlength="40" aria-label="Class year"></td><td><select data-pw-field="TeacherAccountID" aria-label="Class teacher">${teachers(c.TeacherAccountID)}</select></td><td><input data-pw-field="ZoomLink" value="${esc(c.ZoomLink)}" type="url" maxlength="2048" aria-label="Class Zoom link"></td><td><button type="button" data-pw-save="${esc(c.ClassID)}">Save</button></td></tr>`).join('');
   const subjects=setup.sharedSubjects.filter(s=>s.Active&&!s.Legacy),mods=setup.sharedModules||[];
   $('pw-category').innerHTML='<option value="">Choose from Academy list…</option>'+subjects.map(s=>`<optgroup label="${esc(s.SubjectName)}"><option value="S:${esc(s.SubjectID)}">${esc(s.SubjectName)} · Subject</option>${mods.filter(m=>m.subjectId===s.SubjectID&&m.active).map(m=>`<option value="M:${esc(m.id)}">${esc(m.name)}</option>`).join('')}</optgroup>`).join('');
   $('pw-categories').textContent=d.catalog.subjects.filter(s=>s.active).map(s=>s.name).concat(d.catalog.modules.filter(m=>m.active).map(m=>m.name)).join(' · ')||'Choose a Subject or Module for your sessions.';
   $('pw-catalogue').hidden=!setup.sharedSubjectsEditable;
   $('pw-availability').textContent=d.catalog.teachers.map(t=>{const ranges=d.availability.find(a=>a.teacherId===t.id)?.ranges||[];return t.name+': '+(ranges.length?ranges.map(r=>`${days[r.weekday]} ${r.startTime}–${r.endTime}`).join(', '):'Available · no restrictions');}).join(' | ');
   $('pw-program-zoom').disabled=state.busy||!d.timetableEditable;
  }
  async function update(){const latest=await api('get');state.data={...state.data,...latest};refresh();render();}
  function cardPreview(){const c=cardDraft||state.data?.program.publicCard||{};$('pw-card-preview').innerHTML=c.title?`<strong>${esc(c.time||'')}</strong><div><b>${esc(c.title)}</b><p>${esc(c.description||'').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')}</p></div>`:'';}
  for(const key of ['time','title','description'])$('pw-card-'+key).oninput=()=>{cardDraft=Object.fromEntries(['time','title','description'].map(k=>[k,$('pw-card-'+k).value]));cardPreview();};
  $('pw-name').oninput=e=>{nameDraft=e.target.value;};
  $('pw-save-name').onclick=()=>work(async()=>{try{const p=state.data.program;await post('/api/admin/platform/programs/save',{id:p.id,revision:p.revision,name:$('pw-name').value,durationYears:p.durationYears,timezone:p.timezone,status:p.status,publicCard:Object.fromEntries(['time','title','description'].map(k=>[k,$('pw-card-'+k).value]))});nameDraft=null;cardDraft=null;await update();note('Program and public card saved.');}catch(e){note(e.message,true);}});
  $('pw-program-zoom').onchange=e=>{state.draft.programZoomLink=e.target.value.trim();changed();};
  $('pw-add-class').onclick=()=>{const year=new Date().getFullYear();newClasses.push({ClassID:'CLS-'+crypto.randomUUID(),Name:state.data.program.name+' Class '+year,AcademicYear:String(year),TeacherAccountID:'',ZoomLink:'',Active:true});render();};
  // Keep class fields in their source object so board updates never discard an entry.
  $('pw-classes').oninput=$('pw-classes').onchange=e=>{const tr=e.target.closest('[data-pw-class]'),field=e.target.dataset.pwField;if(!tr||!field)return;const saved=state.data.setup.rows.classes.find(c=>c.ClassID===tr.dataset.pwClass),row=classDrafts.get(tr.dataset.pwClass)||newClasses.find(c=>c.ClassID===tr.dataset.pwClass)||(saved?structuredClone(saved):null);if(row){row[field]=e.target.value;if(saved)classDrafts.set(row.ClassID,row);}};
  $('pw-classes').onclick=e=>{const id=e.target.closest('[data-pw-save]')?.dataset.pwSave;if(!id)return;void work(async()=>{try{const setup=state.data.setup,row=classDrafts.get(id)||[...setup.rows.classes,...newClasses].find(c=>c.ClassID===id);await post('/api/admin/platform/program-timetable/manage-save',{id:state.data.program.id,kind:'classes',record:row,creating:newClasses.includes(row),baseRowRevision:setup.rowRevisions.classes[id]||setup.emptyRowRevision});newClasses=newClasses.filter(c=>c.ClassID!==id);classDrafts.delete(id);await update();note('Class saved.');}catch(e){note(e.message,true);}});};
  $('pw-add-category').onclick=()=>work(async()=>{try{
   const key=$('pw-category').value,setup=state.data.setup,mod=key.startsWith('M:')?setup.sharedModules.find(m=>m.id===key.slice(2)):null,subjectId=mod?.subjectId||key.slice(2);
   if(!key)throw Error('Choose an Academy Subject or Module.');
   let subject=setup.rows.subjects.find(s=>s.SubjectID===subjectId&&s.Active);
   if(!subject){const result=await post('/api/admin/platform/program-timetable/manage-save',{id:state.data.program.id,kind:'subjects',record:{ProgramSubjectID:setup.rows.subjects.find(s=>s.SubjectID===subjectId)?.ProgramSubjectID||stableId('S:'+subjectId,'PS'),SubjectID:subjectId,Active:true},creating:!setup.rows.subjects.some(s=>s.SubjectID===subjectId),baseRowRevision:setup.rowRevisions.subjects[setup.rows.subjects.find(s=>s.SubjectID===subjectId)?.ProgramSubjectID]||setup.emptyRowRevision});subject=result.record;}
   if(mod&&!setup.rows.modules.some(m=>m.ProgramSubjectID===subject.ProgramSubjectID&&m.Name===mod.name&&m.Active))await post('/api/admin/platform/program-timetable/manage-save',{id:state.data.program.id,kind:'modules',record:{ProgramModuleID:stableId('M:'+mod.id,'MOD'),ProgramSubjectID:subject.ProgramSubjectID,LevelID:'',Name:mod.name,SortOrder:'0',Active:true},creating:true,baseRowRevision:setup.emptyRowRevision});
   await update();note('Ready to select in sessions.');
  }catch(e){note(e.message,true);}});
  const ids=new Map();function stableId(key,prefix){if(!ids.has(key))ids.set(key,prefix+'-'+crypto.randomUUID());return ids.get(key);}
  async function notices(){try{const r=await post('/api/academy/teacher-availability/get',{});$('pw-notices').innerHTML=r.notices.map(n=>`<p class="pw-notice">${esc(n.teacher)} changed teaching availability · ${esc(new Date(n.changedAt).toLocaleString())}</p>`).join('')||'<p>No availability changes.</p>';}catch(e){$('pw-notices').textContent=e.message;}}
  window.addEventListener('beforeunload',e=>{if(cardDraft!==null||newClasses.length||classDrafts.size||nameDraft!==null&&nameDraft!==state.data?.program.name){e.preventDefault();e.returnValue='';}});
  return {render,notices};
 }};
})();
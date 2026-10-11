(() => {'use strict';
 window.M4L_PROGRAM_WORKSPACE={mount({state,$,esc,api,work,refresh}){
  const retries=new Map();let newClasses=[],classDrafts=new Map();
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const post=async(path,body)=>{
   const key=JSON.stringify([path,body]);if(!retries.has(key))retries.set(key,crypto.randomUUID());
   const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('m4l_account_token')},body:JSON.stringify({...body,operationId:retries.get(key)})});
   const result=await response.json();if(!response.ok||!result.success)throw Error(result.error||'Save failed. Your entry is kept.');retries.delete(key);return result;
  };
  const note=(text,error=false)=>{$('pw-message').textContent=text;$('pw-message').classList.toggle('is-error',error);};
  const teachers=selected=>'<option value="">No class teacher</option>'+state.data.catalog.teachers.map(t=>`<option value="${esc(t.id)}" ${selected===t.id?'selected':''}>${esc(t.name)}</option>`).join('');
  function render(){
   if(!$('pw-setup'))return;const d=state.data;if(!d?.workspaceReady)return;window.M4L_PROGRAM_MANAGEMENT_NAV?.update(d.program);
   document.body.classList.add('pw-current');$('pw-setup').hidden=false;
   $('pw-teachers-link').hidden=!d.globalProfilesAvailable;
   const setup=d.setup,rows=[...setup.rows.classes.filter(c=>c.Active).map(c=>classDrafts.get(c.ClassID)||c),...newClasses];$('pw-class-count').textContent=`· ${rows.length}`;
   $('pw-classes').innerHTML=rows.map(c=>`<tr data-pw-class="${esc(c.ClassID)}"><td><input data-pw-field="Name" value="${esc(c.Name)}" maxlength="160" aria-label="Class name"></td><td><input data-pw-field="AcademicYear" value="${esc(c.AcademicYear)}" maxlength="40" aria-label="Class year"></td><td><select data-pw-field="TeacherAccountID" aria-label="Class teacher">${teachers(c.TeacherAccountID)}</select></td><td><input data-pw-field="ZoomLink" value="${esc(c.ZoomLink)}" type="url" maxlength="2048" aria-label="Class Zoom link"></td><td><button type="button" data-pw-save="${esc(c.ClassID)}">Save</button></td></tr>`).join('');
   const subjects=setup.sharedSubjects.filter(s=>s.Active&&!s.Legacy),mods=setup.sharedModules||[];
   $('pw-category').innerHTML='<option value="">Choose from Academy list…</option>'+subjects.map(s=>`<optgroup label="${esc(s.SubjectName)}"><option value="S:${esc(s.SubjectID)}">${esc(s.SubjectName)} · Subject</option>${mods.filter(m=>m.subjectId===s.SubjectID&&m.active).map(m=>`<option value="M:${esc(m.id)}">${esc(m.name)}</option>`).join('')}</optgroup>`).join('');
   const selectedSubjects=d.catalog.subjects.filter(s=>s.active),selectedModules=d.catalog.modules.filter(m=>m.active);
   $('pw-categories').innerHTML=selectedSubjects.map(s=>`<li><span>${esc(s.name)}</span><small>Subject</small></li>`).concat(selectedModules.map(m=>`<li><span>${esc(m.name)}</span><small>Module${selectedSubjects.find(s=>s.id===m.programSubjectId)?' · '+esc(selectedSubjects.find(s=>s.id===m.programSubjectId).name):''}</small></li>`)).join('')||'<li class="pw-categories-empty">No Subjects or Modules added yet.</li>';
   $('pw-catalogue').hidden=!setup.sharedSubjectsEditable;
   $('pw-availability').innerHTML=d.catalog.teachers.map(t=>{const ranges=d.availability.find(a=>a.teacherId===t.id)?.ranges||[];return `<tr><th scope="row">${esc(t.name)}</th><td>${ranges.length?days.map((day,index)=>{const hours=ranges.filter(r=>r.weekday===index);return hours.length?`<div><strong>${day}</strong> ${hours.map(r=>`${esc(r.startTime)}–${esc(r.endTime)}`).join(', ')}</div>`:'';}).join(''):'Available · no restrictions'}</td><td>${t.availabilityEditable?`<a class="pw-catalogue-action" href="/academy/teaching/?teacher=${encodeURIComponent(t.id)}&amp;program=${encodeURIComponent(d.program.id)}&amp;edit=1" aria-label="Edit availability for ${esc(t.name)}">Edit</a>`:'—'}</td></tr>`;}).join('')||'<tr><td colspan="3">No teachers available.</td></tr>';
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
  window.addEventListener('beforeunload',e=>{if(newClasses.length||classDrafts.size){e.preventDefault();e.returnValue='';}});
  return {render,notices,ensureClass};
 }};
})();

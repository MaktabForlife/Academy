(() => {
 'use strict';
 const enabled=()=>window.M4L_CONFIG?.ACCEPTED_SETUP===true;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={presentation:'Names and public cards',curriculum:'Subjects, modules and classes',timetable:'Timetables',calendar:'Calendar and availability',planning:'Lesson planning setup',memorisation:'Surahs and Duas setup',assessment:'Assessment setup',media:'Media'};
 const tableLabels={activities:'Program and Course details',program_settings:'Program settings',program_subjects:'Program subjects',program_levels:'Levels',modules:'Modules',tasks:'Tasks',classes:'Classes',class_module_progress:'Class progress setup',academy_module_usage:'Module selection',subject_catalog:'Subjects',academy_module_catalogue:'Shared modules',program_resources:'Program resources',course_resources:'Course resources',lesson_plan_policies:'Planning defaults',lesson_plan_requirements:'Planning requirements',memorisation_activity_settings:'Surahs and Duas settings',memorisation_set_activities:'Surahs and Duas areas',memorisation_sets:'Surahs and Duas sets',memorisation_tasks:'Surahs and Duas tasks',assessment_phases:'Assessment groups',assessment_registers:'Assessment registers',assessment_register_areas:'Assessment areas',assessments:'Assessments',assessment_report_templates:'Report designs',course_runs:'Course deliveries',course_settings:'Course settings',lesson_media_assets:'Media files',lesson_media_lessons:'Lesson materials',lesson_media_links:'Media attachments',academy_enrolment_catalogue:'Enrolment options',timetable_publications:'Published timetables',published_lessons:'Timetable sessions',published_lesson_classes:'Session classes',published_lesson_teachers:'Session teachers',program_publication_state:'Program timetable selection',course_run_state:'Course delivery status',program_historical_extensions:'Earlier timetable access',academy_calendar_suppressions:'Calendar exclusions',academy_announcements:'Announcements',academy_calendar_events:'Calendar events',teacher_availability:'Teacher availability',academy_settings:'App settings'};
 const visibleField=field=>!/(?:^revision$|_id$|_key$|_json$|_at$|_by$|_hash$)/.test(field);
 let opened=null;
 async function api(action,input={}){
  const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/setup/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('m4l_account_token')},body:JSON.stringify(input)}),result=await response.json();
  if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Setup publication is unavailable.'),{status:response.status,code:result.code});return result;
 }
 async function open(sourceOperation){
  if(!enabled())return null;
  if(opened)return opened;
  if(window.M4L_ACADEMY_WORKSPACE?.current()!=='ADMIN')throw Error('Open Admin to publish setup.');
  if(sourceOperation){const saved=await api('resolve',{sourceOperation});if(saved.head){window.M4L_ACADEMY_WORKSPACE?.publication(saved.head);return saved;}}
  opened=new Promise((resolve,reject)=>{
   const session=localStorage.getItem('m4l_account_token'),dialog=document.createElement('dialog');dialog.className='card card-pad';dialog.style.cssText='width:min(760px,94vw);max-height:88vh;overflow:auto;box-sizing:border-box;overflow-wrap:anywhere';
   dialog.setAttribute('aria-label','Review setup publication');dialog.innerHTML='<h2>Review setup</h2><p>Saved setup stays private until you publish it. Review the complete change for the selected areas.</p><div data-setup-body>Loading areas…</div><p data-setup-status role="status"></p><div class="workspace-actions"><button type="button" class="button secondary" data-setup-close>Cancel</button><button type="button" class="button" data-setup-review disabled>Review changes</button><button type="button" class="button" data-setup-publish hidden>Publish reviewed setup</button></div>';
   document.body.append(dialog);const body=dialog.querySelector('[data-setup-body]'),status=dialog.querySelector('[data-setup-status]'),review=dialog.querySelector('[data-setup-review]'),publish=dialog.querySelector('[data-setup-publish]'),cancel=dialog.querySelector('[data-setup-close]');
   let busy=false,selection=null,batch=null,areaNames={};
   const end=(error,value)=>{dialog.close();dialog.remove();opened=null;if(error)reject(error);else resolve(value);};
   const close=()=>{if(busy)return;end(Object.assign(Error(sourceOperation?'The timetable or media change is staged. Publish it from Review setup in Admin to make it available to readers.':'Setup publication cancelled.'),{code:'SETUP_REVIEW_REQUIRED',status:409}));};
   dialog.oncancel=event=>{event.preventDefault();close();};cancel.onclick=close;
   const lock=value=>{busy=value;cancel.disabled=value;review.disabled=value;publish.disabled=value;};
   const check=()=>{if(session!==localStorage.getItem('m4l_account_token')||window.M4L_ACADEMY_WORKSPACE?.current()!=='ADMIN')throw new DOMException('The Academy account or workspace changed.','AbortError');};
   review.onclick=async()=>{
    if(busy)return;lock(true);status.textContent='Preparing the complete review…';
    try{
     check();selection={scopes:[...body.querySelectorAll('input:checked')].map(n=>n.value),...(sourceOperation?{sourceOperation}:{} )};
     const data=await api('review',selection);check();
     if(!data.manifest.components.length){status.textContent='No unpublished setup changes in these areas.';return;}
     batch=await api('freeze',{...selection,digest:data.digest});check();
     body.innerHTML='<p>These changes will be published together. Other drafts stay private.</p><table style="width:100%;table-layout:fixed"><thead><tr><th>Area / setup</th><th>Published entries</th><th>Reviewed entries</th></tr></thead><tbody>'+data.manifest.components.map(c=>'<tr><td>'+esc(areaNames[c.scope]||'Shared setup')+'<br>'+esc(tableLabels[c.table]||'Setup')+'</td><td>'+esc(c.previousRows)+'</td><td>'+esc(c.rows)+'</td></tr>').join('')+'</tbody></table>'+data.changes.map(c=>'<details><summary>'+esc(c.table.replaceAll('_',' '))+' · '+esc(c.count)+' row changes</summary>'+c.entries.map(e=>'<p><strong>'+esc(e.action)+' '+esc(e.label)+'</strong><br>'+e.fields.filter(f=>visibleField(f.field)).map(f=>esc(f.field.replaceAll('_',' '))+': '+esc(f.before||'(empty)')+' → '+esc(f.after||'(empty)')).join('<br>')+'</p>').join('')+(c.count>c.entries.length?'<p>Review the full area editor for the remaining changes.</p>':'')+'</details>').join('')+'<p class="muted">This review is frozen. If setup or access changes, review again before publishing.</p>';
     publish.hidden=false;review.hidden=true;status.textContent='Review prepared. Publish when you are ready.';
    }catch(error){status.textContent=error.message;}
    finally{lock(false);}
   };
   publish.onclick=async()=>{
    if(busy||!batch)return;lock(true);status.textContent='Publishing reviewed setup…';
    try{check();const result=await api('publish',{batchId:batch.batchId,digest:batch.digest});check();window.M4L_ACADEMY_WORKSPACE?.publication(result.head);end(null,result);}
    catch(error){status.textContent=error.message;if(error.status&&error.status<500&&error.code!=='SESSION_ENDED'){publish.hidden=true;review.hidden=false;review.textContent='Review current setup';body.innerHTML='<p>Your saved work is retained. Close this review and select the areas again.</p>';review.disabled=true;}}
    finally{busy=false;cancel.disabled=false;publish.disabled=false;}
   };
   dialog.showModal();
   api('options').then(data=>{
    check();areaNames=Object.fromEntries(data.areas.map(a=>[a.activity_key.toUpperCase(),a.name]));const choices=sourceOperation?data.areas.filter(a=>sourceOperation.scopes.map(s=>s.toUpperCase()).includes(a.activity_key.toUpperCase())):data.areas;
    body.innerHTML='<fieldset><legend>Areas to publish together</legend>'+choices.map(a=>'<label style="display:block;margin:8px 0"><input type="checkbox" value="'+esc(a.activity_key)+'"'+(sourceOperation?' checked disabled':'')+'> '+esc(a.name)+'</label>').join('')+'</fieldset><p class="muted">Includes '+esc((sourceOperation?.families||data.families).map(f=>labels[f]||f).join(', '))+'.</p>';review.disabled=false;
   }).catch(error=>{status.textContent=error.message;});
  });
  return opened;
 }
 window.M4L_SETUP_PUBLICATION={open,enabled};
})();

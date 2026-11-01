(() => {
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 function programmeKeys(home,row,mode){
  const own=row.kind+':'+row.id,allowed=new Set((home.personalActivities||[]).filter(a=>a.kind==='PROGRAM'&&a.active!==false&&a.lifecycle!=='ARCHIVED'&&a.roles?.length).map(a=>'PROGRAM:'+a.id));
  if(mode!=='learn')return [own];
  const group=(home.programmePageGroups||[]).find(keys=>Array.isArray(keys)&&keys.includes(own));
  return group?group.filter(key=>allowed.has(key)):[own];
 }
 function displayRows(rows,timezone='Africa/Johannesburg'){
  const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const clock=instant=>{const parts=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part=>[part.type,part.value]));return {date:parts.year+'-'+parts.month+'-'+parts.day,time:parts.hour+':'+parts.minute};};
  return rows.map(row=>{if(!Number.isFinite(row.startsAt)||!Number.isFinite(row.endsAt))return {...row};const begins=clock(row.startsAt),ends=clock(row.endsAt);return {...row,sourceDate:row.sourceDate||row.date,date:begins.date,startTime:begins.time,endTime:ends.time,endDate:ends.date};});
 }
 function dayRows(rows,day,now=Date.now()){
  return rows.map((row,index)=>({...row,infoIndex:index})).filter(row=>row.date===day&&Number.isFinite(row.startsAt)&&Number.isFinite(row.endsAt)&&row.endsAt>row.startsAt).sort((a,b)=>a.startsAt-b.startsAt||a.infoIndex-b.infoIndex).map(row=>({...row,phase:row.status!=='SCHEDULED'?'cancelled':row.endsAt<=now?'finished':row.startsAt<=now?'active':'later',canJoin:row.status==='SCHEDULED'&&Boolean(row.joinKey)&&now>=row.joinAvailableAt&&now<row.endsAt}));
 }
 function sectorPath(index,count){
  const sweep=360/count,start=index*sweep-sweep/2+.7,end=start+sweep-1.4;
  const point=angle=>{const r=(angle-90)*Math.PI/180;return [350+342*Math.cos(r),350+342*Math.sin(r)].map(n=>n.toFixed(3)).join(' ');};
  return `M350 350 L${point(start)} A342 342 0 ${sweep>180?1:0} 1 ${point(end)} Z`;
 }
 window.M4L_PROGRAMME_WORKSPACE_MODEL={programmeKeys,displayRows,dayRows,sectorPath};
 const $=id=>document.getElementById(id),addDay=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 let options=null,owner='',generation=0,selectedDay='',top=null,wheel=null,panel=null,notesPanel=null,popup=null,observer=null,layoutFrame=0,menuAnchor=null,scheduleAnchor=null;
 const toolHomes=new Map();
 const summaries=new Map();
 const currentOwner=()=>JSON.stringify([token(),window.M4L_ACADEMY_WORKSPACE?.current(),window.M4L_ACADEMY_WORKSPACE?.classView(),window.M4L_ACADEMY_WORKSPACE?.head(),options?.keys]);
 const active=(row,mode)=>window.M4L_ACADEMY_WORKSPACE?.current()!=='ADMIN'&&row?.kind==='PROGRAM'&&row.roles?.length&&!row.unavailable&&['learn','teach'].includes(mode);
 const dateLabel=day=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
 const noteTime=value=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:options?.home.timezone||'Africa/Johannesburg'}).format(new Date(value));
 function closePopup(){if(popup){popup.close();popup.remove();popup=null;}}
 function reset(){
  generation++;summaries.clear();owner='';selectedDay='';options=null;closePopup();observer?.disconnect();observer=null;if($('pa-close'))$('pa-close').hidden=false;
  if(layoutFrame)window.cancelAnimationFrame(layoutFrame);layoutFrame=0;
  if(menuAnchor?.parentNode&&$('activity-menu'))menuAnchor.parentNode.insertBefore($('activity-menu'),menuAnchor);
  if(scheduleAnchor?.parentNode&&$('activity-schedule'))scheduleAnchor.parentNode.insertBefore($('activity-schedule'),scheduleAnchor);
  for(const [node,anchor]of toolHomes){if(anchor.parentNode)anchor.before(node);node.classList.remove('programme-teach-tool');node.removeAttribute('data-teach-tool');anchor.remove();}toolHomes.clear();
  menuAnchor?.remove();scheduleAnchor?.remove();menuAnchor=null;scheduleAnchor=null;top?.remove();top=null;wheel=null;panel=null;notesPanel=null;
  $('activity')?.removeAttribute('data-programme-layout');if($('activity-sessions'))$('activity-sessions').hidden=false;
 }
 function resizeNotes(){
  if(!top||layoutFrame)return;
  const mounted=top,centre=top.querySelector('.programme-centre');
  layoutFrame=window.requestAnimationFrame(()=>{
   layoutFrame=0;if(top!==mounted)return;
   const height=Math.max(320,Math.round(centre.getBoundingClientRect().height))+'px';
   if(panel.style.height!==height)panel.style.height=height;
   fitNotes();
  });
 }
 function mount(){
  if(top)return;
  const menu=$('activity-menu'),schedule=$('activity-schedule'),reading=schedule.parentElement,workspace=menu.parentElement;
  menuAnchor=document.createComment('programme menu home');menu.before(menuAnchor);scheduleAnchor=document.createComment('programme timetable home');schedule.before(scheduleAnchor);
  top=document.createElement('div');top.className='programme-top';top.dataset.programmeMode=options.mode;workspace.insertBefore(top,reading);
  const centre=document.createElement('div');centre.className='programme-centre';
  panel=document.createElement('aside');panel.className='programme-notes';panel.setAttribute('aria-labelledby','programme-notes-title');
  notesPanel=panel;
  if(options.mode==='teach'){
   panel.classList.add('programme-teach-panel');panel.removeAttribute('aria-labelledby');panel.setAttribute('aria-label','Attendance, Planner and Notes');
   for(const [id,tool]of [['pa-main','attendance'],['activity-planning','planner']]){
    const node=$(id);if(!node)continue;const anchor=document.createComment('Teach '+tool+' home');node.before(anchor);toolHomes.set(node,anchor);
    node.classList.add('programme-teach-tool');node.dataset.teachTool=tool;panel.append(node);
   }
   notesPanel=document.createElement('section');notesPanel.className='programme-teach-notes';notesPanel.setAttribute('aria-labelledby','programme-notes-title');panel.append(notesPanel);
  }
  top.append(menu,centre,panel);centre.append(schedule);wheel=document.createElement('div');wheel.id='programme-circle-host';schedule.append(wheel);
  $('activity').dataset.programmeLayout='true';$('activity-sessions').hidden=true;
  // Observe the source column only: fitting notes must not observe its own writes.
  if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(resizeNotes);observer.observe(centre);}
  resizeNotes();
 }
 function render(next){
  if(!active(next.row,next.mode)){reset();return;}
  if(top&&top.dataset.programmeMode!==next.mode)reset();
  options={...next,keys:programmeKeys(next.home,next.row,next.mode)};
  const key=currentOwner();if(key!==owner){generation++;summaries.clear();closePopup();selectedDay='';owner=key;}
  mount();if(!selectedDay||selectedDay<next.startDate||selectedDay>addDay(next.startDate,6)){
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:next.home.timezone||'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   selectedDay=today>=next.startDate&&today<=addDay(next.startDate,6)?today:next.startDate;
  }
  renderCircle();renderNotes();void loadNotes(false);
 }
 function renderCircle(){
  if(!options||!wheel)return;
  const rows=dayRows(options.rows,selectedDay),count=Math.max(6,rows.length),live=rows.filter(r=>r.phase==='active'),upcoming=rows.find(r=>r.phase==='later');
  const sectors=Array.from({length:count},(_,index)=>`<path class="programme-sector ${rows[index]?.phase||'unused'}" d="${sectorPath(index,count)}"/>`).join('');
  const lessonHTML=(row,index,graphic=false)=>{
   const angle=index*2*Math.PI/count,title=row.moduleName||row.subjectName||row.title||'Lesson',label=row.phase==='cancelled'?row.status:row.phase==='active'?'In progress':row.phase==='finished'?'Finished':'Upcoming';
   const notes=window.M4L_CLASS_NOTES?.visible()?window.M4L_CLASS_NOTES.buttons(row,true)||'<span class="programme-note-unavailable" title="Notes are unavailable for this session">Notes unavailable</span>':'';
   return `<li class="programme-session ${row.phase}"${graphic?` style="--x:${50+32.2*Math.sin(angle)}%;--y:${50-32.2*Math.cos(angle)}%"`:''}><button type="button" class="programme-session-open" data-information="programme-circle:${row.infoIndex}" aria-label="${esc(title+' · '+row.date+' · '+row.startTime+'–'+row.endTime)}"><small>${esc(label)}</small><strong>${esc(title)}</strong><time>${esc(row.startTime)}–${esc(row.endTime)}</time>${!graphic?`<span>${esc(row.activityName)}</span>`:''}</button>${row.canJoin?`<button type="button" class="programme-join" data-join="programme-circle:${row.infoIndex}:0">Join class ↗</button>`:''}${notes}</li>`;
  };
  const caption=live.length?'In progress':upcoming?'Next session':rows.length?'Sessions complete':'No sessions today',centre=live[0]?.startTime||upcoming?.startTime||'A little space';
  wheel.innerHTML=`<nav class="programme-days" aria-label="Programme timetable days">${Array.from({length:7},(_,i)=>{const day=addDay(options.startDate,i);return `<button type="button" data-programme-day="${day}" aria-pressed="${day===selectedDay}">${esc(dateLabel(day))}</button>`;}).join('')}</nav><div class="programme-wheel${rows.length>8?' programme-wheel-dense':''}"><svg viewBox="0 0 700 700" aria-hidden="true">${sectors}</svg><ol class="programme-wheel-sessions" aria-label="${esc(dateLabel(selectedDay))} sessions">${rows.length<=8?rows.map((r,i)=>lessonHTML(r,i,true)).join(''):''}</ol><div class="programme-wheel-centre"><small>${caption}</small><strong>${esc(centre)}</strong><span>${rows.length} ${rows.length===1?'session':'sessions'}</span></div></div>${rows.length>8?`<ol class="programme-session-list" aria-label="All sessions for ${esc(dateLabel(selectedDay))}">${rows.map((r,i)=>lessonHTML(r,i)).join('')}</ol>`:''}<p class="programme-circle-caption">${esc(dateLabel(selectedDay))} · ${rows.length} ${rows.length===1?'session':'sessions'} · Times follow ${esc(options.home.timezone||'Africa/Johannesburg')}</p>`;
  options.bindJoins?.(wheel);$('activity-menu')?.querySelector('[data-class-notes-toggle]')?.setAttribute('aria-controls','programme-circle-host');
 }
 function noteRows(){return [...summaries.entries()].flatMap(([activityKey,value])=>value.notes.map(note=>({...note,activityKey}))).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||String(b.id).localeCompare(String(a.id)));}
 function noteHTML(note){return `<article class="programme-note"><button type="button" data-programme-note="${esc(note.id)}" data-programme-key="${esc(note.activityKey)}"><span>${esc(note.source?.title||'Class Note')}</span><p dir="auto">${esc(note.body)}</p><small>${esc(note.author||'')} · ${esc(noteTime(note.createdAt))}</small></button></article>`;}
 function renderNotes(){
  if(!notesPanel||!options)return;
  const rows=noteRows(),loading=[...summaries.values()].some(s=>s.loading),error=[...summaries.values()].some(s=>s.error);
  notesPanel.innerHTML=`<header>${options.mode==='teach'?'':'<p class="eyebrow">YOUR CLASS NOTES</p>'}<h2 id="programme-notes-title">${options.mode==='teach'?'Notes':'Notes to return to'}</h2><p>Latest first · Last 3 months</p></header><div class="programme-note-list">${rows.map(noteHTML).join('')||`<p role="status">${loading?'Opening your notes…':error?'Notes could not be checked.':'No current Class Notes.'}</p>`}</div><footer><button type="button" data-programme-more>View more</button>${error?'<button type="button" data-programme-retry>Retry notes</button>':''}</footer>`;
  fitNotes();if(popup?.dataset.programmePopup==='notes')renderPopupNotes();
 }
 function fitNotes(){
  const list=notesPanel?.querySelector('.programme-note-list');if(!list)return;
  const available=Math.max(0,notesPanel.clientHeight-(notesPanel.querySelector('header')?.offsetHeight||0)-(notesPanel.querySelector('footer')?.offsetHeight||0)-(options?.mode==='teach'?32:48));
  let used=0;for(const card of list.querySelectorAll('.programme-note')){card.hidden=false;const height=card.getBoundingClientRect().height+12;card.hidden=used+height>available;if(!card.hidden)used+=height;}
 }
 async function loadNotes(more=false,force=false){
  if(!options||!window.M4L_CLASS_NOTES?.summary)return;
  const captured=owner,stamp=generation;
  const work=options.keys.filter(key=>{const saved=summaries.get(key);return !saved?.loading&&(force||!saved?.ready||more&&saved.before);});
  if(!work.length)return;
  for(const key of work){const old=summaries.get(key);summaries.set(key,{notes:old?.notes||[],before:old?.before||null,ready:Boolean(old?.ready),loading:true,error:false});}renderNotes();
  await Promise.all(work.map(async activityKey=>{
   const old=summaries.get(activityKey);
   try{
    const result=await window.M4L_CLASS_NOTES.summary({activityKey,limit:20,...(more&&old.before?{before:old.before}:{})});
    if(stamp!==generation||captured!==currentOwner())return;
    const notes=more?[...old.notes,...result.notes]:result.notes;
    summaries.set(activityKey,{notes:[...new Map(notes.map(note=>[note.id,note])).values()],before:typeof result.before==='string'?result.before:null,ready:true,loading:false,error:false});
   }catch(error){if(stamp!==generation||captured!==currentOwner())return;summaries.set(activityKey,{notes:[],before:null,ready:true,loading:false,error:true});}
  }));
  if(stamp===generation&&captured===currentOwner())renderNotes();
 }
 function modal(kind,title){
  closePopup();popup=document.createElement('dialog');popup.className='programme-popup';popup.dataset.programmePopup=kind;
  popup.setAttribute('aria-labelledby','programme-popup-title');popup.innerHTML=`<header><h2 id="programme-popup-title">${esc(title)}</h2><button type="button" data-programme-close aria-label="Close">×</button></header><div data-programme-popup-body></div>`;
  popup.addEventListener('cancel',event=>{event.preventDefault();closePopup();});document.body.append(popup);popup.showModal();
 }
 function renderPopupNotes(){
  if(!popup||!options)return;const more=[...summaries.values()].some(s=>s.before),loading=[...summaries.values()].some(s=>s.loading);
  popup.querySelector('[data-programme-popup-body]').innerHTML=`<p>Last 3 months · Latest first</p>${noteRows().map(noteHTML).join('')||'<p>No current notes in this page of your history.</p>'}${more?`<button type="button" data-programme-earlier${loading?' disabled':''}>${loading?'Loading…':'Load earlier notes'}</button>`:''}`;
 }
 function calendar(){
  modal('calendar','Programme calendar');const rows=options.home.calendarEvents||[];
  popup.querySelector('[data-programme-popup-body]').innerHTML=rows.length?`<ul>${rows.map(row=>`<li><strong>${esc(row.description||row.title||row.name)}</strong><p>${esc(row.startDate||row.date)}${row.endDate&&row.endDate!==row.startDate?' – '+esc(row.endDate):''}</p></li>`).join('')}</ul>`:'<p>No calendar events in the selected timetable week.</p>';
 }
 function click(event){
  const button=event.target.closest('button');if(!button||!options)return;
  if(button.dataset.programmeDay){if(options.canChangeDay?.()===false)return;selectedDay=button.dataset.programmeDay;renderCircle();options.onDayChange?.(selectedDay);return;}
  if(button.hasAttribute('data-programme-close'))return closePopup();
  if(button.hasAttribute('data-programme-calendar'))return calendar();
  if(button.hasAttribute('data-programme-more')){modal('notes','Programme Class Notes');renderPopupNotes();return;}
  if(button.hasAttribute('data-programme-earlier'))return void loadNotes(true);
  if(button.hasAttribute('data-programme-retry'))return void loadNotes(false,true);
  if(button.dataset.programmeNote){const input={activityKey:button.dataset.programmeKey,noteId:button.dataset.programmeNote};closePopup();void window.M4L_CLASS_NOTES?.open(input);}
 }
 window.addEventListener('m4l-class-note-saved',event=>{if(options?.keys.includes(event.detail?.activityKey)){generation++;for(const value of summaries.values())value.loading=false;void loadNotes(false,true);}});
 document.addEventListener('click',click);
 window.M4L_PROGRAMME_WORKSPACE={active,keys:programmeKeys,displayRows,render,reset,day:()=>selectedDay};
})();

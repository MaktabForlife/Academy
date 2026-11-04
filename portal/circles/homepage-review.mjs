import {programmes,announcements} from '/circles/homepage-review-data.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function scheduleSummary(programme){
 const rows=programme.schedule||[];if(!rows.length)return 'Please confirm the 2027 days and times.';
 const first=rows[0],same=first.start&&rows.every(row=>row.start===first.start&&row.end===first.end);
 if(same)return (rows.length>1?first.day+'–'+rows.at(-1).day:first.day)+' · '+first.start+'–'+first.end+' SAST';
 return rows.map(row=>row.day+(row.start?' · '+row.start+'–'+row.end+' SAST':' · Time to be confirmed')).join(' / ');
}
export function mountReview(document,{programmesList=programmes,newsList=announcements}={}){
 const $=id=>document.getElementById(id);let selectedProgramme='mothers',news=[...newsList];
 const fullProspectus=$('full-prospectus-link');
 if(document.defaultView?.location?.protocol!=='file:'){fullProspectus.removeAttribute('href');fullProspectus.setAttribute('aria-disabled','true');}
 const studioOrigin=document.defaultView?.AcademyHosting?.studioOrigin;
 if(studioOrigin){const link=document.querySelector('[data-review-studio-courses]');if(link)link.href=new URL('/studio/?view=collections&collection=courses',studioOrigin).href;}
 function coursePanel(programme){
  const rows=programme.schedule||[];
  const days=rows.length?'<div class="course-week" data-days="'+rows.length+'">'+rows.map(row=>'<div class="course-day"><strong>'+esc(row.day)+'</strong><span>'+(row.start?esc(row.start+'–'+row.end):'Time to be confirmed')+'</span></div>').join('')+'</div>':'<p class="schedule-pending">Please confirm the 2027 days and times with the Academy.</p>';
  const arabic=programme.arabic?'<span class="course-arabic" lang="ar" dir="rtl">'+esc(programme.arabic)+'</span>':'';
  return '<article class="course-announcement-body"><section class="announcement-timetable" aria-labelledby="timetable-course-name"><div class="timetable-title-row"><h3 id="timetable-course-name">'+esc(programme.name)+'</h3>'+arabic+'</div><p class="timetable-description">'+esc(programme.description)+'</p><p class="timetable-rhythm">'+esc(programme.duration)+' · '+esc(programme.format)+' · All times SAST</p><div data-course-schedule data-schedule-summary="'+esc(scheduleSummary(programme))+'">'+days+'</div><div class="timetable-footer"><p class="timetable-tagline">'+esc(programme.tag)+'</p><p class="course-fee" data-course-fee>'+esc(programme.fee||'Confirm current fees with the Academy')+'</p></div></section></article>';
 }
 function revealTab(tab){
  const list=$('course-announcement-tabs'),r=tab.getBoundingClientRect(),frame=list.getBoundingClientRect();
  if(r.left<frame.left)list.scrollLeft+=r.left-frame.left;else if(r.right>frame.right)list.scrollLeft+=r.right-frame.right;
 }
 function chooseProgramme(id,{focus=false,scroll=false}={}){
  const programme=programmesList.find(p=>p.id===id);if(!programme)return false;selectedProgramme=id;
  for(const tab of $('course-announcement-tabs').querySelectorAll('[role=tab]')){const selected=tab.dataset.announcementProgrammeTab===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;if(selected){if(focus)tab.focus({preventScroll:true});revealTab(tab);}}
  const panel=$('course-announcement-panel');panel.setAttribute('aria-labelledby','announcement-tab-'+id);panel.innerHTML=coursePanel(programme);
  if(scroll)$('news').scrollIntoView({block:'start',behavior:'instant'});return true;
 }
 $('course-announcement-tabs').innerHTML=programmesList.map(p=>'<button type="button" id="announcement-tab-'+esc(p.id)+'" role="tab" aria-controls="course-announcement-panel" aria-selected="false" tabindex="-1" data-announcement-programme-tab="'+esc(p.id)+'">'+esc(p.name)+'</button>').join('');
 $('programme-grid').innerHTML=programmesList.map(p=>'<article class="programme-card"><small>'+esc(p.duration)+'</small><h3>'+esc(p.name)+'</h3><p>'+esc(p.description)+'</p><a class="text-link" href="#news" data-programme="'+esc(p.id)+'">Course details ↑</a></article>').join('');
 function drawNews(){
  const rows=news.filter(row=>row.id!=='mou-2027');
  $('news-briefs').innerHTML=rows.map(row=>'<article class="news-brief"><p class="eyebrow">'+esc(row.dateLabel)+'</p><h3>'+esc(row.title)+'</h3><p>'+esc(row.summary)+'</p><details class="news-details"><summary>Read more</summary><p>'+esc(row.body)+'</p><p class="source-note">'+esc(row.source)+'</p></details></article>').join('');
 }
 function click(event){
  const tab=event.target.closest('[data-announcement-programme-tab]');if(tab){event.preventDefault();chooseProgramme(tab.dataset.announcementProgrammeTab);return;}
  const programme=event.target.closest('[data-programme]');if(programme){event.preventDefault();chooseProgramme(programme.dataset.programme,{scroll:true});}
 }
 function keydown(event){
  const tab=event.target.closest('[role=tab]');if(!tab)return;const index=programmesList.findIndex(p=>p.id===tab.dataset.announcementProgrammeTab);let next=index;
  if(event.key==='ArrowRight')next=(index+1)%programmesList.length;else if(event.key==='ArrowLeft')next=(index-1+programmesList.length)%programmesList.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=programmesList.length-1;else return;
  event.preventDefault();chooseProgramme(programmesList[next].id,{focus:true});
 }
 document.addEventListener('click',click);$('course-announcement-tabs').addEventListener('keydown',keydown);chooseProgramme(selectedProgramme);drawNews();
 return {chooseProgramme,setAnnouncements(rows){news=[...rows];drawNews();},get selectedProgramme(){return selectedProgramme;},destroy(){document.removeEventListener('click',click);$('course-announcement-tabs').removeEventListener('keydown',keydown);}};
}
export const review=typeof document!=='undefined'?mountReview(document):null;

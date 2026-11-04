import {programmes,announcements} from '/circles/homepage-review-data.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const book='<svg class="book-art" viewBox="0 0 140 90" aria-hidden="true"><path d="M70 81C48 65 26 65 8 70V13C30 6 50 13 70 28c20-15 40-22 62-15v57c-18-5-40-5-62 11Z"/><path d="M70 28v53M18 26c17-3 31 2 42 10M18 39c17-3 31 2 42 10M18 52c17-3 31 2 42 10m20-26c11-8 25-13 42-10M80 49c11-8 25-13 42-10M80 62c11-8 25-13 42-10"/></svg>';
export function scheduleSummary(programme){
 const rows=programme.schedule||[];if(!rows.length)return 'Please confirm the 2027 days and times.';
 const first=rows[0],same=first.start&&rows.every(row=>row.start===first.start&&row.end===first.end);
 if(same)return (rows.length>1?first.day+'–'+rows.at(-1).day:first.day)+' · '+first.start+'–'+first.end+' SAST';
 return rows.map(row=>row.day+(row.start?' · '+row.start+'–'+row.end+' SAST':' · Time to be confirmed')).join(' / ');
}
export function mountReview(document,{programmesList=programmes,newsList=announcements}={}){
 const $=id=>document.getElementById(id);let selectedProgramme='mothers',news=[...newsList];
 const studioOrigin=document.defaultView?.AcademyHosting?.studioOrigin;
 if(studioOrigin){const link=document.querySelector('[data-review-studio-courses]');if(link)link.href=new URL('/studio/?view=collections&collection=courses',studioOrigin).href;}
 function coursePanel(programme){
  const visual=programme.arabic?'<strong lang="ar" dir="rtl">'+esc(programme.arabic)+'</strong>':'<strong class="course-visual-title">'+esc(programme.name)+'</strong>';
  return '<article class="course-announcement-body"><div class="course-announcement-copy"><p class="eyebrow">2027 programme</p><h3>'+esc(programme.name)+'</h3><p class="course-announcement-tagline">'+esc(programme.tag)+'</p><p class="course-announcement-description">'+esc(programme.description)+'</p><dl class="course-announcement-facts"><div><dt>Learning rhythm</dt><dd>'+esc(programme.duration)+'</dd></div><div><dt>Format</dt><dd>'+esc(programme.format)+'</dd></div><div><dt>Days &amp; times</dt><dd data-course-schedule>'+esc(scheduleSummary(programme))+'</dd></div><div><dt>Fees</dt><dd data-course-fee>'+esc(programme.fee||'Confirm current fees with the Academy')+'</dd></div></dl><div class="course-announcement-actions"><a class="button" href="#contact">Ask about this course ↓</a><a class="text-link" href="'+esc(programme.flyerUrl)+'" target="_blank" rel="noopener noreferrer">View original flyer ↗</a></div></div><div class="course-announcement-visual">'+book+visual+'<p>'+esc(programme.tag)+'</p></div></article>';
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

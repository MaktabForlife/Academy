import {programmes,announcements} from '/circles/homepage-review-data.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const book='<svg class="book-art" viewBox="0 0 140 90" aria-hidden="true"><path d="M70 81C48 65 26 65 8 70V13C30 6 50 13 70 28c20-15 40-22 62-15v57c-18-5-40-5-62 11Z"/><path d="M70 28v53M18 26c17-3 31 2 42 10M18 39c17-3 31 2 42 10M18 52c17-3 31 2 42 10m20-26c11-8 25-13 42-10M80 49c11-8 25-13 42-10M80 62c11-8 25-13 42-10"/></svg>';
export function mountReview(document,{programmesList=programmes,newsList=announcements}={}){
 const $=id=>document.getElementById(id);let selectedProgramme='mothers',selectedNews=0,news=[...newsList];
 function panel(programme){
  const days=programme.schedule.length?'<div class="day-cards">'+programme.schedule.map(day=>'<div class="day-card"><strong>'+esc(day.day)+'</strong>'+(day.start?'<time>'+esc(day.start)+'–'+esc(day.end)+'</time><span>SAST · UTC+2</span>':'<span>Time to be confirmed</span>')+'</div>').join('')+'</div>':'<p class="schedule-pending">The prospectus introduces this programme. Please speak to the Academy to confirm its days and times for 2027.</p>';
  return '<article class="timetable-panel"><header class="programme-overview"><div><p class="eyebrow">'+esc(programme.tag)+'</p><h3>'+esc(programme.name)+'</h3><p>'+esc(programme.description)+'</p></div>'+(programme.arabic?'<span lang="ar" dir="rtl">'+esc(programme.arabic)+'</span>':'')+'</header><div class="timetable-body"><div class="week-view"><h4>Your week at a glance</h4>'+days+'</div><aside class="course-facts"><dl><div><dt>Learning rhythm</dt><dd>'+esc(programme.duration)+'</dd></div><div><dt>Format</dt><dd>'+esc(programme.format)+'</dd></div><div><dt>For</dt><dd>'+esc(programme.audience)+'</dd></div><div><dt>Fees</dt><dd>'+esc(programme.fee||'Confirm current fees with the Academy')+'</dd></div></dl><a class="button" href="#contact">Ask about this programme ↓</a><a class="flyer-link" href="https://ummabbadacademy.com/wp-content/uploads/2026/10/'+encodeURIComponent(programme.flyer)+'" target="_blank" rel="noopener noreferrer">View original flyer ↗</a></aside></div></article>';
 }
 function chooseProgramme(id,{focus=false,scroll=false}={}){
  const programme=programmesList.find(p=>p.id===id);if(!programme)return false;selectedProgramme=id;
  for(const tab of $('programme-tabs').querySelectorAll('[role=tab]')){const selected=tab.dataset.programmeTab===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;if(focus&&selected)tab.focus();}
  $('programme-panel').setAttribute('aria-labelledby','tab-'+id);$('programme-panel').innerHTML=panel(programme);
  if(scroll)$('timetables').scrollIntoView({block:'start',behavior:'instant'});return true;
 }
 $('programme-tabs').innerHTML=programmesList.map(p=>'<button type="button" id="tab-'+esc(p.id)+'" role="tab" aria-controls="programme-panel" aria-selected="false" tabindex="-1" data-programme-tab="'+esc(p.id)+'">'+esc(p.name)+'</button>').join('');
 $('programme-grid').innerHTML=programmesList.map(p=>'<article class="programme-card"><small>'+esc(p.duration)+'</small><h3>'+esc(p.name)+'</h3><p>'+esc(p.description)+'</p><a class="text-link" href="#timetables" data-programme="'+esc(p.id)+'">View timetable ↓</a></article>').join('');
 function drawNews(){
  if(!news.length){$('announcement-feature').innerHTML='<p>No announcements to show.</p>';$('announcement-controls').innerHTML='';$('news-briefs').innerHTML='';return;}
  selectedNews=Math.min(selectedNews,news.length-1);const row=news[selectedNews],tone=['green','tan','sage'].includes(row.tone)?row.tone:'green';
  $('announcement-feature').innerHTML='<article class="announcement-spotlight"><div class="announcement-copy"><p class="eyebrow">'+esc(row.label)+'</p><h3>'+esc(row.headline)+'</h3><p class="announcement-summary">'+esc(row.summary)+'</p><ul class="fact-list">'+row.facts.map(f=>'<li>'+esc(f)+'</li>').join('')+'</ul>'+(row.programme?'<a class="button" href="#timetables" data-programme="'+esc(row.programme)+'">'+esc(row.button)+' ↓</a>':'<a class="button" href="#announcement-detail">Read the announcement ↓</a>')+'<details class="news-details" id="announcement-detail"><summary>More about '+esc(row.title)+'</summary><p>'+esc(row.body)+'</p><p class="source-note">'+esc(row.source)+'</p></details></div><div class="announcement-art '+tone+'">'+book+'<strong lang="ar" dir="rtl">'+esc(row.arabic)+'</strong><p>'+esc(row.visual)+'</p></div></article>';
  $('announcement-controls').innerHTML=news.length>1?'<button type="button" data-news-step="-1" aria-label="Previous announcement">←</button>'+news.map((r,i)=>'<button type="button" data-news-choice="'+i+'" aria-label="Show '+esc(r.title)+'" aria-current="'+String(i===selectedNews)+'">'+(i+1)+'</button>').join('')+'<button type="button" data-news-step="1" aria-label="Next announcement">→</button>':'';
  $('news-briefs').innerHTML=news.map((r,i)=>'<article class="news-brief"><p class="eyebrow">'+esc(r.dateLabel)+'</p><h3>'+esc(r.title)+'</h3><p>'+esc(r.summary)+'</p><a class="text-link" href="#news" data-news-choice="'+i+'">Read more ↑</a></article>').join('');
 }
 function click(event){
  const programme=event.target.closest('[data-programme],[data-programme-tab]');if(programme){event.preventDefault();chooseProgramme(programme.dataset.programme||programme.dataset.programmeTab,{scroll:programme.hasAttribute('data-programme')});return;}
  const choice=event.target.closest('[data-news-choice]'),step=event.target.closest('[data-news-step]');
  if(choice||step){event.preventDefault();selectedNews=choice?Number(choice.dataset.newsChoice):(selectedNews+Number(step.dataset.newsStep)+news.length)%news.length;drawNews();return;}
  const read=event.target.closest('a[href="#announcement-detail"]');if(read){event.preventDefault();$('announcement-detail').open=true;$('announcement-detail').scrollIntoView({block:'nearest',behavior:'instant'});}
 }
 function keydown(event){
  const tab=event.target.closest('[role=tab]');if(!tab)return;const i=programmesList.findIndex(p=>p.id===tab.dataset.programmeTab);let next=i;
  if(event.key==='ArrowRight')next=(i+1)%programmesList.length;else if(event.key==='ArrowLeft')next=(i-1+programmesList.length)%programmesList.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=programmesList.length-1;else return;
  event.preventDefault();chooseProgramme(programmesList[next].id,{focus:true});
 }
 document.addEventListener('click',click);$('programme-tabs').addEventListener('keydown',keydown);chooseProgramme(selectedProgramme);drawNews();
 return {chooseProgramme,setAnnouncements(rows){news=[...rows];selectedNews=0;drawNews();},get selectedProgramme(){return selectedProgramme;},destroy(){document.removeEventListener('click',click);$('programme-tabs').removeEventListener('keydown',keydown);}};
}
export const review=typeof document!=='undefined'?mountReview(document):null;

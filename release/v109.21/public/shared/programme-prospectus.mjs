// Public brochure presentation only. Never a native timetable, Join or access source.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const homepageProspectus=Object.freeze({announcementId:'927e3eed-43b9-4fa2-a993-d640f9c69a51',year:2027});
export function publishedProspectus(rows,{announcementId=homepageProspectus.announcementId,assetBase}={}){
 const row=Array.isArray(rows)?rows.find(value=>value.id===announcementId):null;
 if(!row?.pdfUrl)return null;
 try{
  const base=new URL(assetBase),url=new URL(row.pdfUrl,base);
  const local=['localhost','127.0.0.1','[::1]'].includes(base.hostname);
  if(url.origin!==base.origin||url.protocol!=='https:'&&!(local&&url.protocol==='http:')||url.username||url.password||url.hash||url.pathname!=='/api/public/academy-announcements/pdf'||url.searchParams.get('id')!==row.id||!/^[a-f0-9]{64}$/.test(url.searchParams.get('asset')||''))return null;
  return {...row,pdfUrl:url.href};
 }catch{return null;}
}
export function programmeProspectus(host,{programmes=[],announcementId=homepageProspectus.announcementId,year=homepageProspectus.year,assetBase=host.ownerDocument.baseURI,onOpen=()=>{}}={}){
 const document=host.ownerDocument,items=programmes.filter(row=>/^[a-z0-9-]{1,60}$/.test(row.id||'')&&row.marketing?.year===year).slice(0,12);
 const prefix='prospectus-'+crypto.randomUUID();let selected=items.find(row=>row.id==='mothers')?.id||items[0]?.id,active=null,mounted=false;
 host.classList.add('academy-prospectus-announcement');host.hidden=true;
 const tab=id=>host.querySelector('[data-prospectus-course="'+id+'"]');
 function course(row){
  const p=row.marketing,days=Array.isArray(p.days)?p.days.slice(0,7):[],time=p.start&&p.end?p.start+'–'+p.end:'Contact the Academy';
  return '<section class="announcement-timetable"><div class="timetable-title-row"><h3>'+esc(p.name||row.name)+'</h3>'+(p.arabic?'<span class="course-arabic" lang="ar" dir="rtl">'+esc(p.arabic)+'</span>':'')+'</div><p class="timetable-description">'+esc(p.description||row.detail)+'</p><p class="timetable-rhythm">'+esc(p.duration)+' · '+esc(p.format)+' · All times SAST</p><div data-course-schedule><div class="course-week" data-days="'+days.length+'">'+days.map(day=>'<div class="course-day"><strong>'+esc(day)+'</strong><span>'+esc(time)+'</span></div>').join('')+'</div></div><div class="timetable-footer"><p class="timetable-tagline">'+esc(p.tag)+'</p><p class="course-fee">'+esc(p.fee)+'</p></div></section>';
 }
 function choose(id,{focus=false}={}){
  const row=items.find(item=>item.id===id);if(!mounted||!row)return false;selected=id;
  for(const button of host.querySelectorAll('[data-prospectus-course]')){const chosen=button.dataset.prospectusCourse===id;button.setAttribute('aria-selected',String(chosen));button.tabIndex=chosen?0:-1;}
  const panel=host.querySelector('[data-prospectus-panel]');panel.setAttribute('aria-labelledby',prefix+'-'+id);panel.innerHTML='<article class="course-announcement-body">'+course(row)+'</article>';
  if(focus)tab(id)?.focus();return true;
 }
 function mount(){
  host.innerHTML='<div class="news-section"><div class="announcement-layout"><div class="timetable-frame"><div class="course-announcement-card"><div class="course-announcement-tabs" role="tablist" aria-label="'+year+' course timetables">'+items.map(row=>'<button type="button" id="'+prefix+'-'+esc(row.id)+'" role="tab" aria-controls="'+prefix+'-panel" aria-selected="false" tabindex="-1" data-prospectus-course="'+esc(row.id)+'">'+esc(row.marketing.name||row.name)+'</button>').join('')+'</div><div id="'+prefix+'-panel" class="course-announcement-panel" role="tabpanel" data-prospectus-panel></div></div></div><aside class="enrolments-banner" aria-labelledby="'+prefix+'-enrolments"><div class="enrolments-lockup"><span class="enrolments-year">'+year+'</span><h3 id="'+prefix+'-enrolments">enrolments</h3></div><button type="button" class="enrolments-audience" data-prospectus-details></button><a class="full-prospectus-link" data-full-prospectus target="_blank" rel="noopener noreferrer">View the full<br><strong>prospectus</strong><span aria-hidden="true">↗</span></a><div class="enrolments-contact-strip"><a href="https://wa.me/27828478639" target="_blank" rel="noopener noreferrer"><small>Register via WhatsApp</small><strong>+27 82 847 8639</strong></a><div><a href="mailto:admin@ummabbadacademy.com">admin@ummabbadacademy.com</a><a href="https://ummabbadacademy.com" target="_blank" rel="noopener noreferrer">www.ummabbadacademy.com</a></div></div></aside></div></div>';
  mounted=true;choose(selected);
 }
 function update(rows){
  const row=publishedProspectus(rows,{announcementId,assetBase});
  if(!row||!items.length){active=null;mounted=false;host.hidden=true;host.replaceChildren();return null;}
  active=row;if(!mounted)mount();
  host.hidden=false;
  const details=host.querySelector('[data-prospectus-details]');details.textContent=row.title;details.setAttribute('aria-label','Read announcement: '+row.title);
  const link=host.querySelector('[data-full-prospectus]');link.href=row.pdfUrl;link.setAttribute('aria-label','View the full '+year+' prospectus PDF');link.title=row.pdfName||year+' prospectus';
  return row;
 }
 const click=event=>{
  const control=event.target.closest('[data-prospectus-course]');
  if(control){event.preventDefault();choose(control.dataset.prospectusCourse);}
  else if(event.target.closest('[data-prospectus-details]')&&active)onOpen(active,event.target.closest('button'));
 };
 const keydown=event=>{
  const control=event.target.closest('[data-prospectus-course]');if(!control)return;
  const index=items.findIndex(row=>row.id===control.dataset.prospectusCourse);let next;
  if(event.key==='ArrowRight')next=(index+1)%items.length;else if(event.key==='ArrowLeft')next=(index-1+items.length)%items.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=items.length-1;else return;
  event.preventDefault();choose(items[next].id,{focus:true});
 };
 host.addEventListener('click',click);host.addEventListener('keydown',keydown);
 return {update,choose,get selected(){return selected;},destroy(){host.removeEventListener('click',click);host.removeEventListener('keydown',keydown);host.replaceChildren();host.hidden=true;mounted=false;active=null;}};
}

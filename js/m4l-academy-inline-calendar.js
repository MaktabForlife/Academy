/* Expand the full calendar within the current Academy section. */
(() => {
 'use strict';
 document.addEventListener('toggle',event=>{
  const section=event.target;if(!section.matches?.('.academy-calendar-section')||!section.open)return;
  const host=section.querySelector('.academy-inline-calendar');if(!host||host.querySelector('iframe'))return;
  const query=new URLSearchParams({embed:'1'});if(section.dataset.calendarProgram)query.set('program',section.dataset.calendarProgram);
  const frame=document.createElement('iframe');frame.className='academy-calendar-frame';frame.title='Academic Calendar';frame.src='/academy/calendar/?'+query;frame.setAttribute('scrolling','no');host.append(frame);
 },true);
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.data?.type!=='m4l-academy-calendar-height'||!Number.isFinite(event.data.height)||event.data.height<1||event.data.height>10000)return;
  const frame=[...document.querySelectorAll('.academy-calendar-frame')].find(frame=>frame.contentWindow===event.source);if(frame)frame.style.height=Math.ceil(event.data.height)+'px';
 });
})();

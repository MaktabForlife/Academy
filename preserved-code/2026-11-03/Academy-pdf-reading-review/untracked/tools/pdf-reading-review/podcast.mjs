import {esc} from '../../academy/course-websites/model.mjs';
import {renderCourse,imageURL} from '../../academy/course-websites/student.mjs';
import {courseRecordings,youtubeSource,timeLabel} from '../../academy/course-websites/recordings.mjs';
import {quoteRecordingLink,videoProgress} from '../../academy/course-websites/recording-view.mjs';

// Presentation only. Every teaching block still comes from the existing renderer.
export function podcastEntries(course){
 return courseRecordings(course).map(entry=>{
  const readings=course.lessons.filter(l=>l.companionReading),linked=readings.filter(l=>l.sections.some(s=>s.blocks.some(b=>b.type==='video'&&!b.topicsOnly&&youtubeSource(b.videoUrl)?.id===entry.id)));
  return {...entry,readings:linked,additionalReadings:courseRecordings(course).length===1?readings.filter(l=>!linked.includes(l)):[]};
 });
}
export function podcastHash(route,id=''){
 return route==='lesson'?'#'+encodeURIComponent(id):'#'+({home:'recordings',lessons:'readings',about:'about',materials:'materials',sessions:'recordings'}[route]||'recordings');
}
export function parsePodcastHash(hash,course){
 let value;try{value=decodeURIComponent(hash.replace(/^#/,''));}catch{return {route:'home'};}
 if(course.lessons.some(l=>l.id===value))return {route:'lesson',lessonId:value};
 return {route:({recordings:'home',readings:'lessons',about:'about',materials:'materials'}[value]||'home')};
}
const routeLink=(label,route,extra='')=>`<a href="${podcastHash(route)}" data-sp="route" data-route="${route}" ${extra}>${label}</a>`;
const readingLink=(lesson,label=lesson.title,extra='')=>`<a href="${podcastHash('lesson',lesson.id)}" data-sp="lesson" data-id="${esc(lesson.id)}" ${extra}>${esc(label)}</a>`;
const listen=(entry,start=0,label='Listen')=>`<a class="pc-listen" data-sp="play-video" data-video="${entry.id}" data-start="${start}" data-lesson-id="${esc(entry.lessonId)}" href="https://www.youtube.com/watch?v=${entry.id}${start?'&amp;t='+start+'s':''}"><span aria-hidden="true">▶</span> ${esc(label)}</a>`;
function card(entry,index){
 const quote=entry.quote?`<blockquote class="sp-quote sp-recorded-quote pc-card-quote"><p>${esc(entry.quote.text)}</p>${quoteRecordingLink(entry.quote)}</blockquote>`:'';
 return `<article class="pc-episode-card" data-recording-lesson="${esc(entry.lessonId)}"><p class="pc-meta"><span>RECORDING ${String(index+1).padStart(2,'0')}</span><span>${timeLabel(entry.duration)}</span></p><h3>${esc(entry.title)}</h3><div class="pc-summary-row${quote?' pc-has-quote':''}"><p class="sp-recorded-summary">${esc(entry.summary)}</p>${quote}</div><div class="pc-actions">${listen(entry)}${readingLink({id:entry.lessonId},'View lesson')}${entry.readings.length?readingLink(entry.readings[0],'Read alongside'):''}</div><small data-video-watch="${entry.id}">Watch progress · 0%</small></article>`;
}
export function podcastRecordingList(course,search=''){
 const entries=podcastEntries(course),query=search.trim().toLocaleLowerCase('en-GB'),found=entries.filter(e=>(e.title+' '+e.summary).toLocaleLowerCase('en-GB').includes(query));
 return found.map(e=>card(e,entries.indexOf(e))).join('')||'<p class="pc-empty" role="status">No recordings match your search.</p>';
}
function readings(course){
 const lessons=course.lessons.filter(l=>l.companionReading||!course.recordingCompanion);
 return `<section><header class="pc-list-heading"><h1>Read & reflect</h1><span>${lessons.length} readings</span></header><div class="pc-reading-grid">${lessons.map(l=>`<a class="sp-lesson-card pc-reading-card" href="${podcastHash('lesson',l.id)}" data-sp="lesson" data-id="${esc(l.id)}"><span class="sp-eyebrow">${esc(l.group)}</span><h3>${esc(l.title)}</h3>${l.summary?`<p>${esc(l.summary)}</p>`:''}<span>Read →</span></a>`).join('')}</div></section>`;
}
function episodeReadings(root,course,ui,assets,entry){
 const article=root.querySelector('.sp-lesson-article'),body=article?.querySelector('.sp-reading-body');if(!body)return;
 const source=course.lessons.filter(l=>entry.readings.includes(l)||entry.additionalReadings.includes(l));if(!source.length)return;
 const doc=root.ownerDocument,collection=doc.createElement('section');collection.className='pc-course-readings';
 collection.innerHTML=`<h2>Read alongside</h2><nav class="pc-reading-contents" aria-label="Original course readings">${source.map(l=>`<a href="#pc-reading-${esc(l.id)}" data-sp="jump-reading" data-id="${esc(l.id)}">${esc(l.title)}</a>`).join('')}</nav>`;
 for(const lesson of source){
  const holder=doc.createElement('div');holder.innerHTML=renderCourse(course,{...ui,route:'lesson',lessonId:lesson.id},assets);
  const reading=holder.querySelector('.sp-lesson-article');if(!reading)continue;
  reading.classList.add('pc-embedded-reading');reading.dataset.readingId=lesson.id;reading.id='pc-reading-'+lesson.id;
  const heading=reading.querySelector('.sp-page-title');heading.id='pc-title-'+lesson.id;reading.setAttribute('aria-labelledby',heading.id);
  // These derived follow buttons are replaced by one compact timed link. The
  // author’s source sections, artwork and working reflection controls survive.
  for(const section of lesson.sections)if(!section.sourcePages.length&&section.blocks.length&&section.blocks.every(b=>b.type==='video'))reading.querySelector(`[data-section-id="${section.id}"]`)?.remove();
  const matching=lesson.sections.flatMap(s=>s.blocks).filter(b=>b.type==='video'&&!b.topicsOnly).map(b=>youtubeSource(b.videoUrl)).find(v=>v?.id===entry.id);
  if(matching){const link=doc.createElement('div');link.className='pc-reading-listen';link.innerHTML=listen(entry,matching.start,'Listen from '+timeLabel(matching.start));link.querySelector('a').removeAttribute('data-lesson-id');heading.after(link);}
  else reading.querySelector('.sp-eyebrow').textContent='ADDITIONAL COURSE READING';
  collection.append(reading);
 }
 body.querySelector('.sp-recording-notes')?.remove();
 const closing=body.querySelector(':scope>.sp-transcript-summary');if(closing)closing.before(collection);else body.append(collection);
}

export function presentPodcast(root,{course,ui,assets,search=''}={}){
 const old=root.querySelector('.sp-inner'),page=old?.querySelector('.sp-page');if(!page)return;
 const doc=root.ownerDocument,original=doc.createElement('div');original.className='pc-original';
 for(const node of [...page.children])if(!node.matches('.sp-footer'))original.append(node);
 const entries=podcastEntries(course),entry=ui.route==='lesson'?entries.find(e=>e.lessonId===ui.lessonId):null;
 const compact=ui.route!=='home'&&ui.route!=='about',active=ui.route==='lesson'?(entry?'home':'lessons'):ui.route;
 old.classList.add('pc-shell');old.dataset.podcastView=entry?'recording':ui.route;old.style.setProperty('--pc-accent',old.style.getPropertyValue('--sp-accent'));
 const titleTag=ui.route==='home'?'h1':'div';
 old.innerHTML=`<header class="pc-series-header${compact?' pc-compact':''}"><figure class="pc-cover"><img data-course-image="${esc(course.home.imageId)}" src="${esc(imageURL(assets,course.home.imageId))}" alt="${esc(course.home.imageAlt||course.name)}"></figure><div><p class="sp-eyebrow" data-podcast-path="tag">${esc(course.tag)}</p><${titleTag} class="pc-series-title" data-podcast-path="name">${esc(course.name)}</${titleTag}><p class="pc-subtitle" data-podcast-path="home.subtitle">${esc(course.home.subtitle)}</p>${!compact?`<p class="pc-description" data-podcast-path="home.description">${esc(course.home.description)}</p><small>${entries.length} ${entries.length===1?'recording':'recordings'}</small>`:''}</div></header><nav class="pc-tabs" aria-label="Course navigation">${[['home','Recordings'],['lessons','Read'],['about','About'],...(course.pages.materials?[['materials','Course materials']]:[])].map(([route,label])=>routeLink(label,route,`aria-current="${active===route?'page':'false'}"`)).join('')}</nav><section class="sp-page pc-page"></section><footer class="sp-footer"><span>Umm Abbad Academy</span><span>Your course companion</span></footer>`;
 const target=old.querySelector('.pc-page');
 if(ui.route==='home'||ui.route==='sessions')target.innerHTML=`<section><header class="pc-list-heading"><h2>Recordings</h2><label class="pc-search"><span>Search recordings</span><input type="search" data-podcast-search placeholder="Search this course" value="${esc(search)}"></label></header><div data-podcast-results>${podcastRecordingList(course,search)}</div>${videoProgress(course)}</section>`;
 else if(ui.route==='lessons')target.innerHTML=readings(course);
 else if(ui.route==='about')target.innerHTML=`<article class="pc-about"><span class="sp-eyebrow">ABOUT THIS COURSE</span><h1 data-podcast-path="home.headline">${esc(course.home.headline)}</h1><p data-podcast-path="home.subtitle">${esc(course.home.subtitle)}</p><p data-podcast-path="home.description">${esc(course.home.description)}</p><p data-podcast-path="home.caption">${esc(course.home.caption)}</p></article>`;
 else {
  target.append(original);
  if(entry){
   const toolbar=target.querySelector('.sp-reading-toolbar>div');toolbar.insertAdjacentHTML('afterbegin',routeLink('← All recordings','home','class="pc-back"'));
   episodeReadings(target,course,ui,assets,entry);
   const watch=target.querySelector('.sp-lesson-article>.sp-reading-body>.sp-reading-section .sp-video');
   if(watch){const slot=doc.createElement('div');slot.className='pc-player-slot';slot.dataset.podcastPlayer=entry.id;watch.querySelector('.sp-video-poster')?.before(slot);}
  }
 }
}

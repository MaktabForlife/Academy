import {esc} from './model.mjs';

// Use the published parent lesson references, never a second website PDF upload.
export function lessonFileEntries(native={}){
 const seen=new Set(),entries=[];
 const lessons=[native.courseFiles?.media,...(native.lessons||[]),...(native.sessions||[]).map(row=>row.media)].filter(Boolean);
 for(const lesson of lessons)for(const asset of lesson.assets||[]){
  if(asset.kind!=='PDF'||seen.has(asset.id))continue;
  seen.add(asset.id);entries.push({lessonId:lesson.id,asset});
 }
 return entries;
}
export function renderLessonMaterials(native,guest=false){
 const entries=lessonFileEntries(native);
 if(entries.length)return entries.map(({lessonId,asset})=>`<article class="sp-material"><span class="sp-file-tag">COURSE PDF</span><h2>${esc(asset.name||asset.filename||'Course handout')}</h2><button class="sp-primary" data-native-download="${esc(asset.id)}" data-native-lesson="${esc(lessonId)}">Download PDF ↓</button></article>`).join('');
 if(native?.lessonMediaMaterials)return `<p class="sp-lead">Course handouts are shared through Academy Lesson media.${guest?' <a href="/academy/">Sign in to open your available materials →</a>':' Published files will appear here when available to your account.'}</p>`;
 return '';
}

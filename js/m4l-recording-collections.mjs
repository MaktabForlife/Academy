const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const video=a=>['MP4','YOUTUBE'].includes(a.kind);
export function permittedRecordingGroups(lessons=[]){
 const groups=new Map();
 for(const row of lessons){
  if(row.canView!==true||row.state!=='PUBLISHED'||!row.assets?.some(video))continue;
  const key=row.recordingGroup?.key||JSON.stringify([row.activityKey,row.id]);
  let group=groups.get(key);if(!group){group={key,title:row.recordingGroup?.subjectLabel||row.title,teacher:row.teacher,className:row.className,lessons:[]};groups.set(key,group);}
  for(const asset of row.assets.filter(video)){const recordingKey=JSON.stringify([row.id,asset.id]),companion=row.recordingCompanions?.find(c=>c.assetId===asset.id&&(!c.companionExpiresAt||Date.parse(c.companionExpiresAt)>Date.now()));if(asset.kind==='MP4'&&(asset.expired||Date.parse(asset.expiresAt)<=Date.now())&&!companion)continue;if(!group.lessons.some(l=>l.recordingKey===recordingKey))group.lessons.push({...row,recordingAssetId:asset.id,recordingKey,summary:companion?.summary??row.summary,durationSeconds:companion?.durationSeconds,lessonReference:companion?.lessonReference,title:row.assets.filter(video).length>1?(asset.name||asset.filename||row.title):row.title});}
 }
 return [...groups.values()].filter(g=>g.lessons.length);
}
const summary=text=>String(text||'').trim().startsWith('- ')?'<ul>'+String(text).split('\n').filter(Boolean).map(t=>'<li>'+esc(t.replace(/^-\s*/,''))+'</li>').join('')+'</ul>':'<p>'+esc(text)+'</p>';
const button=(action,label,id='',extra='')=>`<button type="button" class="button secondary" data-lm="${action}" data-id="${esc(id)}" ${extra}>${label}</button>`;
export function recordingCollectionHTML(lessons,state={}){
 const groups=permittedRecordingGroups(lessons),group=groups.find(g=>g.key===state.group),row=group?.lessons.find(r=>r.recordingKey===state.lesson);
 if(row){const asset=row.assets.find(a=>a.id===row.recordingAssetId),expired=asset.kind==='MP4'&&(asset.expired||Date.parse(asset.expiresAt)<=Date.now());return `<section class="lm-recording-detail"><nav>${button('recording-list','← Recordings')} ${button('recording-groups','All subject cards')}</nav><p>${esc(row.date)} · ${esc(row.className)} · ${esc(row.teacher)}${row.durationSeconds?' · '+Math.round(row.durationSeconds/60)+' min':''}</p><h2>${esc(row.title)}</h2><div data-lm-recording-player></div>${expired?'<p>Recording expired</p>':button('recording-play','▶ Listen',row.id,`data-asset="${esc(asset.id)}"`)}<details><summary>Follow along by topic</summary><div data-lm-recording-topics></div></details><div class="lm-session-summary">${summary(row.summary)}</div><div data-lm-recording-companion></div>${row.assets.filter(a=>a.kind==='PDF').map(a=>button('pdf',esc(a.name||a.filename||'PDF'),row.id,`data-asset="${esc(a.id)}" data-key="${esc(row.sessionKey)}"`)).join('')}</section>`;}
 if(group)return `<section class="lm-recording-list">${button('recording-groups','← Subject cards')}<h2>${esc(group.title)}</h2><p>${esc(group.className)} · ${esc(group.teacher)}</p>${group.lessons.map(row=>`<article><time>${esc(row.date)}</time><h3>${esc(row.title)}</h3><div class="lm-session-summary">${summary(row.summary)}</div>${row.lessonReference?'<p>'+esc(row.lessonReference)+'</p>':''}${row.durationSeconds?'<p>'+Math.round(row.durationSeconds/60)+' min</p>':''}${button('recording-lesson','▶ Listen',row.id,`data-asset="${esc(row.recordingAssetId)}"`)}</article>`).join('')}</section>`;
 return `<section class="lm-recording-collections"><h2>Recordings</h2><div class="lm-subject-grid">${groups.map(g=>`<article><h3>${esc(g.title)}</h3><p>${esc(g.className)}</p><p>${esc(g.teacher||'')}</p>${button('recording-group','Open recordings','',`data-group="${esc(g.key)}"`)}</article>`).join('')||'<p>No recordings are available with your current access.</p>'}</div></section>`;
}

const cueSeconds=time=>String(time||'').split(':').reduce((n,s)=>n*60+Number(s),0);
export function academicCompanionHTML(c,{lessonId,assetId}){
 const cue=(time,label=time)=>button('recording-seek',esc(label),lessonId,`data-asset="${esc(assetId)}" data-start="${cueSeconds(time)}"`);
 return `${c.quotations?.length?'<aside class="lm-verified-quotes">'+c.quotations.map(q=>'<blockquote>'+esc(q.text)+'</blockquote><p>'+esc(q.speaker)+'</p>'+cue(q.time)).join('')+'</aside>':''}${c.lessonReference?'<p>'+esc(c.lessonReference)+'</p>':''}${c.application?'<h3>'+esc(c.assignmentLabel)+'</h3><p class="lm-companion-application">'+esc(c.application)+'</p>':''}${c.references?.length?'<section class="lm-recording-references"><h3>Ayat &amp; hadith</h3>'+c.references.map(r=>'<article><p lang="ar" dir="rtl">'+esc(r.arabic)+'</p><p>'+esc(r.meaning)+'</p>'+(r.time?cue(r.time):'')+'</article>').join('')+'</section>':''}${c.transcript?'<details><summary>Read full transcript</summary><pre>'+esc(c.transcript)+'</pre></details>':''}`;
}
// The caller supplies the account/generation/selected-recording fence. A failed
// native watch request is visible only in that still-current recording page.
export async function presentRecordingPlayback(operation,{isCurrent=()=>true,report=()=>{}}={}){
 try{await operation();return true;}catch(error){if(isCurrent())report(error.message||'This recording is unavailable.');return false;}
}

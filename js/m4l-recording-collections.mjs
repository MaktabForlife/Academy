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
// A table row is a presentation roll-up, never a new permission or playback
// anchor. Keep the native recording IDs and filter through the existing gates.
export function recordingPlaylistGroups(lessons=[]){
 const nativeGroups=permittedRecordingGroups(lessons),allowed=new Map(nativeGroups.flatMap(group=>group.lessons.map(row=>[row.recordingKey,{row,nativeKey:group.key}]))),groups=new Map();
 for(const source of lessons)for(const asset of source.assets||[]){
  const permitted=allowed.get(JSON.stringify([source.id,asset.id]));if(!permitted)continue;
  const {row,nativeKey}=permitted,identity=row.recordingGroup?.subjectIdentity;
  const playlistId=typeof row.playlistId==='string'&&row.playlistId?row.playlistId:row.playlist?.id;
  const playlist=typeof playlistId==='string'&&playlistId&&(!row.playlist?.id||row.playlist.id===playlistId);
  const surah=Array.isArray(identity)&&identity[0]==='surah'&&((typeof identity[1]==='string'&&identity[1])||(Number.isSafeInteger(identity[1])&&identity[1]>0));
  const known=playlist||surah||row.recordingGroup?.complete===true;
  const key=playlist?JSON.stringify(['playlist',row.activityKey,playlistId]):surah?JSON.stringify(['surah',row.activityKey,identity[1]]):known?nativeKey:JSON.stringify(['other-recordings',row.activityKey]);
  let group=groups.get(key);
  if(!group){group={key,title:playlist?(row.playlist?.name||row.playlist?.title||'Playlist'):surah||known?(row.recordingGroup?.subjectLabel||'Playlist'):'Other recordings',classNames:[],teachers:[],nativeGroupKeys:[],lessons:[],unassigned:!known};groups.set(key,group);}
  if(group.lessons.some(r=>r.recordingKey===row.recordingKey))continue;
  group.lessons.push(row);
  for(const [field,value]of [['classNames',row.className],['teachers',row.teacher],['nativeGroupKeys',nativeKey]])if(value&&!group[field].includes(value))group[field].push(value);
 }
 return [...groups.values()].map(group=>({...group,className:group.classNames.join(' · '),teacher:group.teachers.join(' · ')}));
}
const summary=text=>String(text||'').trim().startsWith('- ')?'<ul>'+String(text).split('\n').filter(Boolean).map(t=>'<li>'+esc(t.replace(/^-\s*/,''))+'</li>').join('')+'</ul>':'<p>'+esc(text)+'</p>';
const button=(action,label,id='',extra='')=>`<button type="button" class="button secondary" data-lm="${action}" data-id="${esc(id)}" ${extra}>${label}</button>`;
export function recordingCollectionHTML(lessons,state={}){
 const groups=recordingPlaylistGroups(lessons),group=groups.find(g=>g.key===state.group||g.nativeGroupKeys.includes(state.group)),row=group?.lessons.find(r=>r.recordingKey===state.lesson);
 if(row){const asset=row.assets.find(a=>a.id===row.recordingAssetId),expired=asset.kind==='MP4'&&(asset.expired||Date.parse(asset.expiresAt)<=Date.now());return `<section class="lm-recording-detail"><nav>${button('recording-list','← Recordings')} ${button('recording-groups','All playlists')}</nav><p>${esc(row.date)} · ${esc(row.className)} · ${esc(row.teacher)}${row.durationSeconds?' · '+Math.round(row.durationSeconds/60)+' min':''}</p><h2>${esc(row.title)}</h2><div data-lm-recording-player></div>${expired?'<p>Recording expired</p>':button('recording-play','▶ Listen',row.id,`data-asset="${esc(asset.id)}"`)}<details><summary>Follow along by topic</summary><div data-lm-recording-topics></div></details><div class="lm-session-summary">${summary(row.summary)}</div><div data-lm-recording-companion></div>${row.assets.filter(a=>a.kind==='PDF').map(a=>button('pdf',esc(a.name||a.filename||'PDF'),row.id,`data-asset="${esc(a.id)}" data-key="${esc(row.sessionKey)}"`)).join('')}</section>`;}
 if(group)return `<section class="lm-recording-list">${button('recording-groups','← Playlists')}<h2>${esc(group.title)}</h2><p>${esc(group.className)} · ${esc(group.teacher)}</p>${group.lessons.map(row=>`<article><time>${esc(row.date)}</time><h3>${esc(row.title)}</h3><div class="lm-session-summary">${summary(row.summary)}</div>${row.lessonReference?'<p>'+esc(row.lessonReference)+'</p>':''}${row.durationSeconds?'<p>'+Math.round(row.durationSeconds/60)+' min</p>':''}${button('recording-lesson','▶ Listen',row.id,`data-asset="${esc(row.recordingAssetId)}"`)}</article>`).join('')}</section>`;
 return `<section class="lm-recording-collections"><h2>Recordings</h2>${groups.length?`<div class="lm-playlist-table-wrap" tabindex="0" role="region" aria-label="Recording playlists"><table class="lm-playlist-table"><caption>Choose a playlist to open its recordings. Counts include the recordings loaded on this page.</caption><thead><tr><th scope="col">Playlist / Surah</th><th scope="col">Class</th><th scope="col">Teacher</th><th scope="col">Loaded recordings</th><th scope="col"><span class="lm-visually-hidden">Open playlist</span></th></tr></thead><tbody>${groups.map(g=>`<tr><th scope="row">${esc(g.title)}</th><td>${esc(g.className||'—')}</td><td>${esc(g.teacher||'—')}</td><td>${g.lessons.length}</td><td>${button('recording-group','Open playlist →','',`data-group="${esc(g.key)}" aria-label="${esc('Open playlist: '+g.title)}"`)}</td></tr>`).join('')}</tbody></table></div>`:'<p>No recordings are available with your current access.</p>'}</section>`;
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

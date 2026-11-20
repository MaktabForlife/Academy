// Read-only native paid-month view. Rights and original dates come only from checked native reads.
export async function startMonthlyMedia({win=window,doc=document,auth=win.M4L_ACADEMY_AUTH,workspace=win.M4L_ACADEMY_WORKSPACE,media=win.M4L_LESSON_MEDIA}={}){
 if(auth?.selected!==true)throw Error('Open Paid months through the current Academy.');
 const client=await auth.ready;await client.ensureFresh({activeWork:false});const $=id=>doc.getElementById(id),root=$('monthly-private');if(!root||!workspace?.fetch)throw Error('The current Academy reader is unavailable.');
 const release=client.registerPrivateRoot(root),owner=client.ownerKey(),listeners=[],esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let generation=0,busy=false,programs=[],surahs=[],lessons=[],before=null,monthsResult=null,surahsResult=null,disposed=false;
 const current=()=>!disposed&&owner&&client.ownerKey()===owner;
 const listen=(target,type,fn)=>{target.addEventListener(type,fn);listeners.push(()=>target.removeEventListener(type,fn));};
 const message=text=>{$('monthly-message').textContent=text;};
 const controls=()=>{for(const id of ['monthly-program','monthly-month','monthly-refresh','monthly-more'])$(id).disabled=busy;};
 function clear(){lessons=[];before=null;$('monthly-lessons').replaceChildren();$('monthly-more').hidden=true;media?.reset();}
 function clearSurahs(){surahs=[];$('monthly-surahs').replaceChildren();$('monthly-surah-section').hidden=true;}
 function invalidate(){generation++;busy=false;clear();clearSurahs();programs=[];$('monthly-program').replaceChildren();$('monthly-month').replaceChildren();monthsResult=surahsResult=null;controls();}
 const stale=()=>new DOMException('The Academy account or private reader changed. Reopen Paid months.','AbortError');
 async function api(action,input={}){
  if(!current())throw stale();const stamp=generation,response=await workspace.fetch('/api/academy/monthly-media/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Academy-Workspace':'LEARN'},cache:'no-store',body:JSON.stringify(input)}),value=await response.json();
  if(!current()||stamp!==generation||!client.isCurrentResult(value))throw stale();if(!response.ok||value.success!==true)throw Object.assign(Error(value.error||'Could not load your paid months.'),{status:response.status});return value;
 }
 function surahHref(value){try{const url=new URL(value,win.location.href);return url.origin===win.location.origin&&url.pathname==='/academy/course-websites/view/'?url.href:null;}catch{return null;}}
 function renderSurahs(){const selected=surahs.filter(row=>row.activityKey===$('monthly-program').value&&surahHref(row.href));$('monthly-surahs').innerHTML=selected.map(row=>'<article><h3>'+esc(row.name)+'</h3><p>Completed '+esc(row.completionDate)+'</p><a href="'+esc(surahHref(row.href))+'">Open surah website →</a></article>').join('');$('monthly-surah-section').hidden=!selected.length;}
 function months(){const selected=programs.find(row=>row.activityKey===$('monthly-program').value);$('monthly-month').innerHTML=(selected?.months||[]).slice().sort().reverse().map(value=>{const label=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z'));return '<option value="'+esc(value)+'">'+esc(label)+'</option>';}).join('');renderSurahs();}
 function render(){ $('monthly-lessons').innerHTML=lessons.map(row=>'<article><h2>'+esc(row.title)+'</h2><time datetime="'+esc(row.date)+'">'+esc(row.date)+'</time><p>'+esc(row.className)+'</p><p>'+esc(row.summary)+'</p>'+row.assets.map(asset=>'<button type="button" data-monthly-lesson="'+esc(row.id)+'" data-monthly-asset="'+esc(asset.id)+'"'+(asset.expired?' disabled':'')+'>'+(asset.kind==='PDF'?'PDF':'Recording')+' · '+esc(asset.name||asset.filename)+(asset.expired?' · Unavailable':'')+'</button>').join('')+'</article>').join('');$('monthly-more').hidden=!before; }
 async function load(more=false,coherenceRetry=0){
  if(busy||!current()||media?.canLeave()===false)return;const stamp=++generation;if(!more)clear();busy=true;controls();message('Checking your month access…');
  try{const value=await api('list',{activityKey:$('monthly-program').value,month:$('monthly-month').value,...more?{before}:{}});if(stamp!==generation)return;
   if(!client.isCurrentResult(monthsResult)||!client.isCurrentResult(surahsResult)){busy=false;if(coherenceRetry>=1)throw stale();await start(coherenceRetry+1);return;}
   lessons=more?[...lessons,...value.lessons]:value.lessons;before=value.before;render();client.revealResult(value,{root});win.M4L_ACADEMY_STARTUP?.complete?.();message(lessons.length?'Your paid months remain available when you stop renewing.':'No published media has been added for this month yet.');
  }catch(error){if(stamp===generation){clear();message(error.message);}}
  finally{if(stamp===generation){busy=false;controls();}}
 }
 async function start(coherenceRetry=0){
  if(!current()){invalidate();message('Sign in to your Academy account to open the months you paid for.');return;}const stamp=++generation;clear();clearSurahs();busy=true;controls();
  try{const [value,websites]=await Promise.all([api('months'),api('surahs')]);if(stamp!==generation)return;monthsResult=value;surahsResult=websites;programs=value.programs;surahs=websites.surahs;$('monthly-program').innerHTML=programs.map(row=>'<option value="'+esc(row.activityKey)+'">'+esc(row.name)+'</option>').join('');const requested=new URL(win.location.href).searchParams.get('program');if(programs.some(row=>row.activityKey===requested))$('monthly-program').value=requested;months();busy=false;controls();if(programs.length)await load(false,coherenceRetry);else{if(!client.isCurrentResult(value)||!client.isCurrentResult(websites))throw stale();client.revealResult(value,{root});win.M4L_ACADEMY_STARTUP?.complete?.();message('No paid months are recorded on this account yet.');}}
  catch(error){if(stamp===generation)message(error.message);}
  finally{if(stamp===generation){busy=false;controls();}}
 }
 $('monthly-program').onchange=()=>{months();void load();};$('monthly-month').onchange=()=>void load();$('monthly-refresh').onclick=()=>void start();$('monthly-more').onclick=()=>void load(true);
 $('monthly-lessons').onclick=event=>{const button=event.target.closest('[data-monthly-lesson]');if(!button||!current()||!client.isCurrentResult(monthsResult)||!client.isCurrentResult(surahsResult))return;const lesson=lessons.find(row=>row.id===button.dataset.monthlyLesson),asset=lesson?.assets.find(row=>row.id===button.dataset.monthlyAsset);if(asset)void media.openAttachment({hostId:'monthly-attachment',lesson:{...lesson,assets:[asset]},kind:asset.kind});};
 listen(win,'pagehide',invalidate);listen(win,'academy-v2-revalidate',()=>void start());listen(win,'m4l-academy-session-ended',()=>{invalidate();message('Your Academy session changed. Reopen Paid months.');});
 listen(root,'click',event=>{const link=event.target.closest('a[href]');if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.target==='_blank')return;event.preventDefault();if(current())void client.navigate(link.href).catch(error=>message(error.message));});
 await start();
 return {refresh:()=>start(),dispose(){disposed=true;invalidate();for(const remove of listeners)remove();release();}};
}

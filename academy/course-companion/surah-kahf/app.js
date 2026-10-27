(() => {
  'use strict';
  function initialize() {
  if (window.KAHF_APP_STARTED || !Array.isArray(window.KAHF_LESSONS)) return;
  window.KAHF_APP_STARTED = true;
  const lessons = window.KAHF_LESSONS;
  const routes = ['overview', 'reading', 'lesson', 'sessions', 'resources', ...(window.KAHF_EXTRA_VIEWS || [])];
  const titles = {overview:'Course overview',reading:'Read & reflect',sessions:'Sessions',resources:'Course materials',assessments:'Assessments'};
  const main = document.querySelector('main');
  const dialog = document.getElementById('contents-dialog');
  const note = document.getElementById('reflection');
  const completion = document.getElementById('complete-reading');
  const svg = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let activeLesson = null;
  let currentRoute = '';
  let shownHash = location.hash;
  const storagePrefix = window.KAHF_STORAGE_SCOPE ? 'kahf-course-' + window.KAHF_STORAGE_SCOPE + '-' : 'kahf-course-';
  const store = {
    get(key) { try { return localStorage.getItem(storagePrefix + key); } catch { return null; } },
    set(key,value) { try { localStorage.setItem(storagePrefix + key,value); return true; } catch { return false; } },
    old(key) { try { return window.KAHF_STORAGE_SCOPE ? null : localStorage.getItem('kahf-demo-' + key); } catch { return null; } }
  };
  let completed;
  try { completed = new Set(JSON.parse(store.get('completed') || '[]').filter(id => lessons.some(l => l.id === id))); }
  catch { completed = new Set(); }
  if (store.get('migrated') !== 'true') {
    if (store.old('reflection') && store.get('note-virtues-general') === null) store.set('note-virtues-general',store.old('reflection'));
    if (store.old('complete') === 'true') completed.add('virtues');
    store.set('completed',JSON.stringify([...completed]));
    store.set('migrated','true');
  }
  const groups = [...new Set(lessons.map(l => l.group))];
  const contentsHTML = groups.map(group => `<div class="contents-group"><span class="eyebrow">${escape(group)}</span>${lessons.filter(l => l.group === group).map(l => `<a href="#lesson/${l.id}" data-lesson-id="${l.id}"><span class="lesson-number">${String(lessons.indexOf(l)+1).padStart(2,'0')}</span><span>${escape(l.title)}</span></a>`).join('')}</div>`).join('');
  document.getElementById('sidebar-contents').innerHTML = contentsHTML;
  document.getElementById('dialog-contents').innerHTML = `<div class="book-contents">${contentsHTML}</div>`;
  document.getElementById('lesson-library').innerHTML = groups.map((group,index) => `<section class="library-group"><div class="section-heading"><div><span class="eyebrow">PART ${String(index+1).padStart(2,'0')}</span><h2>${escape(group)}</h2></div></div><div class="lesson-grid">${lessons.filter(l => l.group === group).map(l => `<a class="lesson-card" href="#lesson/${l.id}" data-library-id="${l.id}"><div class="lesson-card-top"><span class="eyebrow">LESSON ${String(lessons.indexOf(l)+1).padStart(2,'0')}</span><span class="lesson-badge">Not yet completed</span></div><h3>${escape(l.title)}</h3><p>${escape(l.summary)}</p><div class="lesson-card-bottom"><span>Read lesson</span>${svg('arrow')}</div></a>`).join('')}</div></section>`).join('');

  function updateProgress() {
    for (const p of document.querySelectorAll('[data-course-progress]')) { p.max = lessons.length; p.value = completed.size; }
    for (const p of document.querySelectorAll('[data-progress-count]')) p.textContent = `${completed.size} / ${lessons.length}`;
    for (const p of document.querySelectorAll('[data-progress-summary]')) p.textContent = `${completed.size} of ${lessons.length} lessons completed`;
    for (const a of document.querySelectorAll('[data-lesson-id]')) {
      a.classList.toggle('lesson-done',completed.has(a.dataset.lessonId));
      if (activeLesson?.id === a.dataset.lessonId && currentRoute === 'lesson') a.setAttribute('aria-current','page');
      else a.removeAttribute('aria-current');
    }
    for (const card of document.querySelectorAll('[data-library-id]')) {
      const done = completed.has(card.dataset.libraryId);
      card.classList.toggle('lesson-done',done);
      card.querySelector('.lesson-badge').textContent = done ? 'Completed ✓' : 'Not yet completed';
    }
    const last = lessons.find(l => l.id === store.get('last-lesson'));
    const resume = last || lessons[0];
    for (const a of document.querySelectorAll('[data-continue]')) {
      a.href = '#lesson/' + resume.id;
      a.innerHTML = `${last ? 'Continue reading' : 'Begin reading'} ${svg('arrow')}`;
    }
    if (activeLesson) {
      const done = completed.has(activeLesson.id);
      completion.setAttribute('aria-pressed',String(done));
      completion.querySelector('span').textContent = done ? 'Lesson complete · undo' : 'Mark this lesson complete';
      document.getElementById('reading-status').textContent = done ? 'Completed on this device.' : 'Your place is saved on this device.';
    }
  }

  function saveField(field,lesson,key) {
    const saved = store.set(`note-${lesson.id}-${key}`,field.value);
    const status = field.closest('.journal-question')?.querySelector('.field-save') || document.getElementById('save-status');
    status.textContent = saved ? 'Saved on this device.' : 'Browser storage is unavailable. Save your reflections as a file.';
    const printed = field.id === 'reflection' ? document.getElementById('printed-reflection') : field.nextElementSibling;
    if (printed?.classList.contains('printed-answer')) printed.textContent = field.value;
  }

  function renderLesson(lesson) {
    activeLesson = lesson;
    const index = lessons.indexOf(lesson);
    store.set('last-lesson',lesson.id);
    document.getElementById('lesson-breadcrumb').textContent = `Lesson ${String(index+1).padStart(2,'0')}`;
    document.getElementById('lesson-eyebrow').textContent = `LESSON ${String(index+1).padStart(2,'0')} OF ${lessons.length} · ${lesson.group.toUpperCase()}`;
    const accent = lesson.accent.replace(/\.$/,'');
    const title = lesson.title;
    const start = title.toLowerCase().lastIndexOf(accent.toLowerCase());
    document.getElementById('reading-title').innerHTML = start >= 0 ? `${escape(title.slice(0,start))}<em>${escape(title.slice(start))}</em>` : escape(title);
    document.getElementById('lesson-summary').textContent = lesson.summary;
    document.getElementById('lesson-outline-list').innerHTML = lesson.sections.map((s,i)=>`<li><button data-jump="section-${i+1}">${escape(s.title)}</button></li>`).join('');
    document.querySelector('.lesson-outline').open = false;
    document.getElementById('lesson-content').innerHTML = lesson.sections.map((s,i)=>`<section class="reading-section" id="section-${i+1}"><span class="reading-index">${String(i+1).padStart(2,'0')}</span><div>${s.label ? `<span class="eyebrow">${escape(s.label)}</span>` : ''}<h2 tabindex="-1">${escape(s.title)}</h2>${s.body}</div></section>`).join('');
    document.getElementById('general-reflection').hidden = !!lesson.journal;
    note.value = store.get(`note-${lesson.id}-general`) || '';
    document.getElementById('printed-reflection').textContent = note.value;
    document.getElementById('save-status').textContent = note.value ? 'Your reflection is saved in this browser.' : 'Notes are saved only in this browser.';
    for (const field of document.querySelectorAll('[data-note-key]')) {
      field.setAttribute('dir','auto');
      field.value = store.get(`note-${lesson.id}-${field.dataset.noteKey}`) || '';
      const printed = document.createElement('p');
      printed.className = 'printed-answer'; printed.textContent = field.value;
      field.after(printed);
      field.addEventListener('input',() => saveField(field,lesson,field.dataset.noteKey));
    }
    const previous = document.getElementById('previous-lesson');
    previous.href = index ? '#lesson/' + lessons[index-1].id : '#reading';
    previous.innerHTML = `<span class="eyebrow">${index ? 'PREVIOUS LESSON' : 'YOUR COURSE'}</span><span>${escape(index ? lessons[index-1].title : 'All lessons')}</span>`;
    const next = document.getElementById('next-lesson');
    next.href = index < lessons.length-1 ? '#lesson/' + lessons[index+1].id : '#reading';
    next.innerHTML = `<span class="eyebrow">${index < lessons.length-1 ? 'NEXT LESSON' : 'RETURN TO YOUR COURSE'}</span><span>${escape(index < lessons.length-1 ? lessons[index+1].title : 'All lessons')} →</span>`;
  }

  function render(route,initial) {
    for (const name of routes) document.getElementById('view-'+name).hidden = name !== route;
    currentRoute = route;
    if (dialog.open) dialog.close();
    const navRoute = route === 'lesson' ? 'reading' : route;
    for (const a of document.querySelectorAll('[data-route]')) {
      if (a.dataset.route === navRoute) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
    }
    document.title = `${route === 'lesson' ? activeLesson.title : titles[route]} · Surah Al Kahf · Umm Abbad Academy`;
    updateProgress();
    window.dispatchEvent(new CustomEvent('kahf-view', {detail:{route}}));
    if (!initial) { window.scrollTo({top:0,behavior:'instant'}); main.focus({preventScroll:true}); }
  }

  function showRoute(initial=false) {
    if (!initial && location.hash !== shownHash && window.KAHF_CAN_NAVIGATE && !window.KAHF_CAN_NAVIGATE()) { history.replaceState(null,'',shownHash || '#overview'); return; }
    shownHash = location.hash;
    let hash;
    try { hash = decodeURIComponent(location.hash.slice(1)); } catch { hash = 'reading'; }
    if (hash === 'main') return;
    if (hash.startsWith('lesson/')) {
      const id = hash.slice(7);
      const lesson = lessons.find(l=>l.id===id);
      if (lesson) { renderLesson(lesson); render('lesson',initial); return; }
      render('reading',initial); return;
    }
    const route = routes.includes(hash) && hash !== 'lesson' ? hash : 'overview';
    render(route,initial);
    if (hash === 'journey') requestAnimationFrame(()=>document.getElementById('journey').scrollIntoView({behavior:initial?'instant':'smooth'}));
  }

  document.addEventListener('click',event=>{
    const jump = event.target.closest('[data-jump]');
    if (jump) { const target=document.getElementById(jump.dataset.jump); target.scrollIntoView({behavior:'smooth'}); target.querySelector('h2').focus({preventScroll:true}); }
    const link=event.target.closest('a');
    if (link && dialog.contains(link)) dialog.close();
    if (link?.getAttribute('href') === location.hash) { window.scrollTo({top:0,behavior:'instant'}); main.focus({preventScroll:true}); }
  });
  for (const button of document.querySelectorAll('.contents-toggle')) { button.setAttribute('aria-haspopup','dialog'); button.addEventListener('click',()=>dialog.showModal()); }
  document.getElementById('close-contents').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{ if(event.target===dialog){ const b=dialog.getBoundingClientRect(); if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close(); } });

  let readingSize = Number(store.get('text-size') || store.old('text-size')) || 18;
  readingSize = Math.max(16,Math.min(24,readingSize));
  function updateType(){ document.documentElement.style.setProperty('--reading-size',readingSize+'px'); document.getElementById('type-smaller').disabled=readingSize<=16; document.getElementById('type-larger').disabled=readingSize>=24; store.set('text-size',String(readingSize)); }
  document.getElementById('type-smaller').addEventListener('click',()=>{readingSize=Math.max(16,readingSize-2);updateType();});
  document.getElementById('type-larger').addEventListener('click',()=>{readingSize=Math.min(24,readingSize+2);updateType();});
  document.getElementById('print-reading').addEventListener('click',()=>window.print());
  note.addEventListener('input',()=>{if(activeLesson)saveField(note,activeLesson,'general');});
  completion.addEventListener('click',()=>{
    if(!activeLesson)return;
    if(completed.has(activeLesson.id))completed.delete(activeLesson.id);else completed.add(activeLesson.id);
    const saved=store.set('completed',JSON.stringify([...completed]));updateProgress();
    if(!saved)document.getElementById('reading-status').textContent='Browser storage is unavailable. This status lasts for this visit.';
  });

  function textOnly(html){const element=document.createElement('div');element.innerHTML=html;return element.textContent.trim();}
  function exportNotes(selected){
    const lines=['Surah Al Kahf · My reflections','Umm Abbad Academy',''];
    for(const lesson of selected){
      const entries=[];
      if(lesson.journal){
        for(const section of lesson.sections){
          const box=document.createElement('div');box.innerHTML=section.body;
          for(const field of box.querySelectorAll('[data-note-key]')){
            const value=store.get(`note-${lesson.id}-${field.dataset.noteKey}`)||'';
            if(value.trim())entries.push(textOnly(box.querySelector(`label[for="${field.id}"]`).innerHTML)+'\n\n'+value.trim());
          }
        }
      } else {const value=store.get(`note-${lesson.id}-general`)||'';if(value.trim())entries.push(value.trim());}
      if(entries.length)lines.push(lesson.title,'',entries.join('\n\n'),'','--------------------','');
    }
    if(lines.length===3)lines.push('No reflections have been written yet.');
    const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=selected.length===1?`surah-al-kahf-${selected[0].id}-reflections.txt`:'surah-al-kahf-all-my-reflections.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  document.getElementById('download-note').addEventListener('click',()=>{if(activeLesson)exportNotes([activeLesson]);});
  document.getElementById('download-all-notes').addEventListener('click',()=>exportNotes(lessons));
  window.addEventListener('hashchange',()=>showRoute());
  updateType();showRoute(true);
  }
  window.addEventListener('kahf-course-ready', initialize, {once:true});
  initialize();
})();

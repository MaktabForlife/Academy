(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const icons = { EBOOK: '/icons/ebook.svg', PRINTABLE: '/icons/printable.svg',
    AUDIO: '/icons/audio.svg', VIDEO: '/icons/video.svg', OTHER: '/icons/other.svg' };
  const typeNames = { EBOOK: 'eBook', PRINTABLE: 'Printable', AUDIO: 'Audio',
    VIDEO: 'Video', OTHER: 'Other' };
  const state = { rows: [], view: 'you', category: 'ALL', covers: new Map(), observer: null, openRow: null,
    learningAreaRefs: new Set() };

  const requestedArea=new URLSearchParams(location.search).get('activity')||'',areaMatch=requestedArea.match(/^(PROGRAM|COURSE):(.{1,160})$/);
  const selectedRefs=areaMatch?(areaMatch[1]==='PROGRAM'?['PROGRAM:','REBOOT:']:['GLOBAL:','COURSE:']).map(prefix=>(prefix+areaMatch[2]).toUpperCase()):[];
  function belongsToArea(row){
    if(!requestedArea)return true;
    if(!selectedRefs.length||![...state.learningAreaRefs].some(ref=>selectedRefs.includes(ref.toUpperCase())))return false;
    return (row.learningAreaRefs||[]).some(ref=>selectedRefs.includes(String(ref).toUpperCase()))||!row.publicBook&&selectedRefs.some(ref=>String(row.id).toUpperCase().startsWith(ref+':'));
  }

  const cache = window.M4L_LIBRARY_CACHE;
  let generation = 0;
  let personalOwner = '';

  function matchesCategory(type) {
    if (state.category === 'ALL') return true;
    if (state.category === 'PDF') return type === 'EBOOK' || type === 'PRINTABLE';
    if (state.category === 'AUDIOVISUAL') return type === 'AUDIO' || type === 'VIDEO';
    return type === state.category;
  }

  function clearMedia() {
    for (const player of $('al-media').children) {
      player.pause?.();
      player.removeAttribute?.('src');
      player.load?.();
    }
    $('al-media').replaceChildren();
  }

  function pdfProxy(url) {
    const bytes = new TextEncoder().encode(url);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `/pdf-file/${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
  }

  function archiveRow(book) {
    if (!book || typeof book.id !== 'string' ||
        !book.id.startsWith('EXTERNAL:INTERNET_ARCHIVE:') ||
        typeof book.title !== 'string') return null;
    const volumes = Array.isArray(book.volumes) ? book.volumes.filter(volume =>
      Number.isInteger(volume.number) && /^https:\/\/archive\.org\/download\/[^?#]+\.pdf$/i.test(volume.pdfUrl)) : [];
    const pdfUrl = typeof book.pdfUrl === 'string' &&
      /^https:\/\/archive\.org\/download\/[^?#]+\.pdf$/i.test(book.pdfUrl) ? book.pdfUrl : '';
    const mediaFiles = Array.isArray(book.mediaFiles) ? book.mediaFiles.filter(file =>
      Number.isInteger(file.number) && /^https:\/\/archive\.org\/download\/[^?#]+\.(?:mp3|m4a|ogg|mp4|webm)$/i.test(file.mediaUrl)) : [];
    const mediaUrl = /^https:\/\/archive\.org\/download\/[^?#]+\.(?:mp3|m4a|ogg|mp4|webm)$/i.test(book.mediaUrl || '') ? book.mediaUrl : '';
    const mediaType = book.resourceType === 'AUDIO' || book.resourceType === 'VIDEO' ? book.resourceType : '';
    if (!volumes.length && !pdfUrl && !(mediaType && (mediaFiles.length || mediaUrl))) return null;
    return {
      id: book.id, name: book.title, subject: book.subject || 'Books', module: book.module || '',
      learningAreas: Array.isArray(book.learningAreas) ? book.learningAreas : [],learningAreaRefs:book.learningAreaRefs||[],
      source: 'EXTERNAL', sourceName: 'Open Library', type: mediaType || (book.resourceType === 'PRINTABLE' ? 'PRINTABLE' : 'EBOOK'),
      description: book.description || '', author: book.details || '',
      forYou: (book.learningAreaRefs || []).some(ref => state.learningAreaRefs.has(ref)),
      publicBook: true, volumes, pdfUrl, mediaFiles, mediaUrl, coverUrl: book.coverUrl || ''
    };
  }

  function linkRow(record) {
    if (record?.kind !== 'LINK' || record.resourceType !== 'OTHER' || record.active === false ||
        !record.id?.startsWith('EXTERNAL:ACADEMY_LINK:') ||
        typeof record.linkUrl !== 'string' || !/^https:\/\//i.test(record.linkUrl)) return null;
    return { id: record.id, name: record.title, subject: record.subject || 'Other',
      module: record.module || '', learningAreas: record.learningAreas || [],learningAreaRefs:record.learningAreaRefs||[],
      source: 'EXTERNAL', sourceName: 'Website', type: 'OTHER',
      description: record.description || '', author: record.author || '',
      forYou: (record.learningAreaRefs || []).some(ref => state.learningAreaRefs.has(ref)),
      publicBook: true, publicLink: true, linkUrl: record.linkUrl,
      coverUrl: record.coverUrl || '' };
  }

  async function api(action, body = {}, revision) {
    const token = localStorage.getItem('m4l_account_token');
    if (!token) throw new Error('Sign in through your personal Academy account link.');
    const response = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/library/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(revision!==undefined?window.M4L_ACADEMY_READ_CACHE?.headers(revision):{}) },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (localStorage.getItem('m4l_account_token') !== token) throw new Error('Your Academy account has changed.');
    if (!response.ok || !result.success) {
      if (response.status === 401) showSignedOut();
      throw Object.assign(new Error(result.error || 'Library access is unavailable.'),{status:response.status});
    }
    return result;
  }

  function filtered() {
    const query = $('al-search').value.trim().toLocaleLowerCase();
    const source = $('al-source').value;
    return state.rows.filter(row =>
      (row.forYou) && belongsToArea(row) &&
      matchesCategory(row.type) &&
      (source === 'ALL' || `${row.source}:${row.sourceName}` === source) &&
      (!query || [row.name, row.subject, row.module, row.level, ...(row.learningAreas || []), row.sourceName, row.description, row.author]
        .some(value => String(value || '').toLocaleLowerCase().includes(query))));
  }

  function showSignedOut() {
    generation++;
    personalOwner = '';
    $('al-refresh').disabled = false;
    cache.clearPersonal();
    state.rows = [];
    state.openRow = null;
    state.covers.clear();
    state.learningAreaRefs.clear();
    state.observer?.disconnect();
    $('al-results').replaceChildren();
    $('al-open').removeAttribute?.('href');
    clearMedia();
    $('al-content').hidden = true;
    $('al-manage-books').hidden = true;
    $('al-status').innerHTML = 'Signed out. <a href="/academy/#overview">Sign in to Academy →</a> You can still <a href="/academy/open-library/">browse public books</a>.';
    if ($('al-preview').open) $('al-preview').close();
  }

  window.addEventListener('storage', event => {
    if (event.key === 'm4l_account_token' || event.key === null) { showSignedOut(); if (event.newValue) void start(); }
  });
  window.addEventListener('pageshow', () => {
    if (!localStorage.getItem('m4l_account_token')) showSignedOut();
  });
  window.addEventListener('m4l-academy-session', () => { showSignedOut(); if (localStorage.getItem('m4l_account_token')) void start(); });

  function card(row) {
    const cover = state.covers.get(row.id);
    const art = row.publicBook && row.coverUrl
      ? `<img src="${esc(row.coverUrl)}" alt="Cover of ${esc(row.name)}" loading="lazy">`
      : cover && cover.expires > Date.now()
      ? `<img src="${esc(cover.url)}" alt="Cover of ${esc(row.name)}">`
      : row.hasCover && !row.locked
        ? `<span data-cover="${esc(row.id)}" aria-hidden="true">▣</span>`
        : `<img src="${esc(icons[row.type] || icons.OTHER)}" alt="" width="48" height="48">`;
    const partCount = row.volumes?.length ? `${row.volumes.length} volumes` :
      row.mediaFiles?.length > 1 ? `${row.mediaFiles.length} recordings` : '';
    const pdfBook=row.publicBook&&!row.publicLink&&['EBOOK','PRINTABLE'].includes(row.type),tag=pdfBook?'a':'button';
    const attributes=pdfBook?`href="/academy/pdf-reader/?${row.volumes?.length>1?'book='+encodeURIComponent(row.id):'file='+encodeURIComponent(pdfProxy(row.volumes?.[0]?.pdfUrl||row.pdfUrl))}&amp;library=personal&amp;title=${encodeURIComponent(row.name)}" target="_blank" rel="noopener noreferrer" data-pdf-reader="true"`:'type="button"';
    return `<${tag} ${attributes} class="al-card" data-resource="${esc(row.id)}" aria-label="${row.locked ? 'Locked: ' : 'Open '}${esc(row.name)} (${esc(typeNames[row.type] || 'Resource')})"><span class="al-art">${art}</span><small>${esc(row.sourceName)}${row.module ? ` · ${esc(row.module)}` : ''}</small><span class="al-card-title"><img src="${esc(icons[row.type] || icons.OTHER)}" alt="" width="18" height="18"><strong>${esc(row.name)}</strong></span>${partCount ? `<span class="al-volume-count">${partCount}</span>` : ''}${row.locked ? '<span class="al-lock">Subscription required</span>' : ''}</${tag}>`;
  }

  function render() {
    const alphabet=new Intl.Collator('en',{sensitivity:'base',numeric:true});
    const rows = filtered().sort((a, b) => alphabet.compare(a.subject || 'Other',b.subject || 'Other') ||
      alphabet.compare(a.name || '',b.name || ''));
    const groups = new Map();
    for (const row of rows) {
      const subject = row.subject || 'Other';
      if (!groups.has(subject)) groups.set(subject, []);
      groups.get(subject).push(row);
    }
    $('al-results').innerHTML = groups.size
      ? [...groups].map(([subject, entries]) => `<section class="al-section"><h2>${esc(subject)}</h2><div class="al-subject-books">${entries.map(card).join('')}</div></section>`).join('')
      : `<p class="al-empty">${state.view === 'you' ? (selectedRefs.length?'No resources are assigned to this course yet.':'No resources are assigned to you yet.') : 'No resources match this selection.'}</p>`;
    state.observer?.disconnect();
    if ('IntersectionObserver' in window) {
      state.observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          state.observer.unobserve(entry.target);
          void loadCover(entry.target.dataset.cover);
        }
      }, { rootMargin: '160px' });
      $('al-results').querySelectorAll('[data-cover]').forEach(node => state.observer.observe(node));
    } else $('al-results').querySelectorAll('[data-cover]').forEach(node => void loadCover(node.dataset.cover));
  }

  async function loadCover(id) {
    try {
      const result = await api('cover', { resourceId: id });
      state.covers.set(id, { url: result.url, expires: Date.now() + (result.expiresIn - 15) * 1000 });
      const slot = [...$('al-results').querySelectorAll('[data-cover]')].find(node => node.dataset.cover === id);
      if (slot) slot.outerHTML = `<img src="${esc(result.url)}" alt="Cover" loading="lazy">`;
    } catch { /* A missing cover keeps the icon. */ }
  }

  function showArchivePdf(row, volume) {
    const url = volume?.pdfUrl || row.pdfUrl;
    clearMedia();
    $('al-open').href = '/academy/pdf-reader/?file='+encodeURIComponent(pdfProxy(url))+'&library=personal&title='+encodeURIComponent(row.name+(volume?' · '+(volume.label||'Volume '+volume.number):''));
    $('al-open').textContent = 'Open PDF reader in a new tab ↗';
    $('al-open').hidden = false;
  }

  function showArchiveMedia(row, file) {
    const url = file?.mediaUrl || row.mediaUrl;
    const player = document.createElement(row.type === 'AUDIO' ? 'audio' : 'video');
    player.controls = true;
    player.preload = 'metadata';
    player.src = url;
    clearMedia();
    $('al-media').append(player);
    $('al-open').href = url;
    $('al-open').textContent = `Open original ${row.type === 'AUDIO' ? 'audio' : 'video'} at Archive.org ↗`;
    $('al-open').hidden = false;
  }

  async function open(row) {
    state.openRow = row;
    $('al-preview-source').textContent = `${row.sourceName} · ${row.subject}`;
    $('al-preview-title').textContent = row.name;
    $('al-preview-details').textContent = [row.type === 'EBOOK' ? 'eBook' : row.type,
      row.author, row.publisher, row.module, row.description,
      row.learningAreas?.length ? `Used in ${row.learningAreas.join(', ')}` : ''].filter(Boolean).join(' · ');
    $('al-preview-status').textContent = row.locked ? 'An active subscription is required to open this resource.' : row.publicBook ? '' : 'Checking access…';
    clearMedia();
    $('al-open').hidden = true;
    const volumeSelect = $('al-volume');
    volumeSelect.replaceChildren();
    const parts = row.type === 'AUDIO' || row.type === 'VIDEO' ? row.mediaFiles : row.volumes;
    $('al-volume-wrap').hidden = !row.publicBook || !parts?.length || (parts.length < 2 && !row.volumes?.length);
    $('al-volume-label').textContent = row.type === 'AUDIO' ? 'Track' : row.type === 'VIDEO' ? 'Video' : 'Volume';
    if (row.publicBook && parts?.length) {
      for (const volume of parts) {
        const option = document.createElement('option');
        option.value = String(volume.number);
        option.textContent = volume.label || `Volume ${volume.number}`;
        volumeSelect.append(option);
      }
      volumeSelect.value = String(parts[0].number);
    }
    $('al-preview').showModal();
    if (row.publicBook) {
      if (row.type === 'AUDIO' || row.type === 'VIDEO') showArchiveMedia(row, row.mediaFiles?.[0]);
      else showArchivePdf(row, row.volumes?.[0]);
      return;
    }
    if (row.locked) return;
    try {
      const result = await api('access', { resourceId: row.id });
      if (state.openRow !== row || !$('al-preview').open) return;
      $('al-preview-status').textContent = '';
      const mime = String(result.mimeType || '').toLowerCase();
      let media;
      if (mime === 'application/pdf') media = document.createElement('iframe');
      else if (mime.startsWith('audio/')) { media = document.createElement('audio'); media.controls = true; }
      else if (mime.startsWith('video/')) { media = document.createElement('video'); media.controls = true; }
      else if (mime.startsWith('image/')) media = document.createElement('img');
      if (media) { media.src = result.url; media.title = row.name; $('al-media').appendChild(media); }
      $('al-open').href = result.url;
      $('al-open').textContent = 'Open file in new tab ↗';
      $('al-open').hidden = false;
    } catch (error) { $('al-preview-status').textContent = error.message; }
  }

  function refreshSources() {
    const select = $('al-source');
    const selected = select.value;
    select.replaceChildren();
    const all = document.createElement('option');
    all.value = 'ALL';
    all.textContent = 'All sources';
    select.append(all);
    for (const source of new Set(state.rows.map(row => `${row.source}:${row.sourceName}`))) {
      const option = document.createElement('option');
      option.value = source;
      option.textContent = source.slice(source.indexOf(':') + 1);
      select.append(option);
    }
    select.value = [...select.options].some(option => option.value === selected) ? selected : 'ALL';
  }

  function applyArchiveBooks(snapshot) {
    const {books:archiveBooks,records} = snapshot.data;
    const byId = new Map(records.map(record => [record.id, record]));
    const edited = archiveBooks.map(book => {
      const record = byId.get(book.id);
      return record ? { ...book, title: record.title || book.title,
        subject: record.subject || book.subject, module: record.module || '',
        learningAreas: record.learningAreas || [], learningAreaRefs: record.learningAreaRefs || [],
        details: record.author || book.details, description: record.description || book.description,
        coverUrl: record.coverUrl || book.coverUrl,
        resourceType: (!book.resourceType || book.resourceType === 'EBOOK') && record.resourceType === 'PRINTABLE' ?
          'PRINTABLE' : book.resourceType || 'EBOOK' } : book;
    });
    const existing = new Set(state.rows.filter(row => !row.publicBook).map(row => row.id));
    state.rows = [...state.rows.filter(row => !row.publicBook),
      ...[...edited.map(archiveRow), ...records.map(linkRow)].filter(row => row && !existing.has(row.id))];
    refreshSources();
    render();
    if (snapshot.message) $('al-status').textContent = snapshot.message;
  }

  function applyPersonal(data) {
    state.rows = Array.isArray(data.resources) ? data.resources : [];
    state.learningAreaRefs = new Set(data.learningAreaRefs || []);
    $('al-manage-books').hidden = !data.canManage;
    refreshSources();
    $('al-content').hidden = false;
    $('al-status').textContent = data.warnings?.join(' ') || '';
    render();
    const publicSaved = cache.read('public');
    if (publicSaved) applyArchiveBooks(publicSaved);
  }

  async function startCached(force,current,session){
    const active=()=>current===generation&&session===localStorage.getItem('m4l_account_token');
    const apply=data=>{if(!active())return;applyPersonal(data);$('al-status').textContent=data._cacheChecking?'Checking for updates…':data._cacheMessage||data.warnings?.join(' ')||'';};
    try{
      const data=await window.M4L_ACADEMY_READ_CACHE.load({key:['library-catalogue'],force,onUpdate:apply,onError:(error,saved)=>{if(!active())return;if(!saved){state.rows=[];state.learningAreaRefs.clear();$('al-results').replaceChildren();$('al-manage-books').hidden=true;}$('al-status').textContent=saved?'Showing saved Library. Couldn’t check for updates.':error.message;},
       fetcher:async revision=>{const result=await api('catalogue',{},revision);if(result.notModified)return result;
        const fields=['id','name','subject','module','level','source','sourceName','type','description','author','publisher','hasCover','locked','forYou','learningAreas','learningAreaRefs'];
        const data={readRevision:result.readRevision,resources:(result.resources||[]).map(row=>Object.fromEntries(fields.filter(key=>key in row).map(key=>[key,row[key]]))),learningAreaRefs:result.learningAreaRefs||[],warnings:result.warnings||[],canManage:false};
        try{const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/open-library/metadata/list`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session}`},body:'{}'});data.canManage=response.ok&&(await response.json()).success;}catch{}return data;}});
      apply(data);const snapshot=await cache.publicList(force);if(active())applyArchiveBooks(snapshot);
    }catch(error){if(active())$('al-status').textContent=error.message;}finally{if(active())$('al-refresh').disabled=false;}
  }
  window.addEventListener('m4l-library-public-updated',event=>{if(localStorage.getItem('m4l_account_token'))applyArchiveBooks(event.detail);});
  async function start(force = false) {
    const current = ++generation, session = localStorage.getItem('m4l_account_token');
    if (!session) return showSignedOut();
    $('al-refresh').disabled = true;
    if(window.M4L_ACADEMY_READ_CACHE)return startCached(force,current,session);
    const owner = await cache.owner(session);
    if (current !== generation || session !== localStorage.getItem('m4l_account_token')) return;
    personalOwner = owner;
    const saved = owner && cache.read('personal:' + owner);
    if (saved) applyPersonal(saved.data);
    try {
      if (force || !saved || saved.stale) {
        $('al-status').textContent = 'Updating Library…';
        const result = await api('catalogue');
        if (current !== generation || session !== localStorage.getItem('m4l_account_token')) return;
        // Persist catalogue labels only. File access and signed URLs are never cached here.
        const fields = ['id','name','subject','module','level','source','sourceName','type','description','author','publisher','hasCover','locked','forYou','learningAreas','learningAreaRefs'];
        const data = {resources:(result.resources || []).map(row=>Object.fromEntries(fields.filter(key=>key in row).map(key=>[key,row[key]]))),learningAreaRefs:result.learningAreaRefs||[],warnings:result.warnings||[],canManage:false};
        applyPersonal(data);
        try {
          const response = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/open-library/metadata/list`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session}`},body:'{}'});
          data.canManage = response.ok && (await response.json()).success;
        } catch {}
        if (current !== generation || session !== localStorage.getItem('m4l_account_token')) return;
        $('al-manage-books').hidden = !data.canManage;
        if (owner && !data.warnings.length) cache.write('personal:' + owner,data);
      }
      const snapshot = await cache.publicList(force);
      if (current !== generation || session !== localStorage.getItem('m4l_account_token')) return;
      applyArchiveBooks(snapshot);
    } catch (error) {
      if (current !== generation || session !== localStorage.getItem('m4l_account_token')) return;
      $('al-status').textContent = saved ? 'Library update unavailable. Showing your saved list; refresh to try again.' : error.message;
    } finally { if (current === generation) $('al-refresh').disabled = false; }
  }

  $('al-refresh').addEventListener('click', () => void start(true));
  for (const id of ['al-search', 'al-source']) $(id).addEventListener('input', render);
  $('al-categories').addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    state.category = button.dataset.category;
    $('al-categories').querySelectorAll('[data-category]').forEach(item =>
      item.setAttribute('aria-pressed', String(item === button)));
    render();
  });
  $('al-volume').addEventListener('change', event => {
    const row = state.openRow;
    const mediaType = row?.type === 'AUDIO' || row?.type === 'VIDEO';
    const volume = (mediaType ? row.mediaFiles : row?.volumes)?.find(item => String(item.number) === event.target.value);
    if (row?.publicBook && volume && mediaType) showArchiveMedia(row, volume);
    else if (row?.publicBook && volume) showArchivePdf(row, volume);
  });
  $('al-results').addEventListener('click', event => {
    if(event.target.closest('[data-resource]')?.dataset.pdfReader)return;
    const id = event.target.closest('[data-resource]')?.dataset.resource;
    const row = state.rows.find(item => item.id === id);
    if (row?.publicLink) window.open(row.linkUrl, '_blank', 'noopener,noreferrer');
    else if (row) void open(row);
  });
  $('al-close').addEventListener('click', () => $('al-preview').close());
  $('al-preview').addEventListener('close', () => {
    state.openRow = null;
    clearMedia();
  });
  void start();
})();

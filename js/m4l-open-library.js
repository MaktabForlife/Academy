(() => {
  'use strict';

  let books = [];
  const cache = window.M4L_LIBRARY_CACHE;
  let loadGeneration = 0;
  const $ = id => document.getElementById(id);
  const mediaIcons = { EBOOK: '/icons/ebook.svg', PRINTABLE: '/icons/printable.svg',
    AUDIO: '/icons/audio.svg', VIDEO: '/icons/video.svg', OTHER: '/icons/other.svg' };
  const mediaNames = { EBOOK: 'eBook', PRINTABLE: 'Printable', AUDIO: 'Audio',
    VIDEO: 'Video', OTHER: 'Other' };
  const results = $('ol-results');
  const dialog = $('ol-preview');
  const viewer = $('ol-viewer');
  const media = $('ol-media');
  const status = $('ol-status');
  let openBook = null;
  let selectedCategory = 'ALL';

  function matchesCategory(type) {
    if (selectedCategory === 'ALL') return true;
    const resourceType = type || 'EBOOK';
    if (selectedCategory === 'PDF') return resourceType === 'EBOOK' || resourceType === 'PRINTABLE';
    if (selectedCategory === 'AUDIOVISUAL') return resourceType === 'AUDIO' || resourceType === 'VIDEO';
    return resourceType === selectedCategory;
  }

  function clearMedia() {
    for (const player of media.children) {
      player.pause?.();
      player.removeAttribute?.('src');
      player.load?.();
    }
    media.replaceChildren();
  }

  function pdfProxy(url) {
    const bytes = new TextEncoder().encode(url);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `/pdf-file/${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
  }

  function render() {
    const query = $('ol-search').value.trim().toLocaleLowerCase();
    const matches = books.filter(book => matchesCategory(book.resourceType) &&
      [book.title, book.subject, book.module, ...(book.learningAreas || []), book.source, book.details, book.description, book.resourceType]
        .some(value => String(value || '').toLocaleLowerCase().includes(query)))
      .sort((a, b) => (a.subject || 'Books').localeCompare(b.subject || 'Books') || a.title.localeCompare(b.title));
    results.replaceChildren();
    const groups = new Map();
    for (const book of matches) {
      const subject = book.subject || 'Books';
      if (!groups.has(subject)) groups.set(subject, []);
      groups.get(subject).push(book);
    }
    for (const [subject, entries] of groups) {
      const section = document.createElement('section');
      section.className = 'ol-subject';
      const heading = document.createElement('h2');
      heading.textContent = subject;
      section.append(heading);
      const list = document.createElement('div');
      list.className = 'ol-subject-books';
      for (const book of entries) {
        const pdfBook=!book.linkUrl&&(!book.resourceType||['EBOOK','PRINTABLE'].includes(book.resourceType));
        const card = document.createElement(book.linkUrl||pdfBook ? 'a' : 'button');
        if(pdfBook){const selected=book.volumes?.[0]||book;card.href='/academy/pdf-reader/?file='+encodeURIComponent(pdfProxy(selected.pdfUrl))+'&title='+encodeURIComponent(book.title);card.target='_blank';card.rel='noopener noreferrer';card.dataset.pdfReader='true';}
        if (book.linkUrl) {
          card.href = book.linkUrl;
          card.target = '_blank';
          card.rel = 'noopener noreferrer';
        } else if(!pdfBook)card.type = 'button';
        card.className = 'ol-card';
        card.dataset.resource = book.id;
        const verb = book.linkUrl ? 'Visit' : book.resourceType === 'AUDIO' ? 'Listen to' :
          book.resourceType === 'VIDEO' ? 'Watch' : 'Read';
        const mediaType = book.resourceType || 'EBOOK';
        card.setAttribute('aria-label', `${verb} ${book.title} (${mediaNames[mediaType] || 'Resource'})`);
        const art = document.createElement('div');
        art.className = 'ol-card-art';
        const icon = document.createElement('img');
        icon.src = book.coverUrl || mediaIcons[book.resourceType] || mediaIcons.EBOOK;
        icon.alt = '';
        if (book.coverUrl) {
          icon.className = 'ol-cover';
          icon.loading = 'lazy';
          icon.addEventListener('error', () => {
            icon.src = mediaIcons[book.resourceType] || mediaIcons.EBOOK;
            icon.className = '';
          }, { once: true });
        }
        art.append(icon);
        const content = document.createElement('span');
        content.className = 'ol-card-content';
        const titleRow = document.createElement('span');
        titleRow.className = 'ol-title-row';
        const typeIcon = document.createElement('img');
        typeIcon.className = 'ol-type-icon';
        typeIcon.src = mediaIcons[mediaType] || mediaIcons.OTHER;
        typeIcon.alt = '';
        const title = document.createElement('strong');
        title.textContent = book.title;
        titleRow.append(typeIcon, title);
        content.append(titleRow);
        const action = document.createElement('span');
        action.className = 'ol-card-action';
        const fileCount = Array.isArray(book.mediaFiles) ? book.mediaFiles.length : 0;
        action.textContent = book.linkUrl ? 'Visit website ↗' : book.resourceType === 'AUDIO' ?
          (fileCount > 1 ? `${fileCount} recordings · Listen →` : 'Listen →') :
          book.resourceType === 'VIDEO' ?
            (fileCount > 1 ? `${fileCount} recordings · Watch →` : 'Watch →') :
            book.volumes ? `${book.volumes.length} volumes →` : 'Read book →';
        content.append(action);
        card.append(art, content);
        list.append(card);
      }
      section.append(list);
      results.append(section);
    }
    $('ol-empty').hidden = matches.length > 0;
  }

  function showPdf(book, volume) {
    const selected = volume || book;
    clearMedia();
    viewer.hidden = true;
    $('ol-original').href = '/academy/pdf-reader/?file='+encodeURIComponent(pdfProxy(selected.pdfUrl))+'&title='+encodeURIComponent(book.title);
    $('ol-original').textContent = 'Open PDF reader in a new tab ↗';
    viewer.title = `${book.title}${volume ? `, ${volume.label || `volume ${volume.number}`}` : ''} PDF`;
    viewer.src = 'about:blank';
    const url = new URL(window.location.href);
    url.searchParams.set('resource', book.id);
    if (volume) url.searchParams.set('volume', String(volume.number));
    else url.searchParams.delete('volume');
    history.replaceState(null, '', url);
  }

  function showMedia(book, file) {
    const selected = file || book;
    viewer.src = 'about:blank';
    viewer.hidden = true;
    const player = document.createElement(book.resourceType === 'AUDIO' ? 'audio' : 'video');
    player.controls = true;
    player.preload = 'metadata';
    player.src = selected.mediaUrl;
    clearMedia();
    media.append(player);
    $('ol-original').href = selected.mediaUrl;
    $('ol-original').textContent = `Open original ${book.resourceType === 'AUDIO' ? 'audio' : 'video'} at Archive.org ↗`;
    const url = new URL(window.location.href);
    url.searchParams.set('resource', book.id);
    if (file) url.searchParams.set('volume', String(file.number));
    else url.searchParams.delete('volume');
    history.replaceState(null, '', url);
  }

  function open(book, requestedVolume) {
    openBook = book;
    $('ol-source').textContent = book.subject;
    $('ol-title').textContent = book.title;
    $('ol-details').textContent = [book.details, book.description,
      book.learningAreas?.length ? `Used in ${book.learningAreas.join(', ')}` : ''].filter(Boolean).join(' · ');
    const volumeWrap = $('ol-volume-wrap');
    const volumeSelect = $('ol-volume');
    volumeSelect.replaceChildren();
    const parts = book.resourceType === 'AUDIO' || book.resourceType === 'VIDEO' ? book.mediaFiles : book.volumes;
    volumeWrap.hidden = !parts || parts.length < 2 && !book.volumes;
    $('ol-volume-label').textContent = book.resourceType === 'AUDIO' ? 'Track' : book.resourceType === 'VIDEO' ? 'Video' : 'Volume';
    let volume = null;
    if (parts?.length) {
      for (const item of parts) {
        const option = document.createElement('option');
        option.value = String(item.number);
        option.textContent = item.label || `Volume ${item.number}`;
        volumeSelect.append(option);
      }
      volume = parts.find(item => String(item.number) === String(requestedVolume)) || parts[0];
      volumeSelect.value = String(volume.number);
    }
    if (book.resourceType === 'AUDIO' || book.resourceType === 'VIDEO') showMedia(book, volume);
    else showPdf(book, volume);
    dialog.showModal();
  }

  results.addEventListener('click', event => {
    if(event.target.closest('[data-resource]')?.dataset.pdfReader)return;
    const id = event.target.closest('[data-resource]')?.dataset.resource;
    const book = books.find(item => item.id === id);
    if (book && !book.linkUrl) open(book);
  });
  $('ol-search').addEventListener('input', render);
  $('ol-categories').addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    selectedCategory = button.dataset.category;
    $('ol-categories').querySelectorAll('[data-category]').forEach(item =>
      item.setAttribute('aria-pressed', String(item === button)));
    render();
  });
  $('ol-volume').addEventListener('change', event => {
    const parts = openBook?.resourceType === 'AUDIO' || openBook?.resourceType === 'VIDEO' ?
      openBook.mediaFiles : openBook?.volumes;
    const volume = parts?.find(item => String(item.number) === event.target.value);
    if (volume && (openBook.resourceType === 'AUDIO' || openBook.resourceType === 'VIDEO')) showMedia(openBook, volume);
    else if (volume) showPdf(openBook, volume);
  });
  $('ol-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    openBook = null;
    viewer.src = 'about:blank';
    clearMedia();
    const url = new URL(window.location.href);
    url.searchParams.delete('resource');
    url.searchParams.delete('volume');
    history.replaceState(null, '', url);
  });

  render();
  async function loadArchiveBooks(force = false) {
    const generation = ++loadGeneration;
    const button = $('ol-refresh');
    button.disabled = true;
    status.textContent = 'Updating Library…';
    const snapshot = await cache.publicList(force);
    if (generation !== loadGeneration) return;
    applySnapshot(snapshot);
    button.disabled = false;
  }
  function applySnapshot(snapshot) {
    const {books:archiveBooks, records:metadata} = snapshot.data;
    const byId = new Map(metadata.filter(record => typeof record.id === 'string')
      .map(record => [record.id, record]));
    books = archiveBooks.map(book => {
      const record = byId.get(book.id);
      if (!record) return book;
      return {
        ...book, title: record.title || book.title, subject: record.subject || book.subject,
        module: record.module || '',
        learningAreas: Array.isArray(record.learningAreas) ? record.learningAreas : [],
        details: record.author || book.details, description: record.description || book.description,
        coverUrl: record.coverUrl || book.coverUrl,
        resourceType: (!book.resourceType || book.resourceType === 'EBOOK') && record.resourceType === 'PRINTABLE' ?
          'PRINTABLE' : book.resourceType || 'EBOOK'
      };
    });
    books.push(...metadata.filter(record => record.kind === 'LINK' && record.resourceType === 'OTHER' &&
      record.id?.startsWith('EXTERNAL:ACADEMY_LINK:') && record.active !== false &&
      typeof record.linkUrl === 'string' && /^https:\/\//i.test(record.linkUrl))
      .map(record => ({ id: record.id, title: record.title, subject: record.subject || 'Other',
        module: record.module || '', learningAreas: record.learningAreas || [], source: 'Website',
        details: record.author || '', description: record.description || '',
        coverUrl: record.coverUrl || '', resourceType: 'OTHER', linkUrl: record.linkUrl })));
    status.textContent = snapshot.message || (archiveBooks.length ? '' : 'No public media are available in the Archive.org list yet.');
    render();
    const linkedBook = books.find(book => book.id === new URLSearchParams(window.location.search).get('resource'));
    if (linkedBook && !linkedBook.linkUrl && !dialog.open) open(linkedBook, new URLSearchParams(window.location.search).get('volume'));
  }
  $('ol-refresh').addEventListener('click', () => void loadArchiveBooks(true));
  const saved = cache.read('public');
  if (saved) applySnapshot(saved);
  if (!saved || saved.stale) void loadArchiveBooks();

})();

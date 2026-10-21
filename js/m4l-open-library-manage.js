(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fields = ['title', 'author', 'description'];
  const status = $('olm-status');
  const token = localStorage.getItem('m4l_account_token');
  const base = window.M4L_CONFIG?.API_BASE || '';
  let books = [];
  let saved = new Map();
  let localCoverPreview = '';
  let pastedCoverFile = null;
  let taxonomy = { subjects: [], modules: [], learningAreas: [] };
  let taxonomyWarnings = [];
  let areaBoxes = [];
  let isNew = false;
  let editorTouched = false;
  let resourceDirty = false;
  const alphabet = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  const resourceTitle = book => saved.get(book.id)?.title || book.title || book.id;
  const resourceSubject = book => {
    const record = saved.get(book.id) || {};
    return taxonomy.subjects.find(subject => subject.id === record.subjectRef)?.name || record.subject?.trim() || '';
  };

  function updateBrowseNavigation() {
    const board = $('olm-resource-board'), left = board.scrollLeft || 0;
    $('olm-previous').disabled = left < 2;
    $('olm-next').disabled = left + (board.clientWidth || 0) >= (board.scrollWidth || 0) - 2;
  }

  function renderResourceBoard(event) {
    const query = $('olm-search').value.trim().toLocaleLowerCase();
    const matches = books.filter(book => {
      const record = saved.get(book.id) || {};
      return [book.title, book.subject, book.source, book.details, book.description, resourceSubject(book),
        record.title, record.module, record.author, book.id]
        .some(value => String(value || '').toLocaleLowerCase().includes(query));
    }).sort((left, right) => alphabet.compare(resourceTitle(left), resourceTitle(right)) || alphabet.compare(left.id, right.id));
    const groups = new Map([['', { name: 'Uncategorised', books: [] }]]);
    for (const book of matches) {
      const name = resourceSubject(book), key = name.normalize('NFC').toLocaleLowerCase();
      if (!groups.has(key)) groups.set(key, { name, books: [] });
      groups.get(key).books.push(book);
    }
    const ordered = [...groups].sort(([left, a], [right, b]) => left === '' ? -1 : right === '' ? 1 : alphabet.compare(a.name, b.name));
    const board = $('olm-resource-board'), scrollLeft = board.scrollLeft || 0;
    const positions = new Map([...board.children].map(section => [section.dataset.subjectKey, section.children[1]?.scrollTop || 0]));
    board.replaceChildren(...ordered.map(([key, group]) => {
      const section = document.createElement('section');section.className = 'olm-subject-column';section.dataset.subjectKey = key;
      const heading = document.createElement('h3');heading.className = 'olm-subject-heading';
      const name = document.createElement('span');name.textContent = group.name;
      const count = document.createElement('small');count.textContent = String(group.books.length);heading.append(name, count);
      const list = document.createElement('ul');list.className = 'olm-resource-list';
      for (const book of group.books) {
        const row = document.createElement('li'), button = document.createElement('button'), title = document.createElement('strong'), detail = document.createElement('small');
        const record = saved.get(book.id) || {}, type = record.resourceType || book.resourceType || 'EBOOK';
        button.type = 'button';button.className = 'olm-resource-choice';button.dataset.resourceId = book.id;
        button.setAttribute('aria-pressed', String(!isNew && $('olm-book').value === book.id));
        title.textContent = resourceTitle(book);detail.textContent = ({EBOOK:'eBook',PRINTABLE:'Printable',AUDIO:'Audio',VIDEO:'Video',OTHER:'Website'})[type] || 'Resource';
        if (record.kind === 'LINK' && record.active === false) detail.textContent += ' · Hidden';
        button.append(title, detail);button.addEventListener('click', () => chooseResource(book.id));row.append(button);list.append(row);
      }
      if (!group.books.length) {
        const empty = document.createElement('li');empty.className = 'olm-no-resources';
        empty.textContent = query ? 'No matching resources.' : 'No uncategorised resources.';list.append(empty);
      }
      section.append(heading, list);return section;
    }));
    const firstMatch = ordered.findIndex(([,group]) => group.books.length);
    board.scrollLeft = event?.type === 'input' ? query && firstMatch > 0 ? board.children[firstMatch].offsetLeft - board.children[0].offsetLeft : 0 : scrollLeft;
    for (const section of board.children) section.children[1].scrollTop = positions.get(section.dataset.subjectKey) || 0;
    $('olm-resource-count').textContent = query ? `${matches.length} of ${books.length} resources match your search.` : `${books.length} resources. Choose a title to edit its details below.`;
    updateBrowseNavigation();
  }

  function canLeaveResource() {
    return !resourceDirty || window.confirm('Discard unsaved changes to this resource?');
  }

  function chooseResource(id) {
    editorTouched = true;
    if (isNew || $('olm-book').value !== id) {
      if (!canLeaveResource()) return;
      $('olm-book').value = id;showBook();
    }
    $('olm-title').focus({ preventScroll: true });
    $('olm-title').scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function option(value, label) {
    const item = document.createElement('option');
    item.value = value;
    item.textContent = label;
    return item;
  }

  function showModules(selected = '') {
    const subjectId = $('olm-subject').value;
    const modules = taxonomy.modules.filter(item => item.subjectId === subjectId);
    $('olm-module').replaceChildren(option('', 'General / no module'), ...modules.map(item =>
      option(item.id, `${item.name} · ${item.source}`)));
    $('olm-module').disabled = !subjectId || !modules.length;
    $('olm-module').value = modules.some(item => item.id === selected) ? selected : '';
  }

  function selectedAreaRefs() { return areaBoxes.filter(box => box.checked).map(box => box.value); }

  function updateAreaSummary() {
    const count = selectedAreaRefs().length;
    $('olm-learning-area-summary').textContent = count ?
      `${count} learning area${count === 1 ? '' : 's'} selected` : 'Choose Programs and courses';
  }

  function showCover() {
    const book = books.find(item => item.id === $('olm-book').value);
    const record = saved.get(book?.id) || {};
    const hiddenLink = record.kind === 'LINK' && record.active === false;
    const value = hiddenLink && !localCoverPreview && !$('olm-coverUrl').value.trim() ? '' :
      $('olm-remove-cover').checked ? record.kind === 'LINK' ? '' : book?.coverUrl || '' :
      localCoverPreview || $('olm-coverUrl').value.trim() || record.coverUrl || book?.coverUrl || '';
    const image = $('olm-cover-preview');
    image.hidden = !value;
    if (!image.hidden) image.src = value;
  }

  function showNew() {
    isNew = true;
    resourceDirty = false;
    $('olm-editor-title').textContent = 'Add a resource';
    $('olm-form').hidden = false;
    $('olm-link-fields').hidden = false;
    $('olm-category-wrap').hidden = true;
    $('olm-search').value = '';
    $('olm-book').replaceChildren(option('', 'Select a resource to edit'), ...books.map(book =>
      option(book.id, saved.get(book.id)?.title || book.title)));
    $('olm-book').disabled = !books.length;
    $('olm-book').value = '';
    $('olm-save').disabled = false;
    $('olm-source').textContent = 'New public link · Other';
    for (const field of fields) $(`olm-${field}`).value = '';
    $('olm-linkUrl').value = '';
    $('olm-active').checked = true;
    $('olm-title').required = true;
    $('olm-subject').required = true;
    $('olm-linkUrl').required = true;
    $('olm-subject').value = '';
    showModules();
    for (const box of areaBoxes) box.checked = false;
    updateAreaSummary();
    $('olm-coverUrl').value = '';
    $('olm-cover-file').value = '';
    $('olm-remove-cover').checked = false;
    pastedCoverFile = null;
    if (localCoverPreview) URL.revokeObjectURL(localCoverPreview);
    localCoverPreview = '';
    $('olm-title').placeholder = 'Resource title';
    $('olm-coverUrl').placeholder = 'Optional public JPG/PNG cover image';
    $('olm-cover-preview').hidden = true;
    status.textContent = 'Add a public website link in Other. Choose a subject and save.';
    renderResourceBoard();
  }

  async function api(action, body = {}, file = null) {
    const headers = { Authorization: `Bearer ${token}` };
    let payload;
    if (file) {
      const form = new FormData();
      form.append('details', JSON.stringify(body));
      form.append('cover', file);
      payload = form;
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${base}/api/academy/open-library/metadata/${action}`, {
      method: 'POST',
      headers, body: payload, ...(['list','options'].includes(action)&&typeof AbortSignal!=='undefined'&&AbortSignal.timeout?{signal:AbortSignal.timeout(15000)}:{})
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Book details are unavailable.');
    return data;
  }

  function showBook() {
    const book = books.find(item => item.id === $('olm-book').value);
    if (!book) return;
    isNew = false;
    resourceDirty = false;
    $('olm-form').hidden = false;
    $('olm-editor-title').textContent = resourceTitle(book);
    $('olm-save').disabled = false;
    const record = saved.get(book.id) || {};
    const manual = record.kind === 'LINK';
    $('olm-link-fields').hidden = !manual;
    $('olm-category-wrap').hidden = manual;
    if (!manual) {
      const category = book.resourceType || 'EBOOK';
      const choices = category === 'AUDIO' ? [['AUDIO', 'Audio']] : category === 'VIDEO' ?
        [['VIDEO', 'Video']] : [['EBOOK', 'eBook'], ['PRINTABLE', 'Printable']];
      $('olm-category').replaceChildren(...choices.map(([value, label]) => option(value, label)));
      $('olm-category').value = choices.some(([value]) => value === record.resourceType) ? record.resourceType : category;
    }
    $('olm-linkUrl').required = manual;
    $('olm-title').required = manual;
    $('olm-subject').required = manual;
    $('olm-linkUrl').value = manual ? record.linkUrl || '' : '';
    $('olm-active').checked = record.active !== false;
    $('olm-source').textContent = `${book.source} · ${book.title}${book.volumes ? ` · ${book.volumes.length} volumes` : ''}`;
    for (const field of fields) $(`olm-${field}`).value = record[field] || '';
    const assigned = new Set(record.learningAreaRefs || []);
    for (const box of areaBoxes) box.checked = assigned.has(box.value);
    updateAreaSummary();
    $('olm-subject').value = taxonomy.subjects.some(item => item.id === record.subjectRef) ? record.subjectRef : '';
    showModules(record.moduleRef);
    $('olm-coverUrl').value = record.hasUploadedCover ? '' : record.coverUrl || '';
    $('olm-cover-file').value = '';
    pastedCoverFile = null;
    $('olm-cover-paste').textContent = 'Or paste a copied JPG/PNG cover here with ⌘V or Ctrl+V';
    $('olm-remove-cover').checked = false;
    if (localCoverPreview) URL.revokeObjectURL(localCoverPreview);
    localCoverPreview = '';
    $('olm-title').placeholder = manual ? 'Resource title' : book.title;
    $('olm-author').placeholder = book.details || 'Use Archive.org creator';
    $('olm-coverUrl').placeholder = book.coverUrl || 'Use Archive.org cover image';
    showCover();
    status.textContent = `${manual ? 'Edit this public link and its learning areas.' : record.revision ? 'Academy details saved for this book.' : 'This book is using Archive.org details.'}${taxonomyWarnings.length ? ` ${taxonomyWarnings.join(' ')}` : ''}`;
    renderResourceBoard();
  }

  function refreshBookChoices(preferredId = $('olm-book').value, preserveForm = false) {
    const matches = books.slice().sort((left, right) => alphabet.compare(resourceTitle(left), resourceTitle(right)));
    $('olm-book').replaceChildren(...(matches.length ? matches.map(book =>
      option(book.id, saved.get(book.id)?.title || book.title)) :
      [option('', 'No matching resources')]));
    $('olm-book').disabled = !matches.length;
    if(preserveForm){if(isNew){$('olm-book').replaceChildren(option('', 'Select a resource to edit'), ...$('olm-book').children);$('olm-book').value='';}else $('olm-book').value=preferredId;renderResourceBoard();return;}
    if (!matches.length) {
      isNew = false;
      $('olm-save').disabled = true;
      $('olm-source').textContent = 'No resources match. Clear the search to see all resources.';
      return;
    }
    $('olm-book').value = matches.some(book => book.id === preferredId) ? preferredId : matches[0].id;
    showBook();
  }

  async function start() {
    if (!token) {
      status.textContent = 'Sign in through your Academy account to manage books.';
      return;
    }
    try {
      const archivePending=fetch('/academy/open-library/catalogue',typeof AbortSignal!=='undefined'&&AbortSignal.timeout?{signal:AbortSignal.timeout(12000)}:{}).then(async response=>response.ok?(await response.json()).books||[]:[]).catch(()=>[]);
      const [metadata, options] = await Promise.all([api('list'), api('options')]);
      saved = new Map((Array.isArray(metadata.records) ? metadata.records : []).map(record => [record.id, record]));
      const savedBooks=()=>[...saved.values()].map(record=>({id:record.id,title:record.title||record.id,source:'Academy',resourceType:record.resourceType||'OTHER',coverUrl:record.coverUrl||''}));
      books=savedBooks();
      taxonomy = { subjects: Array.isArray(options.subjects) ? options.subjects : [],
        modules: Array.isArray(options.modules) ? options.modules : [],
        learningAreas: Array.isArray(options.learningAreas) ? options.learningAreas : [] };
      taxonomyWarnings = Array.isArray(options.warnings) ? options.warnings : [];
      $('olm-subject').replaceChildren(option('', 'Use Archive.org subject'), ...taxonomy.subjects.map(item =>
        option(item.id, `${item.name} · ${item.source}`)));
      areaBoxes = taxonomy.learningAreas.map(area => {
        const label = document.createElement('label');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.value = area.id;
        label.append(box, document.createTextNode(`${area.name} · ${area.source}`));
        $('olm-learning-areas-list').append(label);
        return box;
      });
      $('olm-add').hidden = false;
      $('olm-browser').hidden = false;
      $('olm-form').hidden = false;
      if(books.length)refreshBookChoices();else showNew();
      status.textContent='Editor ready. Loading resources…';
      const archiveBooks=await archivePending;
      books=[...archiveBooks,...savedBooks().filter(book=>!archiveBooks.some(source=>source.id===book.id))];
      if(books.length)refreshBookChoices($('olm-book').value,editorTouched);
      else if(!editorTouched)showNew();
      if(status.textContent==='Editor ready. Loading resources…')status.textContent=archiveBooks.length?'Editor ready.':'Editor ready. The external catalogue is temporarily unavailable; saved resources and new links remain editable.';
    } catch (error) { status.textContent = error.message; }
  }

  $('olm-form').addEventListener('input',()=>{editorTouched=true;resourceDirty=true;});
  $('olm-form').addEventListener('change',()=>{editorTouched=true;resourceDirty=true;});
  $('olm-add').addEventListener('click',()=>{if(canLeaveResource()){editorTouched=true;showNew();}});
  $('olm-search').addEventListener('input', renderResourceBoard);
  $('olm-resource-board').addEventListener('scroll', updateBrowseNavigation);
  $('olm-previous').addEventListener('click', () => $('olm-resource-board').scrollBy({ left: -$('olm-resource-board').clientWidth * .8, behavior: 'smooth' }));
  $('olm-next').addEventListener('click', () => $('olm-resource-board').scrollBy({ left: $('olm-resource-board').clientWidth * .8, behavior: 'smooth' }));
  window.addEventListener('resize', updateBrowseNavigation);
  $('olm-search').addEventListener('keydown', event => {
    if (event.key === 'Enter') event.preventDefault();
  });
  $('olm-book').addEventListener('change', showBook);
  $('olm-learning-areas-list').addEventListener('change', updateAreaSummary);
  $('olm-subject').addEventListener('change', () => showModules());
  $('olm-coverUrl').addEventListener('input', () => {
    $('olm-cover-file').value = '';
    pastedCoverFile = null;
    $('olm-remove-cover').checked = false;
    if (localCoverPreview) URL.revokeObjectURL(localCoverPreview);
    localCoverPreview = '';
    showCover();
  });
  $('olm-cover-file').addEventListener('change', () => {
    const file = $('olm-cover-file').files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      status.textContent = 'Choose a JPG or PNG image up to 5 MB.';
      $('olm-cover-file').value = '';
      return;
    }
    $('olm-coverUrl').value = '';
    pastedCoverFile = null;
    $('olm-remove-cover').checked = false;
    if (localCoverPreview) URL.revokeObjectURL(localCoverPreview);
    localCoverPreview = URL.createObjectURL(file);
    showCover();
  });
  document.addEventListener('paste', event => {
    const file = [...(event.clipboardData?.items || [])]
      .filter(item => item.kind === 'file' && ['image/jpeg', 'image/png'].includes(item.type))
      .map(item => item.getAsFile()).find(Boolean);
    if (!file || $('olm-form').hidden) return;
    event.preventDefault();
    if (file.size < 1 || file.size > 5 * 1024 * 1024) {
      status.textContent = 'Choose a JPG or PNG image up to 5 MB.';
      return;
    }
    pastedCoverFile = file;
    editorTouched = true;
    resourceDirty = true;
    $('olm-cover-file').value = '';
    $('olm-coverUrl').value = '';
    $('olm-remove-cover').checked = false;
    if (localCoverPreview) URL.revokeObjectURL(localCoverPreview);
    localCoverPreview = URL.createObjectURL(file);
    $('olm-cover-paste').textContent = 'Pasted cover ready to save';
    showCover();
    status.textContent = 'Cover pasted. Save Academy details to use it.';
  });
  $('olm-remove-cover').addEventListener('change', () => {
    if ($('olm-remove-cover').checked) {
      $('olm-coverUrl').value = '';
      $('olm-cover-file').value = '';
      pastedCoverFile = null;
      if (localCoverPreview) URL.revokeObjectURL(localCoverPreview);
      localCoverPreview = '';
    }
    showCover();
  });
  $('olm-form').addEventListener('submit', async event => {
    event.preventDefault();
    const book = isNew ? null : books.find(item => item.id === $('olm-book').value);
    if (!isNew && !book) return;
    const button = $('olm-save');
    button.disabled = true;
    status.textContent = 'Saving Academy details…';
    try {
      const body = { ...(book ? { id: book.id } : {}), baseRevision: book ? saved.get(book.id)?.revision || 0 : 0,
        coverUrl: $('olm-coverUrl').value, removeCover: $('olm-remove-cover').checked,
        learningAreaRefs: selectedAreaRefs(),
        subjectRef: $('olm-subject').value, moduleRef: $('olm-module').value };
      if (isNew || saved.get(book?.id)?.kind === 'LINK') {
        body.kind = 'LINK';
        body.resourceType = 'OTHER';
        body.linkUrl = $('olm-linkUrl').value;
        body.active = $('olm-active').checked;
      } else body.resourceType = $('olm-category').value;
      for (const field of fields) body[field] = $(`olm-${field}`).value;
      const result = await api('save', body, pastedCoverFile || $('olm-cover-file').files?.[0] || null);
      saved.set(result.record.id, result.record);
      if (isNew) {
        const added = { id: result.record.id, title: result.record.title,
          source: 'Academy · Other', coverUrl: result.record.coverUrl || '' };
        books.push(added);
      } else if (book && result.record.kind === 'LINK') {
        book.title = result.record.title;
        book.coverUrl = result.record.coverUrl || '';
      }
      $('olm-search').value = '';
      refreshBookChoices(result.record.id);
      status.textContent = 'Resource saved. It will appear in the public and assigned Libraries when refreshed.';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });

  void start();
})();

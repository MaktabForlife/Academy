(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fields = ['title', 'author', 'description'];
  const status = $('olm-status');
  const v2=()=>window.M4L_ACADEMY_AUTH?.selected===true;
  const token = v2()?true:localStorage.getItem('m4l_account_token');
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
  let client=null,protectedForm=null,protectedReady=false,editorEpoch=0,editingId='',baseRevision=0,checkpoint=Promise.resolve(),loadingForm=null,publicProof=null;
  const clone=value=>structuredClone(value),linkId=id=>typeof id==='string'&&/^EXTERNAL:ACADEMY_LINK:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),initialId=v2()?new URL(location.href).searchParams.get('resource'):null;let initialSelection=typeof initialId==='string'&&(/^(?:EXTERNAL:INTERNET_ARCHIVE:[A-Za-z0-9_.:-]{1,220}|EXTERNAL:ACADEMY_LINK:[0-9a-f-]{36})$/.test(initialId))?initialId:'';
  const privateRoots=()=>[$('olm-form'),$('olm-browser'),$('olm-add')].filter(Boolean);
  async function nativeClient(){if(!client){client=await window.M4L_ACADEMY_AUTH.ready;privateRoots().forEach(root=>client.registerPrivateRoot(root));}return client;}
  function captureMetadata(){return {...Object.fromEntries(fields.map(k=>[k,$('olm-'+k).value])),coverUrl:$('olm-coverUrl').value,removeCover:$('olm-remove-cover').checked,learningAreaRefs:selectedAreaRefs(),subjectRef:$('olm-subject').value,moduleRef:$('olm-module').value,linkUrl:$('olm-linkUrl').value,active:$('olm-active').checked,resourceType:isNew||saved.get(editingId)?.kind==='LINK'?'OTHER':$('olm-category').value};}
  function restoreMetadata(value){for(const k of fields)$('olm-'+k).value=typeof value?.[k]==='string'?value[k]:'';for(const k of ['coverUrl','linkUrl'])$('olm-'+k).value=typeof value?.[k]==='string'?value[k]:'';$('olm-remove-cover').checked=value?.removeCover===true;$('olm-active').checked=value?.active!==false;$('olm-subject').value=taxonomy.subjects.some(r=>r.id===value?.subjectRef)?value.subjectRef:'';showModules(value?.moduleRef);const refs=new Set(value?.learningAreaRefs||[]);for(const box of areaBoxes)box.checked=refs.has(box.value);if(!isNew&&saved.get(editingId)?.kind!=='LINK'&&['EBOOK','PRINTABLE','AUDIO','VIDEO'].includes(value?.resourceType))$('olm-category').value=value.resourceType;resourceDirty=true;updateAreaSummary();showCover();}
  function rememberMetadata(){if(!v2()||!protectedForm)return;const controller=protectedForm,value=captureMetadata();checkpoint=checkpoint.then(()=>controller.checkpoint(value)).catch(error=>{status.textContent=error.message;$('olm-form').style.visibility='hidden';$('olm-form').inert=true;throw error;});checkpoint.catch(()=>{});}
  function discardFileMemory(){pastedCoverFile=null;$('olm-cover-file').value='';if(localCoverPreview)URL.revokeObjectURL(localCoverPreview);localCoverPreview='';$('olm-cover-preview').removeAttribute('src');$('olm-cover-preview').hidden=true;}
  async function prepareMetadata(id){
    const generation=++editorEpoch,c=await nativeClient();protectedReady=false;$('olm-form').style.visibility='hidden';$('olm-form').inert=true;await checkpoint;protectedForm?.dispose();protectedForm=null;editingId=id;
    const url=new URL(location.href);url.searchParams.set('resource',id);history.replaceState(history.state,'',url.href);
    await c.prepareBusiness();const readCurrent=async()=>{await c.prepareBusiness();return api('get',{resourceId:id});},current=await readCurrent();if(generation!==editorEpoch)return;
    function applyCurrent(dto){if(!c.isCurrentResult(dto))throw Error('Check the current Library session.');if(dto.record){saved.set(id,dto.record);if(!books.some(b=>b.id===id))books.push({id,title:dto.record.title,source:'Academy',resourceType:dto.record.resourceType||'OTHER'});if(![...$('olm-book').options].some(o=>o.value===id))$('olm-book').append(option(id,dto.record.title||'Library resource'));$('olm-book').value=id;showBookFields();}else if(id.startsWith('EXTERNAL:INTERNET_ARCHIVE:')){if(!books.some(book=>book.id===id))throw Error('The public catalogue must confirm this Archive resource before it can be reopened. Its encrypted draft remains retained.');$('olm-book').value=id;showBookFields();}else{showNewFields();editingId=id;}baseRevision=dto.record?.revision||0;resourceDirty=false;}
    applyCurrent(current);const {createAcademyNativeForm}=await import('/js/m4l-v111-editor.mjs');if(generation!==editorEpoch)return;
    $('olm-form').style.visibility='';$('olm-form').inert=false;protectedForm=await createAcademyNativeForm({client:c,resource:{type:'academy-open-library-metadata',resourceId:id},roots:[$('olm-form')],host:$('olm-form').parentElement,status:text=>status.textContent=text,capture:captureMetadata,baseVersion:()=>baseRevision,isDirty:()=>resourceDirty,readCurrent,applyRetained:restoreMetadata,applyCurrent});
    await protectedForm.open(current);if(generation!==editorEpoch)return;protectedReady=true;publicProof=current;c.revealResult(current,{roots:[$('olm-browser'),$('olm-add')]});
  }
  function scheduleMetadata(id){loadingForm=prepareMetadata(id).catch(error=>{status.textContent=error.message;protectedReady=false;});}
  function showNew(){if(!v2())return showNewFields();editorTouched=true;const id=initialSelection||'EXTERNAL:ACADEMY_LINK:'+crypto.randomUUID();initialSelection='';showNewFields();scheduleMetadata(id);}
  function showBook(){if(!v2())return showBookFields();initialSelection='';const id=$('olm-book').value;if(!id)return;scheduleMetadata(id);}
  const alphabet = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  const readableTitle=value=>typeof value==='string'&&!/^EXTERNAL:/i.test(value.trim())?value.trim():'';
  const resourceTitle = book => window.M4L_LIBRARY_TITLES?.title(book,saved.get(book.id)?.title) || readableTitle(saved.get(book.id)?.title) || readableTitle(book.title) || 'Untitled resource';
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

  function showNewFields() {
    isNew = true;
    resourceDirty = false;
    $('olm-editor-title').textContent = 'Add a resource';
    $('olm-form').hidden = false;
    $('olm-link-fields').hidden = false;
    $('olm-category-wrap').hidden = true;
    $('olm-search').value = '';
    $('olm-book').replaceChildren(option('', 'Select a resource to edit'), ...books.map(book =>
      option(book.id, resourceTitle(book))));
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
    if(v2()){const c=await nativeClient(),path='/api/academy/open-library/metadata/'+action,headers={'X-Academy-Workspace':'ADMIN'};if(!file)return c.request(path,body,{headers});const form=new FormData();form.append('details',JSON.stringify(body));form.append('cover',file);const response=await c.protectedFetch(path,{method:'POST',headers,body:form}),value=await response.json();if(!response.ok||value.success===false)throw Error('The Library save could not be confirmed. Read current details before saving again.');return c.trackResult(value,response);}
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

  function showBookFields() {
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
    $('olm-source').textContent = `${book.source} · ${resourceTitle(book)}${book.volumes ? ` · ${book.volumes.length} volumes` : ''}`;
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
      option(book.id, resourceTitle(book))) :
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
    if(v2()){try{const c=await nativeClient();await c.ensureFresh();await c.prepareBusiness();}catch(error){status.textContent=error.message;return;}}
    if (!token) {
      status.textContent = 'Sign in through your Academy account to manage books.';
      return;
    }
    try {
      const archivePending=fetch('/academy/open-library/catalogue',typeof AbortSignal!=='undefined'&&AbortSignal.timeout?{signal:AbortSignal.timeout(12000)}:{}).then(async response=>response.ok?(await response.json()).books||[]:[]).catch(()=>[]);
      const [metadata, options] = await Promise.all([api('list'), api('options')]);if(v2()&&(!client.isCurrentResult(metadata)||!client.isCurrentResult(options)))throw new DOMException('The Library session changed.','AbortError');publicProof=options;
      saved = new Map((Array.isArray(metadata.records) ? metadata.records : []).map(record => [record.id, record]));
      const savedBooks=()=>[...saved.values()].map(record=>({id:record.id,title:resourceTitle(record),source:'Academy',resourceType:record.resourceType||'OTHER',coverUrl:record.coverUrl||''}));
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
      if(v2()&&initialSelection?.startsWith('EXTERNAL:INTERNET_ARCHIVE:')&&!saved.has(initialSelection)){const actualBooks=await archivePending;if(!client.isCurrentResult(metadata)||!client.isCurrentResult(options))return;const actual=actualBooks.find(book=>book.id===initialSelection);if(actual)books.push(actual);else{initialSelection='';$('olm-form').hidden=true;renderResourceBoard();client.revealResult(options,{roots:[$('olm-browser'),$('olm-add')]});status.textContent='The public catalogue must confirm the selected Archive resource before it can be reopened. Its encrypted draft remains retained. Saved resources and new links are still available.';return;}}if(initialSelection&&linkId(initialSelection)&&!saved.has(initialSelection))showNew();else if(books.length)refreshBookChoices(initialSelection||$('olm-book').value);else showNew();if(v2())client.revealResult(options,{roots:[$('olm-browser'),$('olm-add')]});
      status.textContent='Editor ready. Loading resources…';
      const archiveBooks=await archivePending;if(v2()&&(!client.isCurrentResult(metadata)||!client.isCurrentResult(options)))return;
      window.M4L_LIBRARY_TITLES?.remember(archiveBooks);
      books=[...archiveBooks,...savedBooks().filter(book=>!archiveBooks.some(source=>source.id===book.id))];
      if(books.length)refreshBookChoices($('olm-book').value,editorTouched);
      else if(!editorTouched)showNew();
      if(status.textContent==='Editor ready. Loading resources…')status.textContent=archiveBooks.length?'Editor ready.':'Editor ready. The external catalogue is temporarily unavailable; saved resources and new links remain editable.';
    } catch (error) { status.textContent = error.message; }
  }

  $('olm-form').addEventListener('input',()=>{editorTouched=true;resourceDirty=true;rememberMetadata();});
  $('olm-form').addEventListener('change',()=>{editorTouched=true;resourceDirty=true;queueMicrotask(rememberMetadata);});
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
    let attempt;try {
      if(v2()&&(!protectedForm||!protectedReady))throw Error('Check this protected Library editor before saving.');
      const body = { ...(v2()?{id:editingId,creating:isNew,operationId:crypto.randomUUID()}:(book ? { id: book.id } : {})), baseRevision: v2()?baseRevision:book ? saved.get(book.id)?.revision || 0 : 0,
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
      const selectedCover=pastedCoverFile||$('olm-cover-file').files?.[0]||null;
      if(v2()){await checkpoint;attempt=await protectedForm.beforeMutation({action:'save',input:body},{sensitive:true});}
      let result = await api('save', body, selectedCover);if(v2()){result=await protectedForm.completeNativeMutation(attempt,result,{operationId:body.operationId});resourceDirty=false;await protectedForm.saved();discardFileMemory();}
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
    } catch (error) { status.textContent = error.message;if(v2()&&attempt){protectedReady=false;await protectedForm.unknown(attempt);protectedReady=true;} }
    finally { button.disabled = false; }
  });

  window.addEventListener('academy-v2-mask',event=>{if(v2()&&event.detail?.masked!==false){discardFileMemory();if(client)for(const root of privateRoots()){root.style.visibility='hidden';root.inert=true;}}});
  window.addEventListener('m4l-academy-session-ended',()=>{if(!v2())return;editorEpoch++;protectedForm?.dispose();protectedForm=null;protectedReady=false;saved.clear();books=[];for(const name of fields)$('olm-'+name).value='';discardFileMemory();$('olm-form').hidden=true;$('olm-resource-board').replaceChildren();status.textContent='Sign in again to manage Library details.';});
  window.addEventListener('academy-v2-revalidate',()=>{if(!v2()||!client)return;if(protectedForm)void protectedForm.revalidate().then(value=>{protectedReady=true;publicProof=value;client.revealResult(value,{roots:[$('olm-browser'),$('olm-add')]});}).catch(error=>status.textContent=error.message);});
  window.addEventListener('beforeunload',event=>{if(v2()&&resourceDirty){event.preventDefault();event.returnValue='';}});
  void start();
})();

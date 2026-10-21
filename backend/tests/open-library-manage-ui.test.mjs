import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

function element() {
  const listeners = {};
  return { listeners, value: '', textContent: '', hidden: false, checked: false, disabled: false, dataset: {},
    files: [], children: [], addEventListener(name, fn) { listeners[name] = fn; },
    setAttribute(name, value) { this[name] = value; }, focus() {}, scrollIntoView() {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; if (!children.some(item => item.value === this.value)) this.value = children[0]?.value || ''; } };
}
const ids = ['olm-browser','olm-resource-board','olm-resource-count','olm-previous','olm-next','olm-editor-title','olm-status', 'olm-form', 'olm-add', 'olm-search', 'olm-book', 'olm-source', 'olm-link-fields', 'olm-category-wrap', 'olm-category', 'olm-linkUrl', 'olm-active', 'olm-title', 'olm-subject', 'olm-module',
  'olm-learning-area-summary', 'olm-learning-areas-list', 'olm-author', 'olm-description', 'olm-coverUrl', 'olm-cover-file', 'olm-cover-paste',
  'olm-remove-cover', 'olm-cover-preview', 'olm-save'];
const nodes = Object.fromEntries(ids.map(id => [id, element()]));
nodes['olm-form'].hidden = true;
const documentListeners = {};
const document = { getElementById: id => nodes[id], createElement: () => element(), createTextNode: text => ({ textContent: text }),
  addEventListener(name, fn) { documentListeners[name] = fn; } };
const id = 'EXTERNAL:INTERNET_ARCHIVE:BOOK1';
const linkId = 'EXTERNAL:ACADEMY_LINK:12345678-1234-1234-1234-123456789abc';
const apiBase = 'https://worker.test';
let savedBody, savedCover;
const fetch = async (url, init) => {
  if (url.endsWith('/metadata/list')) return { ok: true, json: async () => ({ success: true, records: [] }) };
  if (url.endsWith('/metadata/options')) return { ok: true, json: async () => ({ success: true,
    subjects: [{ id: 'ACADEMY:S1', name: 'Fiqh', source: 'Academy' },
      { id: 'GLOBAL:S2', name: 'Quran', source: 'Global Subject' }],
    modules: [{ id: 'PROGRAM:P1:M1', subjectId: 'ACADEMY:S1', name: 'Salah', source: 'Program' },
      { id: 'GLOBAL:M2', subjectId: 'GLOBAL:S2', name: 'Recitation', source: 'Global Subject' }],
    learningAreas: [{ id: 'PROGRAM:P1', name: 'Program One', source: 'Program' },
      { id: 'GLOBAL:S2', name: 'Quran', source: 'Course' }] }) };
  if (url === '/academy/open-library/catalogue') return { ok: true, json: async () => ({ books: [
    { id, source: 'Internet Archive', title: 'Book', subject: 'Books', resourceType: 'EBOOK', coverUrl: '' },
    { id: 'EXTERNAL:INTERNET_ARCHIVE:BOOK2', source: 'Internet Archive', title: 'Second book',
      subject: 'Hadith', resourceType: 'EBOOK', coverUrl: '' }
  ] }) };
  if (url.endsWith('/metadata/save')) {
    savedBody = init.body instanceof FormData ? JSON.parse(init.body.get('details')) : JSON.parse(init.body);
    savedCover = init.body instanceof FormData ? init.body.get('cover') : null;
    return { ok: true, json: async () => ({ success: true, record: {
      ...savedBody, id: savedBody.id || linkId, revision: 1, hasUploadedCover: Boolean(savedCover)
    } }) };
  }
  throw new Error(`Unexpected request: ${url}`);
};
const source = await readFile(new URL('../../js/m4l-open-library-manage.js', import.meta.url), 'utf8');
const browserWindow = { M4L_CONFIG: { API_BASE: apiBase }, addEventListener() {}, confirm: () => true };
runInNewContext(source, { document, window: browserWindow,
  localStorage: { getItem: () => 'token' }, fetch, FormData, URL: {
    createObjectURL: () => 'blob:cover', revokeObjectURL() {} } });
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(nodes['olm-category'].children.map(item => item.value), ['EBOOK', 'PRINTABLE']);
let enterPrevented = false;
nodes['olm-search'].listeners.keydown({ key: 'Enter', preventDefault() { enterPrevented = true; } });
assert.equal(enterPrevented, true, 'Searching cannot submit the edit form');
nodes['olm-search'].value = 'second';
nodes['olm-search'].listeners.input();
const choices = () => nodes['olm-resource-board'].children.flatMap(section => section.children[1].children.map(row => row.children[0]).filter(Boolean));
assert.deepEqual(choices().map(button => button.dataset.resourceId), ['EXTERNAL:INTERNET_ARCHIVE:BOOK2']);
assert.equal(nodes['olm-book'].value, id, 'Filtering does not replace the resource being edited');
choices()[0].listeners.click();
assert.equal(nodes['olm-book'].value, 'EXTERNAL:INTERNET_ARCHIVE:BOOK2');
nodes['olm-search'].value = 'not in this catalogue';
nodes['olm-search'].listeners.input();
assert.equal(choices().length, 0);
assert.equal(nodes['olm-book'].value, 'EXTERNAL:INTERNET_ARCHIVE:BOOK2');
assert.equal(nodes['olm-save'].disabled, false, 'The explicitly opened editor remains usable when a search has no matches');
assert.equal(savedBody, undefined, 'Searching never submits the edit form');
nodes['olm-search'].value = 'books';
nodes['olm-search'].listeners.input();
choices()[0].listeners.click();
assert.equal(nodes['olm-book'].value, id);
assert.equal(nodes['olm-save'].disabled, false);
nodes['olm-category'].value = 'PRINTABLE';
assert.equal(nodes['olm-subject'].children.length, 3);
assert.equal(nodes['olm-module'].disabled, true);
assert.equal(nodes['olm-learning-areas-list'].children.length, 2);
for (const label of nodes['olm-learning-areas-list'].children) label.children[0].checked = true;
nodes['olm-learning-areas-list'].listeners.change();
assert.equal(nodes['olm-learning-area-summary'].textContent, '2 learning areas selected');
assert.deepEqual(nodes['olm-subject'].children.map(item => item.value), ['', 'ACADEMY:S1', 'GLOBAL:S2']);
nodes['olm-subject'].value = 'ACADEMY:S1';
nodes['olm-subject'].listeners.change();
assert.deepEqual(nodes['olm-module'].children.map(item => item.value), ['', 'PROGRAM:P1:M1']);
nodes['olm-module'].value = 'PROGRAM:P1:M1';
const cover = new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: 'image/png' });
documentListeners.paste({ clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => cover }] },
  preventDefault() {} });
assert.equal(nodes['olm-cover-preview'].src, 'blob:cover');
await nodes['olm-form'].listeners.submit({ preventDefault() {} });
assert.equal(savedBody.subjectRef, 'ACADEMY:S1');
assert.equal(savedBody.moduleRef, 'PROGRAM:P1:M1');
assert.equal(savedBody.resourceType, 'PRINTABLE');
assert.deepEqual(savedBody.learningAreaRefs, ['PROGRAM:P1', 'GLOBAL:S2']);
assert.equal(savedCover.size, cover.size);
nodes['olm-add'].listeners.click();
assert.equal(nodes['olm-link-fields'].hidden, false);
nodes['olm-title'].value = 'Helpful website';
nodes['olm-subject'].value = 'ACADEMY:S1';
nodes['olm-linkUrl'].value = 'https://example.org/learning';
nodes['olm-active'].checked = true;
await nodes['olm-form'].listeners.submit({ preventDefault() {} });
assert.equal(savedBody.kind, 'LINK');
assert.equal(savedBody.resourceType, 'OTHER');
assert.equal(savedBody.id, undefined, 'New resource IDs are generated by the server');
assert.equal(savedBody.linkUrl, 'https://example.org/learning');
assert.equal(nodes['olm-book'].value, linkId);
assert.deepEqual(nodes['olm-resource-board'].children.map(section => section.children[0].children[0].textContent), ['Uncategorised', 'Fiqh']);
assert.equal(nodes['olm-resource-board'].children[1].children[1].children[0].children[0].children[0].textContent, 'Book');
console.log('Open Library editor allows multiple independent learning areas and saves a pasted cover.');

// A slow external catalogue must not keep the authorised editor locked, or
// overwrite a new resource the user starts entering while it loads.
const delayedNodes=Object.fromEntries(ids.map(id=>[id,element()]));delayedNodes['olm-form'].hidden=true;
let releaseCatalogue;
const delayedFetch=async(url,init)=>url==='/academy/open-library/catalogue'?new Promise(resolve=>{releaseCatalogue=()=>resolve({ok:true,json:async()=>({books:[{id,source:'Internet Archive',title:'Book',resourceType:'EBOOK'}]})});}):fetch(url,init);
runInNewContext(source,{document:{...document,getElementById:id=>delayedNodes[id]},window:browserWindow,localStorage:{getItem:()=>'token'},fetch:delayedFetch,FormData,URL:{createObjectURL:()=>'',revokeObjectURL(){}}});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(delayedNodes['olm-form'].hidden,false);assert.equal(delayedNodes['olm-add'].hidden,false);assert.match(delayedNodes['olm-status'].textContent,/Editor ready/);
delayedNodes['olm-title'].value='My unsaved resource';delayedNodes['olm-form'].listeners.input();releaseCatalogue();await new Promise(resolve=>setImmediate(resolve));
assert.equal(delayedNodes['olm-title'].value,'My unsaved resource','Loading the catalogue cannot erase a user’s draft');
console.log('Open Library access unlocks before a slow catalogue and preserves edits.');

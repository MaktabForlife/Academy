import {createAcademyNativeForm} from './m4l-v111-editor.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&![...u.searchParams.keys(),...new URLSearchParams(u.hash.slice(1)).keys(),...new URLSearchParams(u.hash.includes('?')?u.hash.slice(u.hash.indexOf('?')+1):'').keys()].some(k=>/^(?:access_token|id_token|refresh_token|client_secret|password|api_key|authorization)$/i.test(k));}catch{return false;}};
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function mountPersonalLinks(){
 const nav=document.querySelector('.al-tabs');if(!nav)return;nav.classList.add('al-personal-tabs');
 const tab=document.createElement('button');tab.type='button';tab.className='button secondary';tab.textContent='My links';tab.hidden=true;nav.append(tab);
 const host=document.createElement('section');host.id='personal-links';host.className='card card-pad pl-panel';host.hidden=true;nav.after(host);
 const client=await window.M4L_ACADEMY_AUTH.ready;await client.ensureFresh();let owner=client.ownerKey(),data=null,form=null,dirty=false,pending=false,actionBusy=false,version=0,checkpoint=Promise.resolve(),epoch=0;const urls=new Set(),disabledBefore=new WeakMap();
 function busyControls(on){for(const node of host.querySelectorAll('input,textarea,button')){if(on){if(!disabledBefore.has(node))disabledBefore.set(node,node.disabled);node.disabled=true;}else if(disabledBefore.has(node)){node.disabled=disabledBefore.get(node);disabledBefore.delete(node);}}}
 client.registerPrivateRoot(host);
 const current=()=>{if(owner!==client.ownerKey())throw new DOMException('The Academy account changed.','AbortError');};
 const message=text=>{const p=host.querySelector('[data-message]');if(p)p.textContent=text;};
 const entry=()=>{const f=host.querySelector('form');return f?Object.fromEntries(['id','title','url','description'].map(k=>[k,f.elements[k].value])):{id:'',title:'',url:'',description:''};};
 const capture=()=>{const e=entry(),valid=!e.url||safeURL(e.url);return {entry:{...e,url:valid?e.url:''},requiresUrlReentry:!valid};};
 const applyRetained=value=>{const f=host.querySelector('form');if(!f||!value?.entry)return;for(const k of ['id','title','url','description'])f.elements[k].value=value.entry[k]||'';dirty=true;if(value.requiresUrlReentry)message('Re-enter a secure link without sign-in credentials. Such URLs are not retained.');};
 async function api(action,input={}){const run=epoch;current();await client.ensureFresh();const result=await client.request('/api/academy/my-links/'+action,input,{headers:{'X-Academy-Workspace':'LEARN'}});if(run!==epoch||!client.isCurrentResult(result))throw new DOMException('The My links view changed.','AbortError');current();return result;}
 async function read(){current();await client.prepareBusiness({activeWork:false});return api('list');}
 async function apply(value){data=value;version=await digest(value.revision);current();dirty=false;if(!actionBusy)pending=false;render();if(actionBusy)busyControls(true);}
 async function recovery(value){if(!form)form=await createAcademyNativeForm({client,resource:{type:'academy-personal-links'},roots:[host],host:document.body,doc:document,capture,baseVersion:()=>version,isDirty:()=>dirty||pending,applyRetained,applyCurrent:apply,readCurrent:read,status:message});if(value)await form.open(value);return form;}
 function saveDraft(){if(!form)return;checkpoint=checkpoint.then(()=>form?.checkpoint()).catch(error=>message(error.message));}
 function show(open){host.hidden=!open;host.parentElement.toggleAttribute('data-personal-links-open',open);tab.setAttribute('aria-pressed',String(open));}
 async function save(links){if(pending){message('Review the previous save before making another change.');return;}const run=epoch;let attempt;pending=true;actionBusy=true;busyControls(true);
  try{current();await client.ensureFresh();await client.prepareSensitive({activeWork:true});const r=await recovery();await checkpoint;if(run!==epoch)throw Error('The My links owner changed.');const operationId=crypto.randomUUID();attempt=await r.beforeMutation({operationId,kind:'personal-links'},{sensitive:true});let result=await api('save',{links,revision:data.revision,operationId});result=await r.completeNativeMutation(attempt,result,{operationId});await apply(result);await r.saved();r.reveal(result);message('Saved.');}
  catch(error){message(error.message);if(attempt){try{await form.unknown(attempt);}catch(recoveryError){message(recoveryError.message);}}}
  finally{pending=false;actionBusy=false;busyControls(false);}
 }
 function render(){host.innerHTML='<h2>My links</h2><p>Private links for your own use. The provider controls access to linked documents.</p><p data-message role="status"></p><ul>'+data.links.map(link=>'<li><a href="'+esc(link.url)+'" target="_blank" rel="noopener noreferrer">'+esc(link.title)+'</a> '+esc(link.description)+' <button type="button" data-edit="'+esc(link.id)+'">Edit</button><button type="button" data-remove="'+esc(link.id)+'">Remove</button></li>').join('')+'</ul><form><input type="hidden" name="id"><label>Title<input name="title" maxlength="180" required></label><label>Website or document link<input name="url" type="url" maxlength="2048" required></label><label>Description<textarea name="description" maxlength="1000"></textarea></label><button>Save link</button><button type="reset">Cancel edit</button></form><div class="workspace-actions"><button type="button" data-export>Export my links</button><button type="button" data-refresh>Refresh</button></div>';
  const f=host.querySelector('form');f.oninput=()=>{dirty=true;saveDraft();};f.onreset=()=>{if(pending)return;dirty=false;queueMicrotask(()=>{f.elements.id.value='';saveDraft();});};
  f.onsubmit=event=>{event.preventDefault();if(pending)return;const e=entry();if(!safeURL(e.url)){message('Enter a secure link without sign-in credentials.');return;}e.id||=crypto.randomUUID();const links=data.links.map(x=>({...x})),index=links.findIndex(x=>x.id===e.id);if(index<0)links.push(e);else links[index]=e;void save(links);};
  for(const b of host.querySelectorAll('[data-edit]'))b.onclick=()=>{if(pending)return;const e=data.links.find(x=>x.id===b.dataset.edit);applyRetained({entry:e});saveDraft();};
  for(const b of host.querySelectorAll('[data-remove]'))b.onclick=()=>{if(!pending&&confirm('Remove this personal link?'))void save(data.links.filter(x=>x.id!==b.dataset.remove));};
  host.querySelector('[data-refresh]').onclick=()=>{if(!pending&&(!dirty||confirm('Discard unsaved link edits?')))void load();};
  host.querySelector('[data-export]').onclick=async()=>{try{current();await client.prepareBusiness({activeWork:false});const value=await api('export');current();const url=URL.createObjectURL(new Blob([JSON.stringify({links:value.links},null,2)],{type:'application/json'}));urls.add(url);const a=document.createElement('a');a.href=url;a.download='my-links.json';a.click();setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},30000);}catch(error){message(error.message);}};
 }
 async function load(){try{const value=await read();await apply(value);tab.hidden=false;if(new URLSearchParams(location.search).get('view')==='my-links')show(true);await recovery(value);}catch(error){if(!host.hidden)message(error.message);}}
 tab.onclick=()=>{if(pending)return;show(host.hidden);if(!host.hidden&&!data)void load();};
 window.addEventListener('academy-v2-context',()=>{const next=client.ownerKey();if(next===owner)return;epoch++;form?.dispose();form=null;owner=next;data=null;dirty=false;pending=false;host.replaceChildren();tab.hidden=true;show(false);for(const url of urls)URL.revokeObjectURL(url);urls.clear();});
 window.addEventListener('academy-v2-mask',event=>{if(event.detail?.masked)for(const url of urls)URL.revokeObjectURL(url);});
 window.addEventListener('academy-v2-revalidate',()=>{if(!pending)void (form?form.revalidate():load()).catch(error=>message(error.message));});
 window.addEventListener('beforeunload',event=>{if(dirty||pending){event.preventDefault();event.returnValue='';}});
 await load();
}

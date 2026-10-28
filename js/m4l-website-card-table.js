/* Staged Program website cards: one explicit save for the complete table. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const copy=v=>JSON.parse(JSON.stringify(v));
 const hasPdf=id=>['foundations','yaseen','saffat','ankabut','luqman','muzammil','qasas','sajdah'].includes(id);
 const appearance=row=>row.appearance||(row.image?'upload':'plain');
 const picture=(row,urls)=>appearance(row)==='pdf'&&hasPdf(row.id)?'/academy/learning-images/tafseer-cards/'+row.id+'.jpg':appearance(row)==='upload'?(urls.get(row.id)||row.image?.url||''):'';
 window.M4L_WEBSITE_CARD_TABLE={mount({host,onSave,onChange=()=>{}}){
  let owner='',base=[],rows=[],files=new Map(),urls=new Map(),disabled=false,saving=false,epoch=0;
  const dirty=()=>files.size>0||JSON.stringify(rows)!==JSON.stringify(base);
  const notify=(message,error=false)=>{const el=host.querySelector('[data-wct-message]');if(el){el.textContent=message;el.setAttribute('role',error?'alert':'status');}};
  function release(){for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();files.clear();}
  function controls(){
   for(const el of host.querySelectorAll('input,textarea,select,button'))el.disabled=disabled||saving;
   for(const el of host.querySelectorAll('[data-wct-action="save"],[data-wct-action="discard"]'))el.disabled=disabled||saving||!dirty();
   const state=host.querySelector('[data-wct-state]');if(state)state.textContent=saving?'Saving the table…':dirty()?'Unsaved table changes':'All card changes saved';
  }
  function render(){
   host.innerHTML=`<p class="wct-help">Edit the card text, choose an optional picture and customise the access popup. The table is shared by the website and dashboards.</p><div class="wct-toolbar"><button type="button" data-wct-action="add">Add card</button>${!rows.length?'<button type="button" class="pb-secondary" data-wct-action="template">Use Tafseer cards</button>':''}</div><div class="wct-scroll" tabindex="0" role="region" aria-label="Surah website cards"><table class="wct-table"><thead><tr><th scope="col">Card title &amp; summary</th><th scope="col">Image</th><th scope="col">Contact Admin popup</th><th scope="col">Display</th></tr></thead><tbody>${rows.map((r,i)=>`<tr data-wct-row="${i}"><td><label>Title<input data-wct-field="title" maxlength="160" value="${esc(r.title)}"></label><label>Arabic heading<input data-wct-field="arabic" dir="auto" maxlength="160" value="${esc(r.arabic)}"></label><label>Summary<textarea data-wct-field="summary" maxlength="700" rows="4">${esc(r.summary)}</textarea></label><small>Reference: ${esc(r.id)}</small></td><td><label>Card style<select data-wct-field="appearance">${[['plain','Plain (default)'],...(hasPdf(r.id)?[['pdf','PDF artwork']]:[]),['upload','Uploaded image']].map(([value,label])=>`<option value="${value}"${appearance(r)===value?' selected':''}>${label}</option>`).join('')}</select></label>${picture(r,urls)?`<img class="wct-image" src="${esc(picture(r,urls))}" alt="${esc(r.image?.alt||r.title)}">`:''}<label class="wct-upload">${r.image?'Replace':'Upload'} image<input data-wct-file type="file" accept="image/png,image/jpeg,image/webp"></label><label>Image description<input data-wct-field="imageAlt" maxlength="240" value="${esc(r.image?.alt||'')}" placeholder="Describe the picture"></label>${r.image?'<button type="button" class="pb-secondary" data-wct-action="remove-image">Remove image</button>':''}<small>PNG, JPEG or WebP · up to 5 MB</small></td><td><label>Popup message<textarea data-wct-field="contactMessage" maxlength="700" rows="5">${esc(r.contactMessage)}</textarea></label>${r.id==='foundations'?'<small>Open to all · no access popup</small>':'<small>Shown to visitors and users without access.</small>'}</td><td><label>Text colour<select data-wct-field="textTone"><option value="dark"${r.textTone!=='light'?' selected':''}>Dark (default)</option><option value="light"${r.textTone==='light'?' selected':''}>Light</option></select></label><label>Colour<select data-wct-field="tone">${['plum','rose','sage','gold'].map(t=>`<option${r.tone===t?' selected':''}>${t}</option>`).join('')}</select></label><label class="wct-check"><input type="checkbox" data-wct-field="visible"${r.visible?' checked':''}${r.id==='foundations'?' data-wct-fixed':''}> Show card</label><div class="wct-order"><button type="button" class="pb-secondary" data-wct-action="up" aria-label="Move ${esc(r.title)} up">↑</button><button type="button" class="pb-secondary" data-wct-action="down" aria-label="Move ${esc(r.title)} down">↓</button></div></td></tr>`).join('')||'<tr><td colspan="4">Add a card, or start with the Tafseer card summaries.</td></tr>'}</tbody></table></div><div class="wct-toolbar"><button type="button" data-wct-action="save">Save table</button><button type="button" class="pb-secondary" data-wct-action="discard">Discard changes</button><small data-wct-state role="status"></small></div><p data-wct-message role="status" aria-live="polite"></p>`;
   controls();
  }
  function changed(){onChange();controls();}
  host.addEventListener('input',event=>{
   const field=event.target.dataset.wctField,index=event.target.closest('[data-wct-row]')?.dataset.wctRow,row=rows[index];if(!row||!field||disabled||saving)return;
   if(field==='visible'){if(row.id!=='foundations')row.visible=event.target.checked;else event.target.checked=true;}
   else if(field==='imageAlt'){if(row.image)row.image.alt=event.target.value;}
   else row[field]=event.target.value;
   if(field==='appearance')render();
   changed();
  });
  host.addEventListener('change',event=>{
   const file=event.target.files?.[0],index=event.target.closest('[data-wct-row]')?.dataset.wctRow,row=rows[index];if(!event.target.hasAttribute('data-wct-file')||!file||!row||disabled||saving)return;
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){notify('Choose a PNG, JPEG or WebP image up to 5 MB.',true);event.target.value='';return;}
   if(urls.has(row.id))URL.revokeObjectURL(urls.get(row.id));urls.set(row.id,URL.createObjectURL(file));files.set(row.id,file);row.appearance='upload';row.image={type:file.type,size:file.size,alt:row.image?.alt||row.title};render();changed();
  });
  host.addEventListener('click',async event=>{
   const button=event.target.closest('[data-wct-action]');if(!button||disabled||saving)return;const action=button.dataset.wctAction,index=Number(button.closest('[data-wct-row]')?.dataset.wctRow),row=rows[index];
   if(action==='add'){if(rows.length>=160){notify('Keep up to 160 cards in this table.',true);return;}rows.push({id:'surah-'+crypto.randomUUID(),title:'New surah',arabic:'',summary:'',contactMessage:'Contact Admin to receive access.',tone:'plum',visible:false,appearance:'plain',image:null});render();host.querySelector('tbody tr:last-child input')?.focus();changed();}
   if(action==='template'){rows=copy(window.M4L_TAFSEER_CARDS?.defaults||window.M4L_TAFSEER_CARDS?.cards||[]).map(r=>({...r,contactMessage:r.contactMessage||'Contact Admin to receive access.',visible:true,appearance:'plain',image:null}));render();changed();}
   if(action==='discard'){epoch++;release();rows=copy(base);render();changed();}
   if(action==='remove-image'&&row){if(urls.has(row.id))URL.revokeObjectURL(urls.get(row.id));urls.delete(row.id);files.delete(row.id);row.image=null;row.appearance='plain';render();changed();}
   if((action==='up'||action==='down')&&row&&row.id!=='foundations'){
    const next=index+(action==='up'?-1:1);if(next>=0&&next<rows.length&&rows[next].id!=='foundations'){[rows[index],rows[next]]=[rows[next],rows[index]];render();changed();}
   }
   if(action==='save'&&dirty()){
    if(rows.some(r=>appearance(r)==='upload'&&!r.image)){notify('Upload an image or choose the plain card style.',true);return;}
    if(rows.some(r=>!r.title.trim()||!r.contactMessage.trim()||r.image&&!r.image.alt.trim())){notify('Enter a title, popup message and description for every uploaded image.',true);return;}
    const stamp=epoch;saving=true;controls();notify('Saving the card table…');
    try{const saved=await onSave(copy(rows),new Map(files));if(stamp!==epoch)return;base=copy(saved);rows=copy(saved);release();render();onChange();notify('Website card table saved.');}
    catch(error){if(stamp===epoch)notify(error.message||'The table could not be saved. Your edits are kept.',true);}
    finally{if(stamp===epoch){saving=false;controls();}}
   }
  });
  render();
  return {dirty,values:()=>copy(rows),sync(scope,value=[],locked=false){disabled=locked;if(scope!==owner){epoch++;owner=scope;saving=false;release();base=copy(value);rows=copy(value);render();}else if(!dirty()){base=copy(value);rows=copy(value);render();}else controls();},disable(value){disabled=value;controls();},reset(){epoch++;owner='';release();base=[];rows=[];saving=false;render();}};
 }};
})();

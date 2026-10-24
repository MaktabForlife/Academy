// Editable page combobox: arrow opens all pages; typing narrows the list.
export function createPagePicker({input,button,list,onSelect}){
 let total=0,current=1,open=false,active=-1,choices=[];
 const root=input.closest('.page-picker');
 function close(){open=false;list.hidden=true;input.setAttribute('aria-expanded','false');button.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
 function highlight(index){active=Math.max(0,Math.min(choices.length-1,index));for(const [i,option] of [...list.children].entries())option.classList.toggle('active',i===active);if(choices[active]){input.setAttribute('aria-activedescendant','pdf-page-option-'+choices[active]);list.children[active]?.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
 function show(filter=''){
  if(input.disabled||!total)return;open=true;choices=[];const fragment=document.createDocumentFragment();
  for(let page=1;page<=total;page++){if(filter&&!String(page).startsWith(filter))continue;choices.push(page);const option=document.createElement('div');option.id='pdf-page-option-'+page;option.setAttribute('role','option');option.setAttribute('aria-selected',String(page===current));option.dataset.page=String(page);option.textContent=String(page);fragment.append(option);}
  list.replaceChildren(fragment);list.hidden=false;input.setAttribute('aria-expanded','true');button.setAttribute('aria-expanded','true');highlight(Math.max(0,choices.indexOf(current)));
 }
 function choose(page){
  if(!Number.isInteger(page)||page<1||page>total){input.value=String(current);close();return;}
  const changed=page!==current;current=page;input.value=String(page);close();if(changed)void onSelect(page);
 }
 function commit(){const text=input.value.trim();choose(/^\d+$/.test(text)?Number(text):NaN);}
 button.onclick=()=>{if(open)close();else{show();input.focus({preventScroll:true});}};
 input.addEventListener('input',()=>show(input.value.trim()));input.addEventListener('change',commit);
 input.addEventListener('blur',()=>{commit();});
 input.addEventListener('keydown',event=>{
  if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();if(!open)show();else highlight(active+(event.key==='ArrowDown'?1:-1));}
  else if(event.key==='Enter'){event.preventDefault();if(open&&choices[active])choose(choices[active]);else commit();}
  else if(event.key==='Escape'){event.preventDefault();input.value=String(current);close();}
  else if(open&&['Home','End'].includes(event.key)){event.preventDefault();highlight(event.key==='Home'?0:choices.length-1);}
 });
 list.addEventListener('pointerdown',event=>event.preventDefault());list.addEventListener('click',event=>{const option=event.target.closest('[data-page]');if(option){choose(Number(option.dataset.page));input.focus({preventScroll:true});}});
 // Keep input focus when the dropdown button is pressed, avoiding a blur/close race.
 button.addEventListener('pointerdown',event=>event.preventDefault());
 document.addEventListener('pointerdown',event=>{if(!root.contains(event.target))close();});
 return {setPages(count,page){total=count;current=page;input.value=String(page);input.setAttribute('aria-label','Page number, 1 to '+count);close();},setDisabled(disabled){input.disabled=button.disabled=disabled;if(disabled)close();},close};
}

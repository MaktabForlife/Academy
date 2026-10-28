/* Browser-independent navigation shared by Academy pages and connected readers. */
(() => {
  'use strict';
  if(window.self!==window.top||window.M4L_ACADEMY_HISTORY)return;
  const storageKey='m4l_app_navigation_v1',markerKey='m4lAppNavigation';
  const nativeReplace=history.replaceState.bind(history),nativePush=history.pushState.bind(history);
  const load=()=>{try{const value=JSON.parse(sessionStorage.getItem(storageKey));return value&&typeof value.trace==='string'&&Number.isInteger(value.index)&&value.index>=0&&Number.isInteger(value.max)&&value.max>=value.index?value:null;}catch{return null;}};
  const fresh=()=>({trace:crypto.randomUUID(),index:0,max:0});
  let state=load()||fresh(),bar,owner=localStorage.getItem('m4l_account_token')||'';
  const save=()=>{try{sessionStorage.setItem(storageKey,JSON.stringify(state));}catch{/* Navigation still works without session storage. */}};
  const marked=data=>({...((data&&typeof data==='object'&&!Array.isArray(data))?data:{}),[markerKey]:{trace:state.trace,index:state.index}});
  function render(){
    if(!bar)return;
    bar.querySelector('[data-app-back]').disabled=state.index===0;
    bar.querySelector('[data-app-forward]').disabled=state.index>=state.max;
  }
  function sync(initial=false){
    const saved=load();if(saved?.trace===state.trace)state.max=Math.max(state.max,saved.max);
    const marker=history.state?.[markerKey];
    if(marker?.trace===state.trace&&Number.isInteger(marker.index)&&marker.index>=0){state.index=marker.index;state.max=Math.max(state.max,state.index);}
    else if(initial){
      let fromApp=false;try{fromApp=new URL(document.referrer).origin===location.origin;}catch{}
      if(!saved||!fromApp||history.length<=1)state=fresh();
      else {state.index++;state.max=state.index;}
    }else {state.index++;state.max=state.index;}
    nativeReplace(marked(history.state),'');save();render();
  }
  // Keep our small position marker when a router replaces its current address.
  history.replaceState=(data,title,url)=>{
    const marker=history.state?.[markerKey];if(marker?.trace===state.trace)state.index=marker.index;
    nativeReplace(marked(data),title,url);save();render();
  };
  history.pushState=(data,title,url)=>{
    state.index++;state.max=state.index;nativePush(marked(data),title,url);save();render();
  };
  sync(true);
  window.addEventListener('popstate',()=>sync());
  window.addEventListener('hashchange',()=>sync());
  window.addEventListener('pageshow',()=>sync());
  window.addEventListener('m4l-academy-access',render);
  function reset(){state=fresh();nativeReplace(marked(history.state),'');save();render();}
  window.addEventListener('m4l-academy-session-ended',reset);
  const accountChanged=()=>{const next=localStorage.getItem('m4l_account_token')||'';if(next!==owner){owner=next;reset();}};
  window.addEventListener('m4l-academy-session',accountChanged);
  window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)accountChanged();});
  function install(){
    const style=document.createElement('link');style.rel='stylesheet';style.href='/css/m4l-academy-history.css?v=107.118';document.head.append(style);
    bar=document.createElement('nav');bar.id='academy-app-navigation';bar.setAttribute('aria-label','Page navigation');
    const icon=path=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';
    bar.innerHTML='<button type="button" data-app-back aria-label="Go back" title="Back">'+icon('m14 5-7 7 7 7M7 12h14')+'<span>Back</span></button><button type="button" data-app-forward aria-label="Go forward" title="Forward">'+icon('m10 5 7 7-7 7M3 12h14')+'<span>Forward</span></button>';
    bar.querySelector('[data-app-back]').addEventListener('click',()=>{if(state.index>0)history.back();});
    bar.querySelector('[data-app-forward]').addEventListener('click',()=>{if(state.index<state.max)history.forward();});
    document.body.classList.add('academy-has-app-navigation');
    const phone=matchMedia('(max-width:767px)');
    let tabs,slot;
    function place(){
      const account=document.querySelector('.academy-account-bar');
      const found=document.querySelector('.academy-role-tabs');
      if(found&&found!==tabs){tabs=found;slot=document.createComment('Workspace menu position');tabs.before(slot);}
      const target=phone.matches&&account?account:document.querySelector('.academy-page-actions,.topbar .header-actions')||account||document.body;
      if(bar.parentElement!==target)target.append(bar);
      if(tabs){
        if(phone.matches&&account){if(tabs.parentElement!==bar)bar.insertBefore(tabs,bar.querySelector('[data-app-forward]'));}
        else if(tabs.parentElement===bar&&slot?.parentElement)slot.before(tabs);
      }
      bar.classList.toggle('is-workspaces',phone.matches&&!!account&&!!tabs);
      bar.classList.toggle('is-inline',target!==document.body);render();
    }
    place();phone.addEventListener('change',place);
    new MutationObserver(place).observe(document.body,{childList:true,subtree:true});
  }
  window.M4L_ACADEMY_HISTORY={sync:render};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

/* Public catalogue names survive a slow or unavailable Archive.org refresh. */
(() => {
  'use strict';
  const scope=window.M4L_CONFIG?.API_BASE||location.origin;
  const key='m4l_library_titles_v1:'+scope, titles=new Map();
  const readable=value=>typeof value==='string'&&value.trim()&&!/^EXTERNAL:/i.test(value.trim())?value.trim().slice(0,240):'';
  function add(rows){for(const row of Array.isArray(rows)?rows:[]){const title=readable(row?.title);if(typeof row?.id==='string'&&title)titles.set(row.id,title);}}
  try{const cached=JSON.parse(localStorage.getItem(key)||'[]');add(cached);}catch{}
  try{add(JSON.parse(localStorage.getItem('m4l_library_v1:'+scope+':public')||'null')?.data?.books);}catch{}
  window.M4L_LIBRARY_TITLES={
    title:(book,assigned)=>readable(assigned)||readable(book?.title)||titles.get(book?.id)||'Untitled resource',
    remember(books){add(books);try{localStorage.setItem(key,JSON.stringify([...titles].slice(-500).map(([id,title])=>({id,title}))));}catch{}},
    cached:()=>[...titles].map(([id,title])=>({id,title}))
  };
})();

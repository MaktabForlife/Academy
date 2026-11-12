(() => {
 'use strict';
 // Existing Program links now open the shared Academic Calendar.
 const query=new URLSearchParams(location.search),target=new URLSearchParams();
 for(const key of ['teacher','program','edit'])if(query.get(key))target.set(key,query.get(key));
 const href='/academy/calendar/'+(target.size?'?'+target:'');
 const link=document.getElementById('ta-return');if(link)link.href=href;
 location.replace(href);
})();

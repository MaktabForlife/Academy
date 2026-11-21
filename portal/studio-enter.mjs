// Only short-lived one-use codes cross the domains; no master token or verifier.
const config=globalThis.AcademyHosting,current=new URL(location.href),target=current.pathname+current.search;
if(!(current.pathname.startsWith('/studio/')||current.pathname==='/circles/free-learning.html'||current.pathname==='/circles/academy/mothers/surah-al-baqarah/'||current.pathname==='/circles/academy/mothers/surah-al-baqarah/index.html')||target.startsWith('//'))throw Error('Choose an existing Studio page.');
if(document.querySelector('meta[name="uaa-auth-version"]')?.content==='2'){
 const next=new URL(target,'https://worshipuponbaseera.ummabbadacademy.app');
 if(['/studio/?view=collections&collection=tafseer','/studio/?classroom=mothers','/studio/?view=collections&collection=courses'].includes(target)){
  next.searchParams.set('academy-entry','1');
 }
 try{await window.M4L_ACADEMY_AUTH.navigate(next.href);}
 catch(error){document.querySelector('[role="status"]').textContent=error.message||'Studio could not open. Return to the dashboard and try again.';}
}else{
 const next=new URL('/academy-connect.html',config.studioOrigin);
 next.searchParams.set('target',target);location.replace(next.href);
}

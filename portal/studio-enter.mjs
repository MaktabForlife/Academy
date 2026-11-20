// Only short-lived one-use codes cross the domains; no master token or verifier.
const config=globalThis.AcademyHosting,current=new URL(location.href),target=current.pathname+current.search;
if(!(current.pathname.startsWith('/studio/')||current.pathname==='/circles/free-learning.html'||current.pathname==='/circles/academy/mothers/surah-al-baqarah/'||current.pathname==='/circles/academy/mothers/surah-al-baqarah/index.html')||target.startsWith('//'))throw Error('Choose an existing Studio page.');
if(globalThis.document?.querySelector?.('meta[name=\"uaa-auth-version\"]')?.content==='2'){await window.M4L_ACADEMY_AUTH.navigate(new URL(target,'https://worshipuponbaseera.ummabbadacademy.app').href);}else{const next=new URL('/academy-connect.html',config.studioOrigin);next.searchParams.set('target',target);location.replace(next.href);

}

// Only short-lived one-use codes cross the domains; no master token or verifier.
const config=globalThis.AcademyHosting,current=new URL(location.href),target=current.pathname+current.search;
if(!/^\/(?:studio\/|circles\/(?:free-learning\.html|academy\/))/.test(target)||target.startsWith('//'))throw Error('Choose an existing Studio page.');
const next=new URL('/academy-connect.html',config.studioOrigin);next.searchParams.set('target',target);location.replace(next.href);

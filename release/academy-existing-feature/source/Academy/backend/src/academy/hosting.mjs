import configured from '../../../config/hosting.json' with {type:'json'};
export function exactOrigin(value){
 let url;try{url=new URL(value);}catch{throw Error('A hosting origin is missing or invalid.');}
 if(url.protocol!=='https:'||url.origin!==value||url.username||url.password||(!/^[a-z0-9.-]+$/i.test(url.hostname)&&url.hostname!=='feature_worker.maktab4life.workers.dev'))throw Error('Use an exact HTTPS hosting origin.');
 return url.origin;
}
export function hosting(value=configured){
 if(value?.schema!==1||!Array.isArray(value.academyLegacyOrigins)||value.academyLegacyOrigins.length>8)throw Error('Review hosting configuration.');
 const out={};for(const key of ['academyPortalOrigin','academyApiOrigin','studioOrigin','studioBackendOrigin','hifzOrigin'])out[key]=exactOrigin(value[key]);
 out.academyLegacyOrigins=value.academyLegacyOrigins.map(exactOrigin);
 if(value.environment!==undefined){if(!['development','feature'].includes(value.environment))throw Error('Review hosting environment.');out.environment=value.environment;}
 return Object.freeze(out);
}
// Management trusts only the same exact reviewed origins as the generated client.
export function academyManagementOriginAllowed(origin,value=configured){
 const h=hosting(value);
 return typeof origin==='string'&&[h.academyPortalOrigin,...h.academyLegacyOrigins].includes(origin);
}
export function hostingEnvironment(env){
 const h=hosting(),origins=new Set((env.ALLOWED_ORIGINS||'').split(',').filter(Boolean));origins.add(h.academyPortalOrigin);
 for(const origin of h.academyLegacyOrigins)origins.add(origin);
 return {...env,ALLOWED_ORIGINS:[...origins].join(','),WEBSITE_PLATFORM_ORIGIN:h.studioOrigin,WEBSITE_PLATFORM_SERVER_ORIGIN:h.studioBackendOrigin};
}

// Select BEFORE the Root privacy bootstrap. No child transport or legacy host fallback.
(()=>{
 const c=window.M4L_V110_CONFIG,origin='https://maktabhelper.app';
 if(c?.enabled!==true||c.scope!=='ROOT_ONLY'||c.localProfile!=='native-root-only-v1'||!['LOCAL_SYNTHETIC','HOSTED_FEATURE'].includes(c.executionKind)||c.nativeCookie!==true||c.nativeChild===true||c.app!=='academy'||window.M4L_V110_ROOT_ONLY_PREPAINT_READY!==true||location.origin!==origin||!c.origins||Object.keys(c.origins).join(',')!=='academy'||c.origins.academy!==origin||c.apiOrigins?.length!==1||c.apiOrigins[0]!==origin||!/^[a-f0-9]{64}$/.test(c.profileCommitment||''))throw Error('INVALID_ROOT_ONLY_COOKIE_LOADER');
 const nativeFetch=window.fetch.bind(window);
 const starting=import('/auth/v110/academy-cookie-transport-native-https-v2.mjs').then(m=>m.installAcademyCookieTransport({win:window,doc:document,config:c,nativeFetch}));
 window.fetch=(...args)=>starting.then(adapter=>adapter.fetch(...args));
})();

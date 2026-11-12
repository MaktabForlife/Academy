// Hosted existing-Feature native ABI; programme selectors stay unbound and grant nothing.
// Academy-first native ID/PIN smoke configuration; navigation selectors remain UNBOUND.
// Null programme IDs grant no access and must be replaced from actual fresh native facts before programme/Hifz journeys.
(()=>{
 'use strict';
 const c=window.M4L_V110_CONFIG;
 if(location.origin!=='https://maktabhelper.app'||c?.enabled!==true||c.app!=='academy'||c.nativeCookie!==true||c.nativeChild!==false||c.scope!=='ROOT_ONLY'||c.localProfile!=='native-root-only-v1'||!['LOCAL_SYNTHETIC','HOSTED_FEATURE'].includes(c.executionKind)||Object.keys(c.origins||{}).join(',')!=='academy'||c.origins.academy!==location.origin||!/^[a-f0-9]{64}$/.test(c.profileCommitment||'')||c.apiOrigins?.length!==1||c.apiOrigins[0]!==location.origin||window.M4L_V110_ROOT_ONLY_PREPAINT_READY!==true||Object.hasOwn(window,'M4L_CONFIG'))throw Error('NATIVE_ACADEMY_SETUP_CONFIG_REJECTED');
 Object.defineProperty(window,'M4L_CONFIG',{value:Object.freeze({"ACCEPTED_SETUP":true,"NATIVE_ATTENDANCE":true,"MEDIA_SEPARATION":true,"MY_LINKS":true,"ENV_NAME":"feature","API_BASE":"https://maktabhelper.app","PORTAL_ORIGIN":"https://maktabhelper.app","HIFZ_PROGRAM_ID":null,"REBOOT_PROGRAM_ID":null,"HIFZHELPER_URL":"","HIFZ_DEVELOPMENT_URL":"","HIFZ_ENTRY_SOURCE":"1","HOSTNAME":"maktabhelper.app","IS_DEVELOPMENT":false,"IS_PRODUCTION":false,"isKnownProductionHost":false,"isKnownDevelopmentHost":false}),writable:false,configurable:false});
})();

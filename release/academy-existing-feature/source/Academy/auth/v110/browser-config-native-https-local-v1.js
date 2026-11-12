// Fixed local Academy browser configuration. This grants no server session or database authority.
(()=>{
 'use strict';
 const root=document.documentElement;root.hidden=true;root.classList.add('uaa-v110-masked');root.dataset.uaaV110State='masked';
 if(location.origin!=='https://maktabhelper.app'||Object.hasOwn(window,'M4L_V110_CONFIG'))throw Error('NATIVE_ACADEMY_CONFIG_REJECTED');
 const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
 Object.defineProperty(window,'M4L_V110_CONFIG',{value:freeze({"enabled":false,"localProfile":"native-https-local-v1","app":"academy","nativeCookie":true,"nativeChild":false,"origins":{"academy":"https://maktabhelper.app","studio":"https://studio.maktabhelper.app","hifz":"https://hifz.maktabhelper.app"},"apiOrigins":["https://maktabhelper.app"]}),writable:false,configurable:false});
})();

// Runs before the shared privacy bootstrap in an explicitly enabled Feature build.
(()=>{
 const config=window.M4L_V110_CONFIG;
 if(config?.enabled!==true||config.nativeCookie!==true||config.app!=='academy')return;
 if(config.localProfile==='msi-local-triple-v1'&&config.app==='academy'&&window.M4L_V110_LOCAL_PREPAINT_READY!==true)throw Error('LOCAL_PREPAINT_REQUIRED');
 const nativeFetch=window.fetch.bind(window);
 const starting=import('/auth/v110/academy-cookie-transport.mjs').then(m=>m.installAcademyCookieTransport({win:window,doc:document,config,nativeFetch}));
 window.fetch=(...args)=>starting.then(adapter=>adapter.fetch(...args));
})();

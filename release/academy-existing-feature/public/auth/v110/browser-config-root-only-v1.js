// Hosted Academy Feature only; native Root-only browser ABI, not a local/fresh-store claim.
(()=>{
 const root=document.documentElement;root.hidden=true;root.classList.add("uaa-v110-masked");root.dataset.uaaV110State="masked";
 if(location.origin!=="https://maktabhelper.app"||window.M4L_V110_CONFIG!==undefined)throw Error("ACADEMY_FEATURE_BROWSER_CONFIGURATION");
 Object.defineProperty(window,"M4L_V110_CONFIG",{value:Object.freeze({enabled:true,scope:"ROOT_ONLY",localProfile:"native-root-only-v1",executionKind:"HOSTED_FEATURE",featureProfile:"ACADEMY_ONLY_EXISTING_PAIR_V1",app:"academy",nativeCookie:true,nativeChild:false,origins:Object.freeze({academy:"https://maktabhelper.app"}),apiOrigins:Object.freeze(["https://maktabhelper.app"]),profileCommitment:"ace803d91780e16352bc2d07dd6aadd30ed7bd4c4a7ae08848d68108eb9c9d85"}),writable:false,configurable:false});
})();

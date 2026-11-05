import release from '../../js/version.json' with {type:'json'};
import {hosting} from '../src/academy/hosting.mjs';
export function academyClientConfiguration(version=release.version){
 if(typeof version!=='string'||!/^\d+\.\d+$/.test(version))throw Error('Review the release version.');
 const h=hosting(),known=[h.academyPortalOrigin,...h.academyLegacyOrigins];
 return '(()=>{const h='+JSON.stringify(h)+',known=new Set('+JSON.stringify(known)+'),local=["localhost","127.0.0.1"].includes(location.hostname),active=known.has(location.origin)||local;window.M4L_CONFIG=Object.freeze({RELEASE_VERSION:'+JSON.stringify(version)+',ACCEPTED_SETUP:true,NATIVE_ATTENDANCE:true,MEDIA_SEPARATION:true,MY_LINKS:true,PORTAL_ORIGIN:h.academyPortalOrigin,STUDIO_ORIGIN:h.studioOrigin,ENV_NAME:active?"development":"unavailable",API_BASE:active?h.academyApiOrigin:"",HIFZ_PROGRAM_ID:"PRG-3d6b7972-644c-4f81-b95c-8d6c7ffb8227",REBOOT_PROGRAM_ID:"PRG-46c8576d-9fcf-4000-96b9-856b00a0218a",HIFZHELPER_URL:h.hifzOrigin+"/",HIFZ_DEVELOPMENT_URL:"https://hifzhelper-dev.pages.dev/",HIFZ_ENTRY_SOURCE:"pages",HOSTNAME:location.hostname,IS_DEVELOPMENT:active,IS_PRODUCTION:false,isKnownProductionHost:false,isKnownDevelopmentHost:active});})();\n';
}

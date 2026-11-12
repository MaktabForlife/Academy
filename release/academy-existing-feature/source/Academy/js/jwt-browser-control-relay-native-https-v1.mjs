// Static browser UI-clearing relay only; never session authority or a Root auth checkpoint.
import {startRelayDocument} from '/auth/v110/browser-entry-native-https-v1.mjs';
const c=window.M4L_V110_CONFIG,origins={academy:'https://maktabhelper.app',studio:'https://studio.maktabhelper.app',hifz:'https://hifz.maktabhelper.app'};
if(c?.enabled!==true||c.localProfile!=='native-https-local-v1'||c.app!=='academy'||c.nativeCookie!==true||location.origin!==origins.academy||Object.keys(c.origins||{}).length!==3||Object.keys(origins).some(k=>c.origins[k]!==origins[k])||c.apiOrigins?.length!==1||c.apiOrigins[0]!==origins.academy||navigator.serviceWorker?.controller)throw Error('NATIVE_BROWSER_RELAY_CONFIG_REJECTED');
startRelayDocument({win:window,origins:c.origins});

// Explicit V110 replacement at the native reader's existing import URL.
// No legacy storage watcher, token fingerprint, connector, popup or fallback.
export async function openWebsiteStudio(selection={}){
 const c=window.M4L_V110_CONFIG;
 if(c?.enabled!==true||c.nativeCookie!==true||c.app!=='academy'||c.localProfile!=='msi-local-triple-v1'||window.location.origin!=='https://ummabbadacademy.app')return false;
 if(typeof window.M4L_V110_CHILD_NAVIGATION?.openStudioSelection!=='function')throw Error('Open the current Academy page before editing this website.');
 return window.M4L_V110_CHILD_NAVIGATION.openStudioSelection(selection);
}

// Own-child refresh lookup codec only. Never grants access or exports the hash.
export async function nativeChildRefreshFingerprint(app,raw){
 if(!['studio','hifz'].includes(app)||typeof raw!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(raw))throw Error('CHILD_REFRESH_LOOKUP_REJECTED');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('uaa-refresh-v1'+String.fromCharCode(0)+app+String.fromCharCode(0)+raw)));
 return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}

// Pure shared EXACT public relay policy used by generator and gateway.
const localOrigins=Object.freeze({academy:'https://ummabbadacademy.app',studio:'https://worshipuponbaseera.ummabbadacademy.app',hifz:'https://mahadarwa-hifz.ummabbadacademy.app'});
const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function localRootRelayHeaderPolicy({html,approvedHTMLSHA256}){
 if(typeof html!=='string'||typeof approvedHTMLSHA256!=='string'||!/^[a-f0-9]{64}$/.test(approvedHTMLSHA256)||hex(await digest(html))!==approvedHTMLSHA256)throw Error('LOCAL_RELAY_SOURCE_CHANGED');
 const hashes=[];
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  if(!/\bsrc\s*=/i.test(match[1]))hashes.push("'sha256-"+btoa(String.fromCharCode(...await digest(match[2])))+"'");
 }
 if(hashes.length!==1)throw Error('LOCAL_RELAY_SCRIPT_SET_CHANGED');
 return Object.freeze({
  'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; script-src 'self' "+hashes.join(' ')+"; connect-src 'self'; frame-src 'none'; frame-ancestors "+Object.values(localOrigins).join(' ')+"; base-uri 'none'; form-action 'none'; object-src 'none'; style-src 'none'",
  'Cross-Origin-Resource-Policy':'same-site'
  // X-Frame-Options intentionally absent on this ONE public control document.
  // Every private/native response keeps its owning CSP/XFO unmodified.
 });
}

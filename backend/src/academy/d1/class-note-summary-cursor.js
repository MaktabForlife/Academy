import {managementError as fail} from './management-store.js';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const invalid=()=>fail('These notes changed or this page belongs to another view. Refresh the notes before continuing.',400,'CLASS_NOTE_SUMMARY_CURSOR_INVALID');

// A request-owned server capability. Neither the secret nor a decryption key
// is placed in the DTO, browser, cursor binding or coordinator request.
export function classNoteSummaryCursor(secret){
 let key;
 const encryptionKey=async()=>{
  if(typeof secret!=='string'||!secret)throw fail('The notes summary is temporarily unavailable.',503);
  return key??=crypto.subtle.digest('SHA-256',encoder.encode('academy-class-notes-summary-cursor-v1\n'+secret)).then(bytes=>crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']));
 };
 return {
  async seal(boundary,binding){
   const iv=crypto.getRandomValues(new Uint8Array(12)),data=encoder.encode(JSON.stringify(boundary));
   const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(binding),tagLength:128},await encryptionKey(),data);
   return 'v1.'+encode(iv)+'.'+encode(new Uint8Array(ciphertext));
  },
  async open(token,binding){
   if(typeof token!=='string'||token.length>2048||!/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{40,2000}$/.test(token))throw invalid();
   try{
    const [,iv,ciphertext]=token.split('.'),data=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:encoder.encode(binding),tagLength:128},await encryptionKey(),decode(ciphertext));
    return JSON.parse(decoder.decode(data));
   }catch{throw invalid();}
  }
 };
}

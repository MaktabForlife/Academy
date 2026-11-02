import {managementError as fail} from './management-store.js';
export const playlistCardGradients=['sage','plum','rose','gold','ocean','sunset'];
export const playlistCardOptions={version:1,styles:['default','colour','gradient','image'],gradients:playlistCardGradients,image:{mimeTypes:['image/png','image/jpeg','image/webp'],maxBytes:5*1024*1024}};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function playlistCardImage(value){
 if(!plain(value)||Object.keys(value).some(k=>!['assetId','sha256','type','size','alt'].includes(k))||value.assetId!==undefined&&value.assetId!==value.sha256||!/^[a-f0-9]{64}$/.test(value.sha256)||!playlistCardOptions.image.mimeTypes.includes(value.type)||!Number.isSafeInteger(value.size)||value.size<8||value.size>playlistCardOptions.image.maxBytes||typeof value.alt!=='string'||!value.alt.trim()||value.alt.length>240||/[\u0000-\u001f\u007f]/.test(value.alt))throw fail('Choose a valid PNG, JPEG or WebP card image up to 5 MB, with an image description.',400,'PLAYLIST_CARD_INVALID');
 return {assetId:value.sha256,sha256:value.sha256,type:value.type,size:value.size,alt:value.alt.trim()};
}
export function playlistCard(value){
 if(value===undefined)return {version:1,style:'default',colour:'#49645C',gradient:null,image:null};
 if(!plain(value)||Object.keys(value).some(k=>!['version','style','colour','gradient','image'].includes(k))||value.version!==1||!playlistCardOptions.styles.includes(value.style)||!/^#[a-fA-F0-9]{6}$/.test(value.colour)||value.gradient!==null&&!playlistCardGradients.includes(value.gradient))throw fail('Choose a supported playlist card colour or gradient.',400,'PLAYLIST_CARD_INVALID');
 const image=value.image===null?null:playlistCardImage(value.image);
 if(value.style==='image'&&!image||value.style!=='image'&&image||value.style==='gradient'&&!value.gradient||['default','colour'].includes(value.style)&&value.gradient)throw fail('Choose a complete playlist card style.',400,'PLAYLIST_CARD_INVALID');
 return {version:1,style:value.style,colour:value.colour.toUpperCase(),gradient:value.gradient,image};
}
export function playlistCardDto(value,teachers=[],{published=false}={}){
 const card=playlistCard(value),teacher=teachers.map(t=>t.name?.trim()).filter(Boolean).join(', ')||null;
 return {...card,image:card.image?{...card.image,url:published?'/api/academy/media-playlist-card-image?sha256='+card.image.sha256:null}:null,teacher};
}

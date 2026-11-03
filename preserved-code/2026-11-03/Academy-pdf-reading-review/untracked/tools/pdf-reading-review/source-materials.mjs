import {esc} from '../../academy/course-websites/model.mjs';

// Public source references are a local-review aid, never an Academy media adapter.
// Restricted attachments still require their native permission-checked identity.
export function publicSourceMaterials(values=[]){
 if(!Array.isArray(values)||values.length>20)throw Error('Check the public source materials.');
 const seen=new Set();
 return values.map(value=>{
  const u=new URL(value.url);
  if(u.protocol!=='https:'||u.hostname!=='ummabbadacademy.com'||u.username||u.password||u.port||u.search||u.hash||!/^\/wp-content\/uploads\/[\w/().%-]+\.pdf$/i.test(u.pathname))throw Error('Use an original public Academy PDF source.');
  if(typeof value.title!=='string'||!value.title.trim()||value.title.length>300||seen.has(u.href))throw Error('Check the public material title or duplicate reference.');
  seen.add(u.href);
  return {title:value.title,url:u.href};
 });
}

export function sourceMaterialsHTML(values){
 const materials=publicSourceMaterials(values);
 if(!materials.length)return '';
 return materials.map(m=>`<article class="sp-material"><span class="sp-file-tag">COURSE PDF</span><h2>${esc(m.title)}</h2><a class="sp-primary" href="${esc(m.url)}" target="_blank" rel="noopener" download>Download PDF ↓</a></article>`).join('');
}

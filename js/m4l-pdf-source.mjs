// Only these existing public file routes may be selected by reader query strings.
// Private lesson and assessment bytes keep their authenticated download paths.
export function publicPdfSource(query){
 const announcement=query.get('announcement'),document=query.get('document');
 if(announcement===null&&document===null)return null;
 if(announcement!==null&&document!==null||query.has('file')||query.has('book'))throw Error('Choose one PDF to open.');
 if(announcement!==null){
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(announcement))throw Error('This announcement PDF link is invalid.');
  return {api:true,path:'/api/academy/announcements/pdf?id='+encodeURIComponent(announcement)};
 }
 if(typeof document!=='string'||document.length>1024||!/^\/academy\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.pdf$/i.test(document)||new URL(document,'https://academy.invalid').pathname!==document)throw Error('This Academy PDF link is invalid.');
 return {api:false,path:document};
}

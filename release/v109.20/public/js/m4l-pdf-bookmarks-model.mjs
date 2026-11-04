// Shared validation for account bookmarks. Only public Archive PDFs are accepted.
export function publicPdfFile(value){
  try{
    if(typeof value!=='string'||!/^\/pdf-file\/[A-Za-z0-9_-]{1,4096}$/.test(value))return '';
    const raw=value.slice('/pdf-file/'.length),bytes=Uint8Array.from(atob(raw.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    const url=new URL(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(url.origin!=='https://archive.org'||url.username||url.password||!url.pathname.startsWith('/download/')||url.search||url.hash)return '';
    const encoded=btoa(String.fromCharCode(...new TextEncoder().encode(url.href))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
    return encoded.length<=4096?'/pdf-file/'+encoded:'';
  }catch{return '';}
}
export function pdfBookmark(input){
  const file=publicPdfFile(input?.file),title=typeof input?.title==='string'?input.title.trim():'';
  const page=input?.page??0,pageLabel=typeof input?.pageLabel==='string'?input.pageLabel.trim():'';
  if(!file||!title||title.length>240||!Number.isInteger(page)||page<0||page>100000||pageLabel.length>40)throw Error('Choose a public Library PDF and a valid page to bookmark.');
  return {file,title,page,pageLabel:page?pageLabel:''};
}
export function pdfBookmarkLink(entry){
  const bookmark=pdfBookmark(entry),query=new URLSearchParams({file:bookmark.file,title:bookmark.title});
  if(bookmark.page)query.set('page',String(bookmark.page));
  return '/academy/pdf-reader/?'+query;
}

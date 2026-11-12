// Public PDF URL support only; private Worker file tickets remain unavailable.
export function publicPdfTarget(encoded){
  try{if(!/^[A-Za-z0-9_-]{1,4096}$/.test(encoded))return false;
    const bytes=Uint8Array.from(atob(encoded.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    const url=new URL(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(url.protocol!=='https:'||url.username||url.password||url.port)return false;
    return url.hostname==='archive.org'?url.pathname.startsWith('/download/')&&!url.search&&!url.hash:
      ['drive.google.com','docs.google.com','lh3.googleusercontent.com'].includes(url.hostname);
  }catch{return false;}
}

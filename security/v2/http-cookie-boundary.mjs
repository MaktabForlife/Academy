export function withoutCookies(request,name=null){
 const original=request.headers.get('Cookie');
 if(original===null)return request;
 const remaining=name===null?'':original.split(';')
  .filter(pair=>pair.split('=',1)[0].trim()!==name)
  .map(pair=>pair.trim()).filter(Boolean).join('; ');
 if(remaining===original)return request;
 const headers=new Headers(request.headers);
 if(remaining)headers.set('Cookie',remaining);
 else headers.delete('Cookie');
 return new Request(request,{headers});
}

export function withoutSetCookie(response){
 if(!response.headers.has('Set-Cookie'))return response;
 const headers=new Headers(response.headers);
 headers.delete('Set-Cookie');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

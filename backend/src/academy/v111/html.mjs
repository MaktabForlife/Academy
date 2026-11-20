const academy='https://ummabbadacademy.app';
export async function academyV2HTML(request,env,response){
 if(env.UAA_V2_ENABLED!=='1'||new URL(request.url).origin!==academy||!response.ok||!response.headers.get('Content-Type')?.toLowerCase().includes('text/html'))return response;
 if(request.method==='HEAD'){const headers=new Headers(response.headers);headers.delete('ETag');headers.delete('Content-Length');headers.set('Cache-Control','no-store');return new Response(null,{status:response.status,headers});}
 const text=await response.text();if(/name=["']uaa-auth-version["']/.test(text))return new Response(text,response);
 const gate='<meta name="uaa-auth-version" content="2"><meta name="uaa-app" content="academy"><style id="uaa-v2-startup-mask">html.uaa-v2-private-masked [data-uaa-private],html.uaa-v2-private-masked [data-academy-private],html.uaa-v2-private-masked #academy-dashboard,html.uaa-v2-private-masked #workspace{visibility:hidden!important;pointer-events:none!important}</style><script src="/js/m4l-v111-session.js"></script>';
 const masked=text.replace(/<html\b([^>]*)>/i,(tag,attrs)=>/class=["']/.test(attrs)?tag.replace(/class=(["'])(.*?)\1/i,(_,q,names)=>'class='+q+names+' uaa-v2-private-masked'+q):'<html'+attrs+' class="uaa-v2-private-masked">');
 const html=/<head(?:\s[^>]*)?>/i.test(masked)?masked.replace(/<head(?:\s[^>]*)?>/i,m=>m+gate):gate+masked,headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('ETag');headers.set('Cache-Control','no-store');return new Response(html,{status:response.status,headers});
}

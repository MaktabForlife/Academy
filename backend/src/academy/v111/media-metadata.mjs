import {b64u,unb64u,bytes,canonical,requireThat} from '../../../../security/v2/codec.mjs';
export const MEDIA_METADATA_RAW_LIMIT=6144,MEDIA_METADATA_HEADER_LIMIT=8192;
export function mediaUploadMetadata(request,{v2=false}={}){
 const url=new URL(request.url);let text;
 if(v2){
  requireThat(!url.searchParams.has('metadata'),'MEDIA_METADATA_QUERY_RETIRED',400);
  const value=request.headers.get('X-Academy-Media-Metadata');requireThat(typeof value==='string'&&value.length>0,'MEDIA_METADATA_REQUIRED',400);requireThat(bytes(value).length<=MEDIA_METADATA_HEADER_LIMIT,'MEDIA_METADATA_TOO_LARGE',413);requireThat(/^[A-Za-z0-9_-]+$/.test(value),'MEDIA_METADATA_INVALID',400);
  let raw;try{raw=unb64u(value);text=new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{requireThat(false,'MEDIA_METADATA_INVALID',400);}
  requireThat(raw.length<=MEDIA_METADATA_RAW_LIMIT,'MEDIA_METADATA_TOO_LARGE',413);requireThat(b64u(raw)===value,'MEDIA_METADATA_INVALID',400);
 }else{text=url.searchParams.get('metadata')||'';requireThat(text.length<=8192,'MEDIA_METADATA_TOO_LARGE',413);}
 let value;try{value=JSON.parse(text);}catch{requireThat(false,'MEDIA_METADATA_INVALID',400);}
 requireThat(value&&typeof value==='object'&&!Array.isArray(value),'MEDIA_METADATA_INVALID',400);if(v2)requireThat(canonical(value)===text,'MEDIA_METADATA_INVALID',400);return value;
}

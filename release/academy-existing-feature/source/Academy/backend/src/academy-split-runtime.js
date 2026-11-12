import academy from './academy-runtime.js';
export const splitPreviewOrigin=origin=>/^https:\/\/(?:feature-admin|feature-split-db|[a-f0-9]{8})\.academy-maktab4life\.pages\.dev$/.test(origin||'');
const allowed=splitPreviewOrigin;
const protectedBucket=bucket=>bucket&&new Proxy(bucket,{get(target,name){if(name==='delete')return async()=>{};const value=target[name];return typeof value==='function'?value.bind(target):value;}});
export default {
 fetch(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(request.method!=='OPTIONS'&&(path==='/api/academy/open-library/metadata/save'||path==='/api/academy/my-links/save'||path==='/api/academy/hifz/sign-in'))return Response.json({success:false,code:'SPLIT_SHARED_SERVICE_HELD',error:'This shared service is available on the current Development site while the separate databases are reviewed.'},{status:409,headers:{'Access-Control-Allow-Origin':allowed(request.headers.get('Origin'))?request.headers.get('Origin'):'','Vary':'Origin'}});
  return academy.fetch(request,{...env,ALLOWED_ORIGINS:allowed(request.headers.get('Origin'))?request.headers.get('Origin'):'',HIFZ_HANDOFF_ENABLED:'0',HIFZ_PROFILE_SYNC_URL:'',HIFZ_DEVELOPMENT_HANDOFF_URL:'',ACADEMY_OBJECT_NAMESPACE:'dev-split-v1/',LESSON_MEDIA_BUCKET:protectedBucket(env.LESSON_MEDIA_BUCKET),ASSESSMENT_BUCKET:protectedBucket(env.ASSESSMENT_BUCKET),MEDIA_BUCKET:protectedBucket(env.MEDIA_BUCKET)},ctx);
 }
};

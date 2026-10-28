import {siteId,boundedJSON,error} from '../../../../website-studio/src/protocol.mjs';
import {validateCourse,referencedAssets} from '../../../../academy/course-websites/model.mjs';
import {lessonMedia} from './lesson-media.js';
const enabled=env=>env.ACADEMY_WEBSITE_STUDIO==='1';
export async function studioPublished(env,input){
 if(!enabled(env))return null;
 const id=siteId(input),state=await env.ACADEMY_DB.withSession('first-primary').prepare('SELECT * FROM website_studio_state WHERE website_id=?').bind(id).first();
 if(!state)return null;if(!state.enabled||!state.published_key)throw error('This course website is currently withdrawn.',404,'COURSE_WEBSITE_UNPUBLISHED');
 if(!env.WEBSITE_STUDIO_CONTENT)throw error('Website content is temporarily unavailable.',503);
 const response=await env.WEBSITE_STUDIO_CONTENT.fetch(new Request('https://studio-content.internal/version',{method:'POST',body:JSON.stringify({websiteId:id,key:state.published_key,sha256:state.published_sha256})}));
 if(!response.ok)throw error('Website content is temporarily unavailable.',503,'STUDIO_CONTENT_MISSING');const {value}=await boundedJSON(response.body);validateCourse(value.document);
 return {state,document:value.document,assets:value.assets||[],source_kind:state.source_kind};
}
export async function studioAsset(env,repository,auth,input,source){
 if(!referencedAssets(source.document).includes(input.assetId))throw error('This file is not published in this website.',404,'NOT_FOUND');
 const row=await env.ACADEMY_DB.withSession('first-primary').prepare('SELECT * FROM website_studio_assets WHERE website_id=? AND asset_id=?').bind(source.state.website_id,input.assetId).first();if(!row)throw error('This file is unavailable.',404,'NOT_FOUND');
 if(row.source==='ACADEMY'){
  if(!auth)throw error('Sign in to open Academy materials.',403);
  return lessonMedia(repository,auth,env).run(row.mime_type==='application/pdf'?'download':'watch',{activityKey:input.activityKey,lessonId:row.lesson_id,assetId:row.native_asset_id});
 }
 return env.WEBSITE_STUDIO_CONTENT.fetch(new Request('https://studio-content.internal/image',{method:'POST',body:JSON.stringify({key:row.object_key,sha256:row.sha256})}));
}

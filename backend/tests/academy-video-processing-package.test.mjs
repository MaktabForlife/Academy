import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';import {fileURLToPath} from 'node:url';
import {buildAcademyAssets} from '../tools/academy-assets.mjs';import {serveAcademySite} from '../tools/academy-site.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('actual Academy builder publishes the complete processing module graph without backend, auth or schema files',async t=>{
 const temporary=await mkdtemp(join(tmpdir(),'video-processing-assets-'));t.after(()=>rm(temporary,{recursive:true,force:true}));
 const directory=join(temporary,'public'),result=buildAcademyAssets({repo:root,directory,target:'development'});
 const paths=['js/m4l-course-media.js','js/m4l-course-media-view.mjs','js/m4l-video-processing.mjs','js/m4l-media-admin-panel.mjs','js/m4l-media-workflow.mjs','js/m4l-learner-companion.mjs','js/m4l-ui-escape.mjs','css/m4l-media-attachment.css'];
 for(const path of paths){assert(result.files.includes(path),path);assert.equal(await readFile(join(directory,path),'utf8'),await readFile(join(root,path),'utf8'));}
 assert(!result.files.some(p=>p.startsWith('backend/')||p.startsWith('docs/')||p.endsWith('.sql')||p.includes('video-autolink/')));
 let assets=0;const env={ASSETS:{fetch:async request=>{assets++;return new Response(await readFile(join(directory,new URL(request.url).pathname)),{headers:{'Content-Type':'text/javascript'}});}}};
 const response=await serveAcademySite(new Request('https://ummabbadacademy.app/js/m4l-video-processing.mjs'),env);assert.equal(response.status,200);assert((await response.text()).includes('mountVideoProcessing'));const before=assets;
 assert.equal((await serveAcademySite(new Request('https://ummabbadacademy.app/backend/src/academy/d1/web-platform/video-processing.mjs'),env)).status,404);assert.equal(assets,before);
 console.log(JSON.stringify({actualPublicFiles:result.fileCount,processingModulesChecked:paths.length,backendOrSchemaPublished:false,hostedCalls:0}));
});
test('paired renderer copies match the pinned Studio public sources with only explicit Academy import paths',async()=>{
 const studio=process.env.VIDEO_STUDIO_SOURCE;if(!studio)throw Error('Set the pinned Studio checkout for this paired-source test.');
 const pairs=[
 ['js/m4l-course-media-view.mjs','public/shared/course-media-workflow.mjs',[['./video-processing.mjs','./m4l-video-processing.mjs'],['./existing-media-view.mjs','./m4l-existing-media-view.mjs']]],
 ['js/m4l-video-processing.mjs','public/shared/video-processing.mjs',[['./media-admin-panel.mjs','./m4l-media-admin-panel.mjs']]],
 ['js/m4l-media-admin-panel.mjs','public/shared/media-admin-panel.mjs',[['./model.mjs','./m4l-ui-escape.mjs'],['./learner-companion.mjs','./m4l-learner-companion.mjs'],['./media-workflow.mjs','./m4l-media-workflow.mjs']]],
 ['js/m4l-media-workflow.mjs','public/shared/media-workflow.mjs',[['./learner-companion.mjs','./m4l-learner-companion.mjs']]],
 ['js/m4l-learner-companion.mjs','public/shared/learner-companion.mjs',[]],
 ['css/m4l-media-attachment.css','public/shared/media-attachment.css',[]]
 ];
 for(const [academyPath,studioPath,replacements]of pairs){let source=await readFile(resolve(studio,studioPath),'utf8');for(const [from,to]of replacements)source=source.replaceAll(from,to);assert.equal(await readFile(resolve(root,academyPath),'utf8'),source,academyPath);}
});

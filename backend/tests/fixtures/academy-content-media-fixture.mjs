import {readFileSync} from 'node:fs';
import {splitVideoFixture} from './academy-session-video-split-fixture.mjs';
import {ok} from './academy-recorded-context-fixture.mjs';
import worker from '../../src/academy-runtime.js';
import {createHash} from 'node:crypto';
import {seedContextReadGrowth} from './academy-context-read-growth.mjs';
export {ok};
export async function contentMediaFixture({growth=0}={}){
 const f=await splitVideoFixture(source=>seedContextReadGrowth(source,growth));
 f.databases.core.exec(readFileSync(new URL('../../migrations/academy-core/0020_recording_companions.sql',import.meta.url),'utf8'));
 f.admin=await f.source.actor('adminA');f.global=await f.source.actor('global');f.scope=f.scopes.programA;
 f.binding=async(extra={})=>{const input={activityKey:f.scope,classId:'class-1',recordingDate:'2026-10-28',subjectKey:'MODULE:recorded-subject-module',teacherIds:['account-0006'],operationId:crypto.randomUUID(),...extra},options=ok(await f.request('binding-options',{activityKey:input.activityKey,classId:input.classId||''},f.admin));input.optionsRevision=options.optionsRevision;return {...ok(await f.request('binding-create',input,f.admin)),input};};
 f.publish=async(lessonId,revision=1)=>{const row=ok(await f.request('get',{lessonId},f.admin)).lesson,result=ok(await f.request('save',{lessonId,revision,title:row.title,summary:'',state:'PUBLISHED',commentsClosed:true,videos:[],operationId:crypto.randomUUID()},f.admin));ok(await f.request('/api/academy/changes/accept',result.acceptedChange,f.admin));return result;};
 f.pdf=async(lessonId,revision,token=f.admin,note=false,extra={})=>{const bytes=Buffer.from('%PDF-1.4\n% synthetic content media '+Math.random()+'\n%%EOF'),metadata={activityKey:f.scope,lessonId,revision,operationId:crypto.randomUUID(),size:bytes.length,filename:'notes.pdf',sha256:createHash('sha256').update(bytes).digest('hex'),...extra};const response=await worker.fetch(new Request('http://localhost/api/academy/lesson-media/'+(note?'note-upload':'upload')+'?metadata='+encodeURIComponent(JSON.stringify(metadata)),{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':note?'TEACH':'ADMIN'},body:bytes}),f.source.env);return {status:response.status,body:await response.json(),metadata};};
 f.download=async(input,token,workspace='LEARN')=>worker.fetch(new Request('http://localhost/api/academy/lesson-media/download',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':workspace,'Content-Type':'application/json'},body:JSON.stringify(input)}),f.source.env);
 return f;
}

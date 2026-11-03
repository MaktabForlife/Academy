import {separationFixture} from './academy-separation-fixture.mjs';
import {classNotesFixture} from './academy-class-notes-fixture.mjs';
import {journalBucket} from './academy-journal-bucket.mjs';
import worker from '../../src/academy-runtime.js';
export async function studentJournalFixture({journalDirectory=null,websites=false}={}){
 const f=await (websites?classNotesFixture():separationFixture());
 f.journalBucket=journalBucket(journalDirectory);f.env.ACADEMY_JOURNAL_BUCKET=f.journalBucket;
 f.journal=async(action,input={},who='studentA',workspace='LEARN')=>{const token=who===null?'':await f.actor(who);const response=await worker.fetch(new Request('http://localhost/api/academy/journal/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),'X-Academy-Workspace':workspace},body:JSON.stringify(input)}),f.env);return {status:response.status,headers:response.headers,body:await response.json()};};
 return f;
}

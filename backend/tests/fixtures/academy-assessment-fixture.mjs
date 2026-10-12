import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {memorisationFixture} from './academy-memorisation-fixture.mjs';
import {attendanceProgramId} from './academy-attendance-fixture.mjs';
import worker from '../../src/worker.js';
export const assessmentScope='PROGRAM:'+attendanceProgramId;
export const pdf=Buffer.from('%PDF-1.4\n% assessment integration fixture\n%%EOF');
export async function assessmentFixture(){
 const f=await memorisationFixture();f.db.exec(readFileSync(new URL('../../migrations/academy/0016_assessments.sql',import.meta.url),'utf8'));
 for(const name of ['Qasas','Fiqh'])if(!f.db.prepare("SELECT 1 FROM subject_catalog WHERE source_namespace='ACADEMY' AND name=?").get(name))f.db.prepare("INSERT INTO subject_catalog(subject_key,source_namespace,subject_id,name,active) VALUES(?,'ACADEMY',?,?,1)").run('ACADEMY:ASSESSMENT-'+name,'ASSESSMENT-'+name,name);
 const objects=new Map();f.objects=objects;
 f.env.ASSESSMENT_BUCKET={async put(key,stream,options){const bytes=new Uint8Array(await new Response(stream).arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==options.sha256)throw Error('Checksum mismatch');objects.set(key,bytes);return {key};},async get(key){const bytes=objects.get(key);return bytes?{body:new Blob([bytes]).stream()}:null;},async delete(key){objects.delete(key);}};
 f.call=async(action,input={},token='')=>{const response=await worker.fetch(new Request('http://localhost'+(action.startsWith('/')?action:'/api/academy/assessments/'+action),{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),f.env);return {status:response.status,body:await response.json()};};
 f.login=async(suffix)=>(await f.call('/api/account/login',{uniqueid:'login-'+suffix,pin:'1234'})).body.token;
 f.upload=async(input,token,bytes=pdf)=>{const metadata={size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),mimeType:'application/pdf',filename:'assessment.pdf',operationId:crypto.randomUUID(),...input};const response=await worker.fetch(new Request('http://localhost/api/academy/assessments/upload?metadata='+encodeURIComponent(JSON.stringify(metadata)),{method:'POST',headers:{Authorization:'Bearer '+token},body:bytes}),f.env);return {status:response.status,body:await response.json(),metadata};};
 f.download=async(fileId,token)=>{const response=await worker.fetch(new Request('http://localhost/api/academy/assessments/download',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({fileId,operationId:crypto.randomUUID()})}),f.env);return {status:response.status,bytes:new Uint8Array(await response.arrayBuffer()),headers:response.headers};};
 return f;
}

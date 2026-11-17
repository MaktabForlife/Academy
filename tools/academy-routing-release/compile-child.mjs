import {readFile} from 'node:fs/promises';
import {buildAcademyPortableCandidate} from './build-consumer.mjs';
try{
 const binding=JSON.parse(await readFile(process.argv[2],'utf8'));
 const proof=await buildAcademyPortableCandidate(binding);
 console.log(JSON.stringify(proof));
}catch(e){
 console.log(JSON.stringify({status:'FAIL',errorCategory:/^[A-Z0-9_]+$/.test(e?.code||'')?e.code:'COMPILER_STOP'}));
 process.exitCode=1;
}

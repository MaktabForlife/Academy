import {fail,sha256} from './protocol.mjs';
export const processingBrowserPath='/api/admin/platform/studio-processing';
export const processingPartPath=processingBrowserPath+'/recording-part';
export const processingServerPath='/internal/studio/video-processing';
export const processingPartBytes=5*1024*1024;
export const processingEnvelopeBytes=8*1024*1024;
export const processingResponseBytes=1024*1024;
export const processingJSONBytes=1024*1024;
const shapes={
 'video-source-capabilities':['action'],'video-source-options':['action'],
 'video-source-recordings':['action','playlistId','after'],'video-source-detail':['action','attachmentId'],
 'video-source-youtube':['action','operationId','assetId','videoId','title'],
 'video-source-attach':['action','operationId','attachmentId','assetId','title','teacherIds','playlistId','websiteId','lessonId','lessonDate','cohort'],
 'video-source-upload-start':['action','operationId','assetId','filename'],
 'video-source-upload-part':['action','assetId','partNumber','data','sha256'],
 'video-source-upload-complete':['action','operationId','assetId','parts'],
 'video-source-publication':['action','operationId','attachmentId','revision','draftContext','sourceRevision','companionKey','companionRevision','confirm'],
 'video-processing-capabilities':['action'],
 'video-processing-source':['action','operationId','attachmentId','format','durationSeconds','transcript'],
 'video-processing-quote':['action','sourceId'],
 'video-processing-authorise':['action','operationId','sourceId','quoteHash','authorise'],
 'video-processing-status':['action','jobId'],
 'video-processing-history':['action','attachmentId','after'],
 'video-processing-candidate':['action','jobId'],
 'video-processing-accept':['action','operationId','jobId','candidateHash','revision','reviewed','companion','confirmLessonReference','confirmAssignedHomework','confirmReferences','confirmAudioQuotations'],
 'video-processing-cancel':['action','operationId','jobId','cancel']
};
export function videoProcessingEnabled(env){return env.VIDEO_AUTOLINK_HTTP_ENABLED==='1';}
export function checkedVideoCommand(command,{allowPart=false}={}){
 const keys=shapes[command?.action];
 if(!command||typeof command!=='object'||Array.isArray(command)||!keys||Object.keys(command).some(k=>!keys.includes(k))||command.action==='video-source-upload-part'&&!allowPart)throw fail('Choose a supported video-processing command.',400,'PROCESSING_COMMAND_INVALID');
 const size=new TextEncoder().encode(JSON.stringify(command)).length;
 if(size>(command.action==='video-source-upload-part'?processingEnvelopeBytes:768*1024)||command.action==='video-processing-source'&&(typeof command.transcript!=='string'||new TextEncoder().encode(command.transcript).length>512*1024))throw fail('This processing command is too large.',413,'PROCESSING_INPUT_TOO_LARGE');
 return command;
}
export function checkedProcessingInput(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['activityKey','command'].includes(k)))throw fail('Choose this Course’s processing controls.',400,'PROCESSING_COMMAND_INVALID');
 checkedVideoCommand(input.command);return input;
}
export async function processingPartInput(request){
 const query=new URL(request.url).searchParams;
 if([...query.keys()].some(k=>!['activityKey','assetId','partNumber'].includes(k))||new Set(query.keys()).size!==[...query.keys()].length||!/^\d+$/.test(query.get('partNumber')||''))throw fail('Choose a valid recording part.',400,'VIDEO_PART_INVALID');
 const activityKey=query.get('activityKey'),assetId=query.get('assetId'),partNumber=Number(query.get('partNumber'));
 if(!/^[-A-Za-z0-9_:]{1,180}$/.test(activityKey||'')||!/^[-A-Za-z0-9_:]{1,180}$/.test(assetId||'')||!Number.isSafeInteger(partNumber)||partNumber<1||partNumber>10000||request.headers.get('Content-Type')!=='application/octet-stream')throw fail('Choose a valid recording part.',400,'VIDEO_PART_INVALID');
 const reader=request.body?.getReader();if(!reader)throw fail('Choose a valid recording part.',400,'VIDEO_PART_INVALID');
 let size=0;const chunks=[];try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>processingPartBytes){await reader.cancel();throw fail('The recording part is too large.',413,'PROCESSING_INPUT_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
 if(!size)throw fail('Choose a valid recording part.',400,'VIDEO_PART_INVALID');
 const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
 let binary='';for(let at=0;at<data.length;at+=8192)binary+=String.fromCharCode(...data.subarray(at,at+8192));
 return {activityKey,command:{action:'video-source-upload-part',assetId,partNumber,sha256:await sha256(data),data:btoa(binary)}};
}

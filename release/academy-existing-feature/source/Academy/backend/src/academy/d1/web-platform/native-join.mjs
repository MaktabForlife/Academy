import {fail} from './protocol.mjs';
export const nativeJoinOwnershipSQL="SELECT 1 FROM website_platform_access_ownership INDEXED BY website_platform_ownership_nocase WHERE activity_key=? COLLATE NOCASE AND state<>'ACADEMY' LIMIT 1";

export function nativeJoinTarget(joinKey,date){
 let parts;try{parts=JSON.parse(joinKey);}catch{throw fail('Refresh the timetable and select a lesson.');}
 if(!Array.isArray(parts)||!['PROGRAM','COURSE','SUBSTITUTE'].includes(parts[0])||parts.length!==({PROGRAM:5,COURSE:6,SUBSTITUTE:3})[parts[0]]||typeof parts[1]!=='string'||!parts[1]||parts[1].length>180||parts.at(-1)!==date)throw fail('Refresh the timetable and select a lesson.');
 return parts[0]==='SUBSTITUTE'?{assignmentId:parts[1]}:{activityKey:parts[0]+':'+parts[1]};
}

export async function nativeJoinOwnership(db,accountId,target){
 const activity=target.activityKey||(await db.prepare('SELECT activity_key FROM attendance_substitutes WHERE assignment_id=? AND account_id=? COLLATE NOCASE').bind(target.assignmentId,accountId).first())?.activity_key;
 if(!activity)throw fail('This lesson is no longer available to you.',403,'LESSON_UNAVAILABLE');
 // A native class allocation cannot replace a Studio-owned programme's paid
 // and live gates. Keep those lessons on the existing Studio Join resolver.
 const handedOver=await db.prepare(nativeJoinOwnershipSQL).bind(activity).first();
 if(handedOver)throw fail('Open this programme’s current class link from its classroom.',409,'STUDIO_JOIN_REQUIRED');
 return activity;
}

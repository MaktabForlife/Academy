// Stable accepted identifiers only. Names, dates of weekly occurrences and
// teacher display labels do not decide whether two sessions share a resource.
export function recurringSessionKey(key){
 let parts;try{parts=typeof key==='string'?JSON.parse(key):key;}catch{return '';}
 if(!Array.isArray(parts))return '';
 if(parts[0]==='PROGRAM'&&parts.length===3)return JSON.stringify(['RECURRING','PROGRAM',String(parts[2]).replace(/@(?:[0-6]|\d{4}-\d{2}-\d{2})$/,'')]);
 if(parts[0]==='COURSE'&&parts.length===3)return JSON.stringify(['RECURRING','COURSE',parts[1],parts[2]]);
 return parts[0]==='RECURRING'?JSON.stringify(parts):'';
}
export function sessionBinding(activityKey,session){
 const key=session.sessionKey||JSON.stringify(activityKey.startsWith('PROGRAM:')?['PROGRAM',session.date,session.sourceAnchor||session.anchor]:['COURSE',session.runId,session.sourceSessionId||session.anchor]);
 return JSON.stringify(['TEACHING_SESSION_V1',activityKey.toUpperCase(),recurringSessionKey(key),(session.classIds||[]).map(k=>k.toUpperCase()).sort(),String(session.programSubjectId||session.subjectId||'').toUpperCase(),String(session.moduleId||'').toUpperCase()]);
}
export const recurringSessionSQL=key=>{
 const anchor=`json_extract(${key},'$[2]')`,rule=`CASE WHEN substr(${anchor},-2) GLOB '@[0-6]' THEN substr(${anchor},1,length(${anchor})-2) WHEN substr(${anchor},-11) GLOB '@????-??-??' THEN substr(${anchor},1,length(${anchor})-11) ELSE ${anchor} END`;
 return `CASE WHEN json_valid(${key}) THEN CASE json_extract(${key},'$[0]') WHEN 'PROGRAM' THEN json_array('RECURRING','PROGRAM',${rule}) WHEN 'COURSE' THEN json_array('RECURRING','COURSE',json_extract(${key},'$[1]'),json_extract(${key},'$[2]')) WHEN 'RECURRING' THEN ${key} END END`;
};

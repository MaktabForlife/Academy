import {normalizeZoomLink} from '../../programs/zoom-links.js';

export const programZoomKey=activity=>`ProgramZoom:${String(activity).toUpperCase()}`;
// An explicit empty setting clears an older draft/publication's Program link.
export const programZoomJoin="LEFT JOIN academy_settings pz ON a.kind='PROGRAM' AND pz.setting_key='ProgramZoom:'||upper(a.activity_key)";
export const programSettingsReadSQL=`SELECT p.*,COALESCE(pz.setting_value,json_extract(d.draft_json,'$.programZoomLink'),'') AS program_zoom_link,pz.setting_key IS NOT NULL AS program_zoom_configured FROM program_settings p LEFT JOIN academy_settings pz ON pz.setting_key='ProgramZoom:'||upper(p.activity_key) LEFT JOIN timetable_drafts d ON d.activity_key=p.activity_key AND d.scope_key=p.activity_key`;
export const applyProgramZoom=(draft,program)=>program.programZoomConfigured?{...draft,programZoomLink:program.programZoomLink}:draft;

// Resolve only the meeting destination from current Program settings. Published
// labels, dates, teachers and audiences remain the immutable publication's data.
export function currentProgramZoom(override,row,publication,classes) {
 // Before an explicit Program setting exists, retain its published Program
 // default while still resolving a single class's current meeting destination.
 const programLink=override??publication.snapshot.programZoomLink??(row.zoomSource==='PROGRAM'?row.zoomLink:'');
 const source=publication.snapshot.rules?.find(rule=>rule.id===(row.ruleId||row.id));
 const sessionLink=source?.zoomLink||(row.zoomSource!=='PROGRAM'&&row.zoomSource!=='CLASS'?row.zoomLink:'');
 const classLink=row.classIds?.length===1?classes.find(c=>c.class_id===row.classIds[0])?.zoom_link:'';
 try{return normalizeZoomLink(programLink||sessionLink||classLink||'');}catch{return '';}
}

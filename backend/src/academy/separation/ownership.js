import {setupSchema,privateSetupTables} from '../d1/setup-schema.js';
import {definitionSetting} from '../d1/setup-reader.js';

// Published schedules, release pointers and current access are Core facts.
export const coreSetupTables=new Set(['timetable_publications','published_lessons','published_lesson_classes','published_lesson_teachers','program_publication_state','program_historical_extensions','course_run_state','course_settings']);
export const adminTables=new Set([...Object.keys(setupSchema).filter(t=>!coreSetupTables.has(t)),...privateSetupTables]);
const operational=new Set(['academy_write_state','academy_write_guards']);
export function liveColumns(table){
 const spec=setupSchema[table];if(!spec)return [];
 return [...new Set([...(spec.live||[]),...(spec.columns.includes('active')?['active']:[]),...(table==='activities'?['activity_id','kind','website_visible']:[]),...(table==='assessments'?['created_at','created_by']:[])])];
}
export const settingOwner=key=>definitionSetting(String(key))||String(key).startsWith('AnnouncementPdf:')?'admin':'core';
export function fieldOwner(table,column){
 if(operational.has(table)||coreSetupTables.has(table)||!adminTables.has(table))return 'core';
 return liveColumns(table).includes(column)?'core':'admin';
}
export const localMetadata=new Set(['operation_receipts','audit_events','management_revisions']);

import {runCoursePublicationStep} from './course-publication-source.mjs';
import {recoverStudioBusiness} from './studio-business-delivery.mjs';
import {requireThat} from '../../../../security/v2/codec.mjs';
import {scanStudioAuthorityChanges,fanoutStudioAuthorityChanges,materializeStudioAuthorityJobs,deliverStudioAuthorityPages} from './studio-authority-source.mjs';
export async function runStudioAuthorityMaintenance(runtime){
 requireThat(runtime.app==='academy'&&runtime.env.UAA_V2_ENABLED==='1'&&runtime.settings.raw.AIEnabled===false,'STUDIO_AUTHORITY_SCHEDULE_NOT_SELECTED',503);
 const row=await runtime.store.first('SELECT phase FROM studio_authority_schedule WHERE singleton=1'),phase=row?.phase??0;
 const count=phase===0?await scanStudioAuthorityChanges(runtime,{limit:8}):phase===1?await fanoutStudioAuthorityChanges(runtime,{limit:8}):phase===2?await materializeStudioAuthorityJobs(runtime,{limit:1}):phase===3?await deliverStudioAuthorityPages(runtime,{limit:4}):await (async()=>{await runCoursePublicationStep(runtime);return recoverStudioBusiness(runtime,{limit:2});})();
 const g=runtime.store.guard(row?'SELECT 1 FROM studio_authority_schedule WHERE singleton=1 AND phase=?':'SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM studio_authority_schedule)',row?[phase]:[]);await runtime.store.batch([g[0],runtime.store.stmt('INSERT INTO studio_authority_schedule VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET phase=excluded.phase',(phase+1)%5),g[1]]);return {phase,count};
}
export function createStudioAuthorityScheduler({getRuntime}){return async(event,env,ctx)=>{if(env.UAA_V2_ENABLED!=='1'||event.cron!=='* * * * *')return;const job=(async()=>runStudioAuthorityMaintenance(await getRuntime(env)))();if(ctx?.waitUntil)ctx.waitUntil(job);else await job;};}

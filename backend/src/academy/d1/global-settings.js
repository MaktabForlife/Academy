import {managementStore,managementError as fail} from './management-store.js';
import {payloadHash} from '../../programs/timetable-model.js';

export function globalSettings(repository,auth){
 const store=managementStore(repository,auth),p=store.p,key='PlatformTimezone';
 const revision=(row,policy)=>payloadHash({value:row?.setting_value,updatedAt:row?.updated_at,...(policy?{noteRetentionRevision:policy.revision}:{})});
 const retention=data=>data.noteRetention?.[0];
 const dto=policy=>policy?{months:policy.months,warningDays:policy.warning_days}:null;
 const load=()=>store.load({settings:p('SELECT * FROM academy_settings WHERE setting_key=?',key),...(repository.features?.noteRetention?{noteRetention:p('SELECT * FROM note_retention_policy WHERE singleton=1')}:{})});
 return {async run(action,input){
  if(!auth.state.account.global_admin)throw fail('Only Global Admin can change app settings.',403,'FORBIDDEN');
  if(action==='get'){const data=await load(),row=data.settings[0];return {timezone:row.setting_value,noteRetention:dto(retention(data)),revision:await revision(row,retention(data))};}
  const timezone=String(input.timezone||'').trim();try{if(!timezone||timezone.length>100)throw Error();new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{throw fail('Choose a valid time zone.');}
  return store.change('GLOBAL_SETTINGS','ACADEMY','save',input,async()=>{
   const data=await load(),row=data.settings[0];if(input.revision!==await revision(row,retention(data)))throw fail('App settings changed. Refresh before saving.',409,'ROW_CHANGED');
   const timezoneChanged=timezone!==row.setting_value,next=timezoneChanged?{setting_value:timezone,updated_at:new Date().toISOString()}:row,policy=retention(data);
   const months=input.noteRetention?.months??policy?.months,warningDays=input.noteRetention?.warningDays??policy?.warning_days;
   if(policy&&(!Number.isInteger(months)||months<1||months>120||!Number.isInteger(warningDays)||warningDays<1||warningDays>90||warningDays>=28*months))throw fail('Choose 1–120 retention months and 1–90 warning days, with the warning shorter than the retention period.');
   const changed=policy&&(months!==policy.months||warningDays!==policy.warning_days),updated=policy?{...policy,months,warning_days:warningDays,revision:policy.revision+Number(Boolean(changed))}:null;
   return {data,statements:[...(timezoneChanged?[p('UPDATE academy_settings SET setting_value=?,updated_at=?,updated_by_account_id=? WHERE setting_key=?',timezone,next.updated_at,auth.user.accountid,key)]:[]),...(changed?[p('UPDATE note_retention_policy SET months=?,warning_days=?,revision=revision+1 WHERE singleton=1',months,warningDays)]:[])],result:{timezone,noteRetention:dto(updated),revision:await revision(next,updated)},fields:[...(timezoneChanged?['PlatformTimezone']:[]),...(changed?['NoteRetention']:[])],cacheEffects:timezoneChanged?['public-timetable']:[]};
  });
 }};
}

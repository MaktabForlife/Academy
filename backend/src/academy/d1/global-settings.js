import {managementStore,managementError as fail} from './management-store.js';
import {payloadHash} from '../../programs/timetable-model.js';

export function globalSettings(repository,auth){
 const store=managementStore(repository,auth),p=store.p,key='PlatformTimezone';
 const revision=row=>payloadHash({value:row?.setting_value,updatedAt:row?.updated_at});
 const load=()=>store.load({settings:p('SELECT * FROM academy_settings WHERE setting_key=?',key)});
 return {async run(action,input){
  if(!auth.state.account.global_admin)throw fail('Only Global Admin can change the app time zone.',403,'FORBIDDEN');
  if(action==='get'){const data=await load(),row=data.settings[0];return {timezone:row.setting_value,revision:await revision(row)};}
  const timezone=String(input.timezone||'').trim();try{if(!timezone||timezone.length>100)throw Error();new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{throw fail('Choose a valid time zone.');}
  return store.change('GLOBAL_SETTINGS','ACADEMY','save',input,async()=>{
   const data=await load(),row=data.settings[0];if(input.revision!==await revision(row))throw fail('The app time zone changed. Refresh before saving.',409,'ROW_CHANGED');
   const next={setting_value:timezone,updated_at:new Date().toISOString()};
   return {data,statements:[p('UPDATE academy_settings SET setting_value=?,updated_at=?,updated_by_account_id=? WHERE setting_key=?',timezone,next.updated_at,auth.user.accountid,key)],result:{timezone,revision:await revision(next)},fields:['PlatformTimezone'],cacheEffects:['public-timetable']};
  });
 }};
}

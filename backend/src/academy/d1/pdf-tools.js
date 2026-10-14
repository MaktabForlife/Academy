import {PDF_TOOL_DEFAULTS,normalizePdfTools} from '../../../../js/m4l-pdf-tools-model.mjs';
import {managementStore,managementError} from './management-store.js';
import {payloadHash} from '../../programs/timetable-model.js';
const key='AcademyPdfToolDefaults';
const read=row=>row?normalizePdfTools(JSON.parse(row.setting_value)):{...PDF_TOOL_DEFAULTS};
const revision=row=>payloadHash(row?.setting_value||'');
export async function publicPdfTools(repository){
 const row=await repository.db.prepare('SELECT setting_value FROM academy_settings WHERE setting_key=?').bind(key).first();
 return {settings:read(row)};
}
export function pdfTools(repository,auth){
 const store=managementStore(repository,auth),p=store.p;
 const requireAdmin=()=>{if(!auth.state.account.global_admin)throw managementError('Only Global Admin can change PDF tool defaults.',403,'FORBIDDEN');};
 const load=()=>store.load({pdfDefaults:p('SELECT setting_value FROM academy_settings WHERE setting_key=?',key)});
 return {async run(action,input={}){
  requireAdmin();
  if(action==='get'){const data=await load(),row=data.pdfDefaults[0];return {settings:read(row),standard:{...PDF_TOOL_DEFAULTS},revision:await revision(row)};}
  if(action!=='save')throw managementError('PDF tool action not found.',404);
  let settings;try{settings=normalizePdfTools(input.settings);}catch(error){throw managementError(error.message);}
  return store.change('PDF_TOOL_DEFAULTS','ACADEMY','save',input,async()=>{
   const data=await load(),row=data.pdfDefaults[0];
   if(input.revision!==await revision(row))throw managementError('PDF defaults changed elsewhere. Your choices are kept; reload before saving.',409,'ROW_CHANGED');
   const value=JSON.stringify(settings),now=new Date().toISOString();
   return {data,statements:[p('INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id',key,value,now,auth.user.accountid)],result:{settings,revision:await payloadHash(value)},fields:['PdfToolDefaults']};
  });
 }};
}

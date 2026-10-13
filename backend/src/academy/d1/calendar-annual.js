import {ISLAMIC_EVENT_DESCRIPTIONS} from '../../lib/academy-calendar.js';
const normalized=label=>String(label||'').trim().toLocaleLowerCase();
export const annualKey=row=>row.event_type==='ISLAMIC_DAY'?'AcademyHijriAnnual:'+normalized(row.description):'AcademyHolidayAnnual:'+row.event_id;
export const annualRevision=(settings,row)=>{const entry=settings.find(s=>s.setting_key===annualKey(row));return entry?entry.setting_value+'/'+(entry.updated_at||''):'';};
export function annualFlag(settings,row){const entry=settings.find(s=>s.setting_key===annualKey(row));return entry?entry.setting_value==='1':row.event_type==='ISLAMIC_DAY'&&ISLAMIC_EVENT_DESCRIPTIONS.includes(row.description)&&row.description!=='First Taraweeh';}
// Carry the label, never an assumed Gregorian date, into a new Hijri year editor.
export function hijriYearRows(events,settings,year){
 const groups=new Map();for(const row of events.filter(r=>r.active&&r.event_type==='ISLAMIC_DAY'&&r.description!=='First Taraweeh')){const key=normalized(row.description);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 return [...groups.values()].flatMap(rows=>{rows.sort((a,b)=>a.start_date.localeCompare(b.start_date));const annual=annualFlag(settings,rows.at(-1)),dated=rows.filter(r=>r.start_date.startsWith(year+'-'));return dated.length?dated.map(row=>({...row,annual})):annual?[{...rows.at(-1),start_date:'',end_date:'',annual:true,date_required:true}]:[];});
}

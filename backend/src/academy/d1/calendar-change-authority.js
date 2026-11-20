// Only an immutable native Calendar receipt can associate this GLOBAL storage
// key with its original Program. Other GLOBAL rows retain GlobalAdmin authority.
export function calendarAnnualAuthority({input,saved,change,table,prior,next}){
 if(input?.dataset!=='ACADEMY_CALENDAR'||typeof input.scope!=='string'||!input.scope.startsWith('PROGRAM:')||change?.fullRows===true||table!=='academy_settings'||!next||String(next.scope).toUpperCase()!=='GLOBAL')return null;
 const event=saved?.event,key='AcademyHolidayAnnual:'+event?.id;
 if(!event||event.kind!=='ACADEMY_HOLIDAY'||typeof event.id!=='string'||String(event.scopeKey).toUpperCase()!==input.scope.toUpperCase()||next.row.setting_key!==key||prior&&prior.row.setting_key!==key||next.row.setting_value!==String(Number(event.annual===true&&saved.removed!==true)))return null;
 const matches=(change.tables||[]).filter(d=>d.table==='academy_calendar_events').flatMap(d=>d.after||[]).filter(v=>v.row.event_id===event.id&&String(v.scope).toUpperCase()===input.scope.toUpperCase()&&String(v.row.scope_key).toUpperCase()===input.scope.toUpperCase()&&v.row.calendar_kind==='ACADEMY_HOLIDAY'&&v.row.event_type==='TERM');
 if(matches.length!==1)return null;
 const confirmed=(change.confirmations||[]).some(c=>c.table==='academy_settings'&&Array.isArray(c.fields)&&c.fields.includes('setting_value')&&c.keys?.some(k=>k.setting_key===key));
 return confirmed?input.scope.toUpperCase():null;
}

const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
// These settings are published in the GLOBAL component. Supplying the head as
// an indexed scalar lookup avoids walking every component of every setup head.
const globalRows=head=>`SELECT json_extract(row.value,'$.setting_key') setting_key,json_extract(row.value,'$.setting_value') setting_value FROM main.setup_head_components v JOIN main.setup_components c USING(component_id),json_each(c.rows_json) row WHERE v.head_id=${literal(head)} AND v.table_name='academy_settings' AND v.scope_key='GLOBAL'`;

// Published settings are immutable, non-personal configuration. This bounded
// isolate cache holds only scalar values, keyed by deployment namespace/head;
// never request objects, DB handles, credentials, live flags or permissions.
const published=new Map(),maxHeads=16;
export async function publishedSettings(db,namespace,head){
 const key=JSON.stringify([namespace,head]);
 if(published.has(key))return published.get(key);
 const rows=(await db.prepare(globalRows(head)).all()).results;
 const timezone=rows.find(r=>r.setting_key==='PlatformTimezone');
 if(!timezone)return null;
 const result=Object.freeze({setting_value:timezone.setting_value,memorisation_cards:rows.find(r=>r.setting_key==='PersonalMemorisationCards')?.setting_value});
 if(published.size>=maxHeads)published.delete(published.keys().next().value);
 published.set(key,result);return result;
}

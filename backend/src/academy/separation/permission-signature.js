const upper=v=>String(v??'').toUpperCase();
export function permissionSignature({globalAdmin,roles=[],subscriptions=[],grants=[],monthlyMedia,surahGrants}){
 return JSON.stringify([Boolean(globalAdmin),[...new Set(roles.map(r=>upper(r.activity_key)+'|'+r.role))].sort(),[...new Set(subscriptions.map(r=>upper(r.activity_key)))].sort(),grants.map(r=>upper(r.id)+'|'+upper(r.activityKey)).sort(),...(monthlyMedia!==undefined?[monthlyMedia.map(r=>[upper(r.activity_key),r.lesson_month,r.revision,r.class_ids_json].join('|')).sort()]:[]),...(surahGrants!==undefined?[surahGrants.map(r=>[upper(r.activity_key),r.surah_id,r.revision].join('|')).sort()]:[])]);
}

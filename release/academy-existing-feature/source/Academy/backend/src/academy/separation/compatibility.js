// Empty query shapes allow retained adapters to compile without carrying the
// retired import/history tables into the fresh databases. They never read the
// old database and cannot accept a write to a retired table.
export function emptyCompatibilityDatabase(db,shapes,{currentGrants=false}={}){
 const mapped="main.role_assignments WHERE grant_source='LEGACY_MAPPED' AND active=1 AND review_state='CONFIRMED'";
 const computed=currentGrants?{
  legacy_access_evidence:"SELECT account_id,activity_key,legacy_source_role source_role,1 source_effective FROM "+mapped,
  role_import_reviews:"SELECT assignment_id review_id,account_id,activity_key,legacy_source_role source_value,role proposed_role,'REQUIRED' status,NULL source_locator,NULL note,NULL reviewed_by_account_id,NULL reviewed_at FROM "+mapped,
  role_mapping_decisions:"SELECT DISTINCT legacy_source_role source_role,role target_role FROM "+mapped
 }:{};
 const escaped=Object.keys(shapes).join('|'),read=new RegExp('\\b(FROM|JOIN)\\s+(?:main\\.)?('+escaped+')\\b','gi'),write=new RegExp('\\b(?:INSERT(?:\\s+OR\\s+\\w+)?\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(?:main\\.)?('+escaped+')\\b','i');
 function rewrite(sql){
  if(write.test(sql))throw Object.assign(Error('This retired workflow is not part of the fresh database.'),{status:410,code:'RETIRED_STORE_WRITE'});
  const names=new Set();let result=sql.replace(read,(_,keyword,name)=>{names.add(name.toLowerCase());return keyword+' __split_empty_'+name.toLowerCase();});if(!names.size)return sql;
  for(const name of names)result=result.replace(new RegExp('\\b(?:main\\.)?'+name+'\\.','gi'),'__split_empty_'+name+'.');
  const ctes=[...names].map(name=>'__split_empty_'+name+' AS ('+(computed[name]||'SELECT '+shapes[name].map(column=>'NULL AS "'+column+'"').join(',')+' WHERE 0')+')').join(',');
  return /^\s*WITH\b/i.test(result)?result.replace(/^\s*WITH(\s+RECURSIVE)?\s+/i,(_,recursive)=>'WITH'+(recursive||'')+' '+ctes+', '):'WITH '+ctes+' '+result;
 }
 return new Proxy(db,{get(target,name){if(name==='splitGeneration')return 'SPLIT_V1';if(name==='prepare')return sql=>target.prepare(rewrite(sql));const value=target[name];return typeof value==='function'?value.bind(target):value;}});
}

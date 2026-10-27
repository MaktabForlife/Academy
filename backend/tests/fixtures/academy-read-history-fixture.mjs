// Disposable synthetic publication history. Never load production data.
export function seedReadHistory(f,count=12){
 const batch=f.databases.core.prepare('SELECT batch_id FROM setup_heads WHERE head_id=?').get(f.head).batch_id;
 for(let i=0;i<count;i++){
  const id='synthetic-history-'+i;
  for(const owner of ['core','admin']){
   const db=f.databases[owner];
   db.prepare('INSERT INTO setup_batches SELECT ?,actor_account_id,scope_keys_json,source_version,expected_head,digest,manifest_json,created_at,accepted_head FROM setup_batches WHERE batch_id=?').run(id,batch);
   db.prepare('INSERT INTO setup_components SELECT ?||component_id,?,table_name,scope_key,rows_json,row_count,digest FROM setup_components WHERE batch_id=?').run(id+'-',id,batch);
  }
  const db=f.databases.core;
  db.prepare('INSERT INTO setup_heads SELECT ?,head_id,?,accepted_at,accepted_by FROM setup_heads WHERE head_id=?').run(id,id,f.head);
  db.prepare('INSERT INTO setup_head_components SELECT ?,table_name,scope_key,?||component_id FROM setup_head_components WHERE head_id=?').run(id,id+'-',f.head);
 }
 return 'synthetic-history-'+(count-1);
}

// Core-only operational definitions. These are deliberately NOT Admin
// federation snapshot columns: immutable Core events must be read live by the
// bounded Core sender, never copied from an Admin planning snapshot.
const spec=(columns,keys)=>({columns,keys,referenceColumns:keys,adminColumns:[],defaults:Object.fromEntries(columns.map(k=>[k,null]))});
export const masterOutboxLayout={
 jwt_v110_master_streams:spec(['target_app','kind','parent_account_id','version'],['target_app','kind','parent_account_id']),
 jwt_v110_master_outbox:spec(['event_id','target_app','kind','parent_account_id','version','operation_id','issued_at_s','retain_until_s','facts_json','wire_json','payload_digest','attempts','next_attempt_at_s','delivered_at_s'],['event_id'])
};

// Direct lifecycle writers also own Core operational metadata; browser
// subjects intentionally remain independent of the changing parent account.
Object.assign(masterOutboxLayout,{
 jwt_v110_master_lifecycle_streams:spec(['target_app','kind','subject_id','version'],['target_app','kind','subject_id']),
 jwt_v110_master_lifecycle_outbox:spec(['event_id','target_app','kind','subject_id','parent_account_id','version','operation_id','issued_at_s','retain_until_s','facts_json','wire_json','payload_digest','attempts','next_attempt_at_s','delivered_at_s'],['event_id'])
});
export const masterOutboxTables=new Set(Object.keys(masterOutboxLayout));

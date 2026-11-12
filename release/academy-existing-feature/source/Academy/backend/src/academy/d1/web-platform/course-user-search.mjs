import {fail,id} from './protocol.mjs';

// Page native keys before matching names. A search never captures the complete
// user/role matrix, and never creates or links an account.
export async function courseUserSearch(db,activity,input){
 const search=typeof input.search==='string'?input.search.trim():'';
 if(search.length>80)throw fail('Use a search of up to 80 characters.');
 const after=input.after?id(input.after):'';
 const candidates=(await db.prepare('SELECT account_id,display_name,login_link_id,active FROM accounts WHERE account_id>? COLLATE NOCASE ORDER BY account_id COLLATE NOCASE LIMIT 51').bind(after).all()).results;
 const page=candidates.slice(0,50),keys=JSON.stringify(page.map(a=>a.account_id));
 const facts=(await db.prepare('SELECT account_id,admitted FROM website_platform_account_state WHERE account_id IN(SELECT value FROM json_each(?))').bind(keys).all()).results;
 const permitted=new Set(facts.filter(a=>a.admitted).map(a=>a.account_id.toLowerCase())),query=search.toLowerCase();
 const matches=page.filter(a=>a.active&&permitted.has(a.account_id.toLowerCase())&&(!query||[a.display_name,a.account_id,a.login_link_id].some(v=>String(v||'').toLowerCase().includes(query))));
 const accounts=matches.slice(0,20).map(a=>({accountId:a.account_id,displayName:a.display_name,uniqueId:a.login_link_id}));
 const more=matches.length>20||candidates.length>50;
 return {success:true,schema:'COURSE_USER_SEARCH_V1',activityKey:activity,accounts,more,nextCursor:more?(matches.length>20?accounts.at(-1).accountId:page.at(-1)?.account_id)||null:null};
}

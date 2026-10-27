import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readRemembered,rememberVerified,forgetRemembered,rememberedKey,clearPrivateState} from '../../js/m4l-academy-accounts.mjs';
const base='https://synthetic.example';
function storage(seed={}){const values=new Map(Object.entries(seed));return {get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};}

test('remembered IDs contain only bounded display hints, deduplicate and retain ten recent successful logins',()=>{
 const s=storage();
 for(let i=0;i<12;i++)assert(rememberVerified(s,base,{uniqueid:'USER-'+i,displayName:'Member '+i,pin:'1234',token:'secret',contexts:[{role:'GLOBAL_ADMIN'}]},i));
 const rows=readRemembered(s,base);assert.equal(rows.length,10);assert.equal(rows[0].id,'USER-11');assert.equal(rows.at(-1).id,'USER-2');
 assert.deepEqual(Object.keys(rows[0]),['id','name','lastUsed']);assert.doesNotMatch(s.getItem(rememberedKey(base)),/1234|secret|contexts|GLOBAL_ADMIN/);
 assert(rememberVerified(s,base+'/',{uniqueid:'user-11',displayName:'Renamed'},20));assert.equal(readRemembered(s,base).length,10);assert.equal(readRemembered(s,base)[0].name,'Renamed');
 assert.deepEqual(readRemembered(s,'https://another.example'),[],'Remembered hints are scoped to the API environment');
});
test('invalid, corrupt, oversized and unavailable browser storage cannot establish an account',()=>{
 const s=storage();assert.equal(rememberVerified(s,base,{uniqueid:'<script>'}),false);assert.equal(rememberVerified(s,base,{}),false);
 for(const value of ['bad JSON','{}','x'.repeat(65537),'[null,{"id":"bad id","lastUsed":3}]']){s.setItem(rememberedKey(base),value);assert.deepEqual(readRemembered(s,base),[]);}
 const unavailable={getItem(){throw Error('blocked');},setItem(){throw Error('quota');},removeItem(){throw Error('blocked');}};
 assert.deepEqual(readRemembered(unavailable,base),[]);assert.equal(rememberVerified(unavailable,base,{uniqueid:'USER'}),false);assert.equal(forgetRemembered(unavailable,base),false);
});
test('removing an ID or forgetting all preserves the active session and other local data',()=>{
 const s=storage({m4l_account_token:'current',unrelated:'keep'});
 rememberVerified(s,base,{uniqueid:'USER-1'});rememberVerified(s,base,{uniqueid:'USER-2'});
 assert(forgetRemembered(s,base,'user-1'));assert.deepEqual(readRemembered(s,base).map(r=>r.id),['USER-2']);
 assert(forgetRemembered(s,base));assert.deepEqual(readRemembered(s,base),[]);assert.equal(s.getItem('m4l_account_token'),'current');assert.equal(s.getItem('unrelated'),'keep');
});
test('switch cleanup discards private responses and context while retaining remembered IDs and owner-scoped drafts',()=>{
 const local=storage({m4l_account_token:'current',m4l_account_context:'old',m4l_account_contexts:'old',m4l_account_workspace:'ADMIN',maktab_token:'old','m4l_library_v1:api:personal:old':'private','m4l_library_v1:api:public:all':'public',m4l_academy_timetable_old:'private',unrelated:'keep'});
 rememberVerified(local,base,{uniqueid:'USER'});
 const session=storage({m4l_academy_signed_in:'OLD','m4l_read_v1:old':'private','m4l_admin_progress_dashboard_old':'private','m4l_academy_daily_timetable_old':'private','m4l_academy_timetable_return_v2:ADMIN':'old','owner-scoped-planning-draft':'draft'});
 clearPrivateState(local,session);
 for(const k of ['m4l_account_context','m4l_account_contexts','m4l_account_workspace','maktab_token','m4l_library_v1:api:personal:old','m4l_academy_timetable_old'])assert.equal(local.getItem(k),null,k);
 assert.equal(session.length,1);assert.equal(session.getItem('owner-scoped-planning-draft'),'draft');assert.equal(local.getItem('m4l_account_token'),'current');assert.equal(readRemembered(local,base)[0].id,'USER');assert.equal(local.getItem('m4l_library_v1:api:public:all'),'public');
});

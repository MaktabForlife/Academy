// Safe presentation metadata. The planner independently checks current authority
// and the same requirement again when reading or saving a plan.
export async function planRequirements(repository,keys){
 const unique=[...new Set(keys.map(k=>k.toUpperCase()))];
 if(!unique.length)return new Map();
 let rows;try{
 rows=(await repository.db.prepare('SELECT activity_key,plans_required FROM lesson_plan_requirements WHERE activity_key IN(SELECT value FROM json_each(?))').bind(JSON.stringify(unique)).all()).results;
 }catch(error){if(/no such (?:table|column):/i.test(error.message))return new Map();throw error;}
 return new Map(rows.map(r=>[r.activity_key.toUpperCase(),r.plans_required!==0]));
}

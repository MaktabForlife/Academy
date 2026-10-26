// Read the latest audited moderation decision. Entering or changing marks clears it.
export async function assessmentTableStates(s,rows){
 if(!rows.length)return new Map();const ids=JSON.stringify(rows.map(a=>a.assessment_id));
 const data=(await s.p(`SELECT a.assessment_id,COALESCE(r.entered,0) entered,COALESCE(r.accessed,0) accessed,
  (SELECT details_json FROM assessment_events e WHERE e.assessment_id=a.assessment_id AND e.action='marks-moderated' ORDER BY CAST(json_extract(e.details_json,'$.revision') AS INTEGER) DESC,e.occurred_at DESC,e.event_id DESC LIMIT 1) moderation
  FROM assessments a LEFT JOIN (SELECT assessment_id,sum(latest_mark_id IS NOT NULL) entered,sum(first_accessed_at IS NOT NULL OR latest_submission_id IS NOT NULL) accessed FROM assessment_recipients WHERE assessment_id IN(SELECT value FROM json_each(?)) GROUP BY assessment_id) r USING(assessment_id)
  WHERE a.assessment_id IN(SELECT value FROM json_each(?))`,ids,ids).all()).results;
 return new Map(data.map(r=>{const m=r.moderation?JSON.parse(r.moderation):null;return [r.assessment_id,{...r,moderated:Boolean(m?.approved)}];}));
}

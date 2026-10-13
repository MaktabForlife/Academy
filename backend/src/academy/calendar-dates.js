const add=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function termBreaks(terms,year,scopeKey='ACADEMY') {
 const first=`${year}-01-01`,last=`${year}-12-31`,intervals=terms.filter(e=>e.active&&e.startDate<=last&&e.endDate>=first).map(e=>[e.startDate<first?first:e.startDate,e.endDate>last?last:e.endDate]).sort(([a],[b])=>a.localeCompare(b));
 if(!intervals.length)return [];
 let cursor=first;const breaks=[];
 for(const [start,end] of intervals){if(cursor<start)breaks.push([cursor,add(start,-1)]);if(cursor<=end)cursor=add(end,1);}
 if(cursor<=last)breaks.push([cursor,last]);
 return breaks.map(([startDate,endDate])=>({id:`BREAK:${scopeKey}:${startDate}`,kind:'TERM_BREAK',description:'Term holiday',scopeKey,startDate,endDate,active:true,derived:true,editable:false,teachingImpact:'NO_TEACHING'}));
}


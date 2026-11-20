// An explicit refresh publishes only the already accepted public timetable.
// A transport failure never schedules or replays another publication request.
export async function refreshNativePublicTimetable(client,{isCurrent=()=>true}={}){
 await client.prepareSensitive({activeWork:true});
 const owner=client.ownerKey();
 if(!owner||!isCurrent(owner))throw new DOMException('The Admin workspace changed.','AbortError');
 const result=await client.request('/api/admin/platform/public-timetable/refresh',{}, {headers:{'X-Academy-Workspace':'ADMIN'}});
 if(!isCurrent(owner)||client.ownerKey()!==owner||!client.isCurrentResult(result))throw new DOMException('The timetable refresh reply belongs to an earlier Admin view.','AbortError');
 if(result.success!==true||!Number.isSafeInteger(result.lessons)||result.lessons<0||typeof result.generatedAt!=='string'||!Number.isFinite(Date.parse(result.generatedAt)))throw Error('The native timetable refresh could not be confirmed.');
 return result;
}

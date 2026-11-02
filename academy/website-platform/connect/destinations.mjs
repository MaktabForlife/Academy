// Narrow connector allowlist. The source separately authorises every destination
// at code issuance and exchange; this never accepts arbitrary return URLs.
export function academyDestination(value,origin){
 let url;try{url=new URL(value,origin);}catch{return null;}
 if(url.href==='https://hifz.maktab4life.org/')return url.href;
 if(url.origin!==origin)return null;
 const path=url.pathname,query=url.search,hash=url.hash,activity=/^#activity\/(?:PROGRAM|COURSE)\/[-A-Za-z0-9_:]+(?:\/(?:learn|teach)(?:\/(?:timetable|assessment|planning|attendance|surahs-duas))?)?$/;
 if(['/academy/','/academy/admin/'].includes(path)){
  if(!query&&(activity.test(hash)||path==='/academy/admin/'&&/^#assessment-admin\/(?:PROGRAM|COURSE)\/[-A-Za-z0-9_:]+$/.test(hash)))return url.href;
  if(path==='/academy/admin/'&&!query&&(['#administration/curriculum','#administration/access','#administration/users','#assessment-admin'].includes(hash)||/^#administration\/media\/(?:PROGRAM|COURSE)\/(?:[-A-Za-z0-9_:]|%3A)+$/i.test(hash)))return url.href;
  const home=path==='/academy/admin/'?'#administration':/^#timetable\/(learn|teach)$/.test(hash)?hash:null;
  if(home===hash&&['','?circlesTool=messages'].includes(query))return url.href;
  if(!query&&hash===(path==='/academy/admin/'?'#progress-admin':'#progress'))return url.href;
 }
 if(path==='/programs/'&&/^\?program=PRG-[0-9a-f-]{36}&tab=participants&participants=access$/i.test(query)&&!hash)return url.href;
 if(path==='/academy/library/'&&(!query||/^\?workspace=(LEARN|TEACH|ADMIN)$/.test(query))&&!hash||path==='/academy/calendar/'&&/^\?view=(learn|teach|admin)$/.test(query)&&!hash||path==='/academy/enrolment/manage/'&&query==='?view=requests'&&!hash||path==='/recorder/'&&query==='?academy=1'&&!hash)return url.href;
 return null;
}

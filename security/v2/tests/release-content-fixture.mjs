import {newCourse} from '../../../../AcademyStudio/public/shared/model.mjs';

const history={allowed:'2025-11-15',denied:'2025-10-15'};
const item=(id,title,date)=>Object.freeze({id,title,date,website:id+'-website',recording:id+'-recording'});

export const studioReleaseContent=Object.freeze({
 tafseer:{
  title:'Tafseer and Tadabbur',kind:'TAFSEER',offer:'r11-tafseer',
  allowed:item('r11-tafseer-open','Fixture Tafseer November recording',history.allowed),
  denied:item('r11-tafseer-restricted','Fixture Tafseer October recording',history.denied)
 },
 mothers:{
  title:'Mothers of the Ummah',kind:'TAFSEER',offer:'r11-mothers',
  allowed:item('r11-mou-open','Fixture MOU November playlist',history.allowed),
  denied:item('r11-mou-restricted','Fixture MOU October playlist',history.denied)
 },
 courses:{
  title:'Courses',kind:'COURSE',
  allowed:item('r11-course-free','Fixture free course',history.allowed),
  denied:item('r11-course-paid','Fixture paid course',history.allowed)
 }
});

export function nativeStudioAccount(f,actor){
 const db=f.databases.studio;
 db.prepare('INSERT INTO accounts VALUES(?,?,1,1,?,?,0) ON CONFLICT(account_id) DO NOTHING')
  .run(actor.sub,'Fixture Studio learner',actor.ce,f.now()*1000);
}

export async function seedStudioReleaseContent(f,area,{paidSub=null}={}){
 const model=studioReleaseContent[area],db=f.databases.studio;
 const documents=new Map(),items=[];
 const offering=(id,kind,title,policy)=>{
  db.prepare('INSERT INTO offerings VALUES(?,?,?,1,1)').run(id,kind,title);
  db.prepare("INSERT INTO source_access_scopes VALUES(?,'WEBSITE',1,1,1,1,'UTC','[]')").run(id);
  db.prepare("INSERT INTO access_handovers(offering_id,transfer_id,phase,generation,source_version,revision,created_at) VALUES(?,?,'COMMITTED',1,1,1,?)").run(id,'fixture-'+id,f.now()*1000);
  if(policy)db.prepare('INSERT INTO course_access_models VALUES(?,?)').run(id,policy);
 };
 const person=(offer,sub,purchase=false)=>{
  db.prepare("INSERT INTO participation VALUES(?,?,1,0,?,'fixture-cohort')").run(sub,offer,Number(purchase));
  db.prepare("INSERT INTO source_access_people VALUES(?,?,1,1,?,1,'[]',1,0)").run(sub,offer,f.now()*1000);
 };
 if(model.offer){
  offering(model.offer,model.kind,model.title);
  person(model.offer,f.sub);
  if(area==='mothers')db.prepare("INSERT INTO programme_offerings VALUES('mothers',?,'MONTHLY')").run(model.offer);
  db.prepare("INSERT INTO paid_months VALUES(?,?,?,'fixture-cohort','Fixture historical entitlement')")
   .run(f.sub,model.offer,model.allowed.date.slice(0,7));
 }
 for(const [role,entry] of [['allowed',model.allowed],['denied',model.denied]]){
  const offer=model.offer??entry.id;
  if(!model.offer){
   offering(offer,model.kind,entry.title,role==='allowed'?'FREE':'PAID');
   person(offer,f.sub);
   if(paidSub&&paidSub!==f.sub)person(offer,paidSub,role==='denied');
   else if(paidSub)db.prepare('UPDATE participation SET purchased=1 WHERE account_id=? AND offering_id=?').run(paidSub,offer);
  }
  const edition='fixture-content/'+entry.website+'.json';
  const book=newCourse();
  book.id=entry.website;
  book.name=entry.title;
  book.home={...book.home,headline:entry.title,imageId:'',imageAlt:''};
  book.lessons[0].id=entry.id+'-lesson';
  book.lessons[0].title=entry.title+' reading';
  documents.set(edition,book);
  db.prepare('INSERT INTO websites(website_id,offering_id,title,completion_month,draft_key,published_key,enabled,completion_date) VALUES(?,?,?,?,?,?,1,?)')
   .run(entry.website,offer,entry.title,entry.date.slice(0,7),edition,edition,entry.date);
  db.prepare('INSERT INTO source_access_websites(website_id,offering_id,enabled) VALUES(?,?,1)').run(entry.website,offer);
  db.prepare("INSERT INTO objects VALUES(?,NULL,'video/youtube',?,0,'fixture','abcdefghijk')").run(entry.recording,entry.title);
  db.prepare("INSERT INTO attachments VALUES(?,?,?,?,?,?,'fixture-cohort',?,'RECORDING',1)")
   .run(entry.recording,offer,entry.website,entry.recording,book.lessons[0].id,entry.date,entry.title);
  if(area==='mothers'){
   db.prepare('INSERT INTO mou_playlists(playlist_id,offering_id,website_id,created_at) VALUES(?,?,?,?)')
    .run(entry.id,offer,entry.website,f.now()*1000);
   db.prepare('INSERT INTO mou_playlist_items VALUES(?,?)').run(entry.id,entry.recording);
  }else items.push({key:entry.id,kind:model.kind,title:entry.title,websiteId:entry.website,recordingCount:1});
 }
 documents.set('public/circles/catalogue.json',{format:'CIRCLES_PUBLIC_CATALOGUE_V1',items});
 f.envs.studio.CONTENT={async get(key){
  if(!documents.has(key))return null;
  const value=documents.get(key),body=JSON.stringify(value);
  return {body:new Response(body).body,size:Buffer.byteLength(body),async json(){return structuredClone(value);}};
 }};
 return model;
}

import {actualState,administers,hasAdminAuthority} from './workspace-access.js';
import {monthlyEnabled} from './monthly-media-policy.js';

const same=(a,b)=>String(a).toUpperCase()===String(b).toUpperCase();
const defaultCardKeys=['foundations','yaseen','saffat','ankabut','luqman','muzammil','qasas','sajdah'];
export function mayReadSurah(auth,row){
 if(row.card_key==='foundations')return true;
 if(!auth)return false;
 if(auth.adminView)return administers(auth,row.activity_key);
 // Website reading follows current Admin authority even in personal Learn/Teach.
 if(hasAdminAuthority(auth,row.activity_key))return true;
 if(auth.state.roles.some(r=>same(r.activity_key,row.activity_key)&&['PROGRAM_ADMIN','TEACHER'].includes(r.role)))return true;
 if((actualState(auth).surahGrants||[]).some(r=>same(r.activity_key,row.activity_key)&&r.surah_id===(row.surah_id||row.surahId)))return true;
 return Boolean(row.monthly_enabled&&(actualState(auth).monthlyMedia||[]).some(r=>same(r.activity_key,row.activity_key)&&r.lesson_month===row.completion_date.slice(0,7)));
}

export async function publicFoundationsLinks(repository){
 if(!monthlyEnabled(repository))return {};
 const db=repository.coreDb||repository.db;
 const rows=(await db.prepare(`SELECT s.surah_id,s.activity_key FROM program_surahs s JOIN activities a USING(activity_key)
  JOIN program_surah_website_documents d USING(surah_id)
  WHERE s.card_key='foundations' AND s.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND d.enabled=1
  AND EXISTS(SELECT 1 FROM academy_settings f WHERE f.setting_key='SurahWebsitePublished:'||s.surah_id AND f.setting_value='1') LIMIT 2`).all()).results;
 if(rows.length!==1)return {};
 const row=rows[0];return {foundations:{href:'/academy/course-websites/public/?program='+encodeURIComponent(row.activity_key.slice(8))+'&surah='+encodeURIComponent(row.surah_id),label:'Open lessons'}};
}

// Return destinations only. Card design and summaries belong to the website.
// Re-evaluate the live manual completion date and publication switches on every
// fresh response; accepted website text cannot override current entitlement.
export async function surahWebsiteLinks(repository,auth){
 const empty={links:{},websites:[]};
 if(!auth||!monthlyEnabled(repository))return empty;
 const state=actualState(auth),global=Boolean(state.account.global_admin),keys=[...new Set([
  ...state.roles.filter(r=>['PROGRAM_ADMIN','TEACHER'].includes(r.role)).map(r=>r.activity_key),
  ...(state.monthlyMedia||[]).map(r=>r.activity_key),
  ...(state.surahGrants||[]).map(r=>r.activity_key)
 ])];
 if(!global&&!keys.length)return empty;
 const db=repository.coreDb||repository.db,adminKeys=[...new Set(state.roles.filter(r=>r.role==='PROGRAM_ADMIN').map(r=>r.activity_key))];
 const links={},ambiguous=new Set();
 const adminAreas=(state.activities||[]).filter(a=>a.kind==='PROGRAM'&&a.name.trim().toLowerCase()==='tafseer'&&hasAdminAuthority(auth,a.activity_key));
 if(adminAreas.length===1){
  const area=adminAreas[0],setting=await repository.db.prepare('SELECT public_card_json FROM program_settings WHERE activity_key=?').bind(area.activity_key).first();
  const saved=JSON.parse(setting?.public_card_json||'{}').websiteCards;
  for(const key of Array.isArray(saved)?saved.map(c=>c.id):defaultCardKeys)links[key]={href:'/programs/?program='+encodeURIComponent(area.activity_key.slice(8))+'&tab=media',label:'Manage websites'};
 }
 const rows=(await db.prepare(`SELECT s.surah_id,s.activity_key,s.name,s.card_key,s.completion_date,p.enabled monthly_enabled,
  (d.enabled=1 AND EXISTS(SELECT 1 FROM academy_settings f WHERE f.setting_key='SurahWebsitePublished:'||s.surah_id AND f.setting_value='1')) published
  FROM program_surahs s JOIN program_monthly_media_policies p USING(activity_key) JOIN activities a USING(activity_key)
  LEFT JOIN program_surah_website_documents d USING(surah_id)
  WHERE s.active=1 AND a.active=1 AND a.lifecycle='ACTIVE'
  AND (?=1 OR s.activity_key IN(SELECT value FROM json_each(?)))
  AND ((d.enabled=1 AND EXISTS(SELECT 1 FROM academy_settings f WHERE f.setting_key='SurahWebsitePublished:'||s.surah_id AND f.setting_value='1'))
   OR ?=1 OR s.activity_key IN(SELECT value FROM json_each(?)))
  ORDER BY s.completion_date DESC,s.name LIMIT 201`).bind(Number(global),JSON.stringify(keys),Number(global),JSON.stringify(adminKeys)).all()).results;
 const sites=rows.filter(r=>r.published?mayReadSurah(auth,r):hasAdminAuthority(auth,r.activity_key)).slice(0,200).map(r=>({id:r.surah_id,activityKey:r.activity_key,name:r.name,cardKey:r.card_key,completionDate:r.completion_date,published:Boolean(r.published),href:'/academy/course-websites/'+(r.published?'view/':'')+'?program='+encodeURIComponent(r.activity_key.slice(8))+'&surah='+encodeURIComponent(r.surah_id)}));
 const mapped=new Set();
 for(const site of sites){
  if(!site.cardKey)continue;
  if(mapped.has(site.cardKey)||ambiguous.has(site.cardKey)){delete links[site.cardKey];ambiguous.add(site.cardKey);continue;}
  mapped.add(site.cardKey);links[site.cardKey]={href:site.href,label:site.published?'Open lessons':'Edit website',code:site.id};
 }
 const websites=sites.filter(s=>s.published).map(({published,...s})=>s);
 return {links,websites};
}

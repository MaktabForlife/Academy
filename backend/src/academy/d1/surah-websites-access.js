import {actualState,administers,readerPreview} from './workspace-access.js';
import {monthlyEnabled} from './monthly-media-policy.js';

const same=(a,b)=>String(a).toUpperCase()===String(b).toUpperCase();
export function mayReadSurah(auth,row){
 if(row.card_key==='foundations')return true;
 if(!auth)return false;
 if(auth.adminView)return administers(auth,row.activity_key);
 if(administers(auth,row.activity_key)||readerPreview(auth,row.activity_key))return true;
 if(auth.state.roles.some(r=>same(r.activity_key,row.activity_key)&&['PROGRAM_ADMIN','TEACHER'].includes(r.role)))return true;
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
  ...(state.monthlyMedia||[]).map(r=>r.activity_key)
 ])];
 if(!global&&!keys.length)return empty;
 const db=repository.coreDb||repository.db;
 const rows=(await db.prepare(`SELECT s.surah_id,s.activity_key,s.name,s.card_key,s.completion_date,p.enabled monthly_enabled
  FROM program_surahs s JOIN program_monthly_media_policies p USING(activity_key) JOIN activities a USING(activity_key)
  JOIN program_surah_website_documents d USING(surah_id)
  WHERE s.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND d.enabled=1
  AND (?=1 OR s.activity_key IN(SELECT value FROM json_each(?)))
  AND EXISTS(SELECT 1 FROM academy_settings f WHERE f.setting_key='SurahWebsitePublished:'||s.surah_id AND f.setting_value='1')
  ORDER BY s.completion_date DESC,s.name LIMIT 201`).bind(Number(global),JSON.stringify(keys)).all()).results;
 const websites=rows.filter(r=>mayReadSurah(auth,r)).slice(0,200).map(r=>({id:r.surah_id,activityKey:r.activity_key,name:r.name,cardKey:r.card_key,completionDate:r.completion_date,href:'/academy/course-websites/view/?program='+encodeURIComponent(r.activity_key.slice(8))+'&surah='+encodeURIComponent(r.surah_id)}));
 const links={},ambiguous=new Set();
 for(const site of websites){
  if(!site.cardKey)continue;
  if(links[site.cardKey]||ambiguous.has(site.cardKey)){delete links[site.cardKey];ambiguous.add(site.cardKey);continue;}
  links[site.cardKey]={href:site.href,label:'Open lessons',code:site.id};
 }
 return {links,websites};
}

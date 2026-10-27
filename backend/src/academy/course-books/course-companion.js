import {SURAH_KAHF_LESSONS} from './surah-kahf.js';

export function isSurahKahfCourse(activity){
 if(activity?.kind!=='COURSE')return false;
 const name=String(activity.name||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g,'').replace(/[^a-z\u0621-\u064a]/g,'');
 return ['surahalkahf','surahkahf','suratalkahf','suratkahf','سورةالكهف'].includes(name);
}

// Called only by the already-authorised Course feed. Retain the collection's
// publication boundary: a hidden, absent or draft booklet never releases text.
export function courseCompanion(activity,files){
 if(!isSurahKahfCourse(activity)||files?.media?.state!=='PUBLISHED')return null;
 const pdfs=(files.media.assets||[]).filter(a=>a.kind==='PDF');
 const pdf=pdfs.find(a=>/nurturing|surah[ _-]*(al[ _-]*)?kahf/i.test((a.name||'')+' '+(a.filename||'')))||(pdfs.length===1?pdfs[0]:null);
 if(!pdf)return null;
 return {id:'surah-kahf',edition:'2026-10-18',lessons:SURAH_KAHF_LESSONS,
  pdf:{lessonId:files.media.id,assetId:pdf.id},title:'The nurturing system of Allah Ta’ala in Surah Kahf'};
}

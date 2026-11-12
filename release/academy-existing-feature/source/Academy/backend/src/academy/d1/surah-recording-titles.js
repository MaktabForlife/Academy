// Use explicitly named lessons. Generic Tafseer recordings stay unassigned.
const names={
 yaseen:['surah yaseen','surah yasin','surah ya sin','سورة يس'],
 saffat:['surah as saffat','surah saffat','surah saffaat','surah saaffat','سورة الصافات'],
 ankabut:['surah al ankabut','surah ankabut','surah al ankaboot','surah ankaboot','سورة العنكبوت'],
 luqman:['surah luqman','surah lukman','سورة لقمان'],
 muzammil:['surah al muzzammil','surah al muzammil','surah muzzammil','surah muzammil','سورة المزمل'],
 qasas:['surah al qasas','surah qasas','سورة القصص'],
 sajdah:['surah as sajdah','surah al sajdah','surah sajdah','surah sajda','سورة السجدة'],
 foundations:['foundations of tafseer','introduction to tafseer','ulumul quran','ulumul qur an']
};
export const recordingTitle=text=>String(text||'').toLowerCase().replace(/[-_’‘']/g,' ').replace(/\s+/g,' ').trim();
export function surahRecordingTerms(area){
 const title=recordingTitle(area.name),known=names[area.card_key];
 if(known?.some(name=>title===name||title.startsWith(name+' ')))return known;
 return title?[title]:[];
}

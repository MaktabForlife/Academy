/* Standalone Academy activity helpers; no HifzHelper account dependencies. */
const SURAHS = [
  [1,'Al-Fatihah'],[2,'Al-Baqarah'],[3,'Aal-e-Imran'],[4,'An-Nisa'],[5,"Al-Ma'idah"],
  [6,"Al-An'am"],[7,"Al-A'raf"],[8,'Al-Anfal'],[9,'At-Tawbah'],[10,'Yunus'],
  [11,'Hud'],[12,'Yusuf'],[13,"Ar-Ra'd"],[14,'Ibrahim'],[15,'Al-Hijr'],
  [16,'An-Nahl'],[17,'Al-Isra'],[18,'Al-Kahf'],[19,'Maryam'],[20,'Ta-Ha'],
  [21,'Al-Anbiya'],[22,'Al-Hajj'],[23,"Al-Mu'minun"],[24,'An-Nur'],[25,'Al-Furqan'],
  [26,"Ash-Shu'ara"],[27,'An-Naml'],[28,'Al-Qasas'],[29,'Al-Ankabut'],[30,'Ar-Rum'],
  [31,'Luqman'],[32,'As-Sajdah'],[33,'Al-Ahzab'],[34,'Saba'],[35,'Fatir'],
  [36,'Ya-Sin'],[37,'As-Saffat'],[38,'Sad'],[39,'Az-Zumar'],[40,'Ghafir'],
  [41,'Fussilat'],[42,'Ash-Shura'],[43,'Az-Zukhruf'],[44,'Ad-Dukhan'],[45,'Al-Jathiyah'],
  [46,'Al-Ahqaf'],[47,'Muhammad'],[48,'Al-Fath'],[49,'Al-Hujurat'],[50,'Qaf'],
  [51,'Adh-Dhariyat'],[52,'At-Tur'],[53,'An-Najm'],[54,'Al-Qamar'],[55,'Ar-Rahman'],
  [56,"Al-Waqi'ah"],[57,'Al-Hadid'],[58,'Al-Mujadilah'],[59,'Al-Hashr'],[60,'Al-Mumtahanah'],
  [61,'As-Saff'],[62,"Al-Jumu'ah"],[63,'Al-Munafiqun'],[64,'At-Taghabun'],[65,'At-Talaq'],
  [66,'At-Tahrim'],[67,'Al-Mulk'],[68,'Al-Qalam'],[69,'Al-Haqqah'],[70,"Al-Ma'arij"],
  [71,'Nuh'],[72,'Al-Jinn'],[73,'Al-Muzzammil'],[74,'Al-Muddaththir'],[75,'Al-Qiyamah'],
  [76,'Al-Insan'],[77,'Al-Mursalat'],[78,'An-Naba'],[79,"An-Nazi'at"],[80,'Abasa'],
  [81,'At-Takwir'],[82,'Al-Infitar'],[83,'Al-Mutaffifin'],[84,'Al-Inshiqaq'],[85,'Al-Buruj'],
  [86,'At-Tariq'],[87,"Al-A'la"],[88,'Al-Ghashiyah'],[89,'Al-Fajr'],[90,'Al-Balad'],
  [91,'Ash-Shams'],[92,'Al-Layl'],[93,'Ad-Duha'],[94,'Ash-Sharh'],[95,'At-Tin'],
  [96,'Al-Alaq'],[97,'Al-Qadr'],[98,'Al-Bayyinah'],[99,'Az-Zalzalah'],[100,'Al-Adiyat'],
  [101,"Al-Qari'ah"],[102,'At-Takathur'],[103,'Al-Asr'],[104,'Al-Humazah'],[105,'Al-Fil'],
  [106,'Quraysh'],[107,"Al-Ma'un"],[108,'Al-Kawthar'],[109,'Al-Kafirun'],[110,'An-Nasr'],
  [111,'Al-Masad'],[112,'Al-Ikhlas'],[113,'Al-Falaq'],[114,'An-Nas']
];
function surahName(n){ const s = SURAHS.find(x=>x[0]===n); return s ? s[1] : ''; }


const ACTIVITY_ICONS={
  sih: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.51 4.04 3 5.5l7 7Z"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M5 8h14L12 17z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>',
  zoomFit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  eraser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 21H8L3.6 16.6a2 2 0 0 1 0-2.8l10.2-10.2a2 2 0 0 1 2.8 0l5.2 5.2a2 2 0 0 1 0 2.8L15 18"/><path d="M13.5 5.5 18 10"/></svg>'
};
function iconHtml(name){return ACTIVITY_ICONS[name]||'';}
function showBanner(message){const el=document.getElementById('activity-status');el.textContent=message;}
const puzzle=document.querySelector('kaaba-juz-tracker');
if(puzzle)document.getElementById('kaaba-reset').addEventListener('click',()=>{if(confirm('Start the Kaaba puzzle again?'))puzzle.reset();});

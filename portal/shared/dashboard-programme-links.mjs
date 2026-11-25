const academyProgrammeLabels={
 alimiyah:'Aalimiyah',
 reboot:'Reboot Your Maktab',
 'arabic-intensive':'Arabic Intensive'
};

export function dashboardProgrammeLinks(summary,websiteNavigation){
 if(!summary&&!websiteNavigation)return null;
 const permitted=new Set((summary?.programmeNavigation||[]).map(row=>row.navigationKey));
 const academia=Object.entries(academyProgrammeLabels)
  .filter(([key])=>permitted.has(key))
  .map(([key,label])=>({key,label}));
 return {...websiteNavigation,academia};
}

export function academyDashboardProgrammeLinks(summary){
 // Keep the signed dashboard as the sole source of app links. Empty or
 // older responses must not revive a legacy navigation result or default link.
 const links=summary?.entryLinks;
 const studioAdmitted=links?.studioAdmitted===true;
 return dashboardProgrammeLinks(summary,{
  studioAdmitted,
  tafseer:studioAdmitted?links.tafseer??null:null,
  courses:studioAdmitted?links.courses??null:null,
  mothers:studioAdmitted&&links.mothers===true,
  hifz:typeof links?.studioAdmitted==='boolean'?links.hifz??null:null
 });
}

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

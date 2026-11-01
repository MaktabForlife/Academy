import {navigationMappings} from './navigation.mjs';

// Presentation grouping only. Every member already comes from the selected
// native workspace's authorised personal activity rows; never infer by name.
export function programmePageGroups(home,env){
 if(!home.signedIn)return [];
 const mappings=navigationMappings(env),shared=new Set([mappings.alimiyah,mappings['arabic-intensive']].filter(Boolean).map(id=>id.toUpperCase()));
 const keys=(home.personalActivities||[]).filter(row=>row.kind==='PROGRAM'&&row.active!==false&&row.lifecycle!=='ARCHIVED'&&row.roles?.length&&shared.has(row.id.toUpperCase())).map(row=>'PROGRAM:'+row.id);
 return keys.length?[keys]:[];
}

import {managementError} from './management-store.js';

export const courseCardKey=activity=>'AcademyCoursePublicCard:'+String(activity).toUpperCase();
export function normalizePublicCard(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw managementError('Enter the public card time, title and description.');
  const card={};
  for(const [key,limit] of [['time',12],['title',80],['description',240]]){
    if(typeof value[key]!=='string'||value[key].length>limit)throw managementError(`Public card ${key} must be text with at most ${limit} characters.`);
    card[key]=value[key].trim();
  }
  if(Object.values(card).some(Boolean)&&!Object.values(card).every(Boolean))throw managementError('Fill all three public card fields, or leave all three empty to hide the card.');
  return card;
}

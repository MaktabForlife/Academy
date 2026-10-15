import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const script=await readFile(new URL('../../js/m4l-academy-catalogue.js',import.meta.url),'utf8');
const element=()=>({dataset:{},attrs:{},children:[],classList:{add(){}},setAttribute(k,v){this.attrs[k]=v;},append(child){this.children.push(child);},remove(){this.removed=true;}});
const cards=Array.from({length:34},(_,i)=>({...element(),querySelector:()=>({alt:'Original Academy artwork for Course '+i})}));
const track={...element(),querySelectorAll:()=>cards};
const ids=Object.fromEntries(['film-track','film-status','film-prev','film-next','film-toggle'].map(id=>[id,id==='film-track'?track:element()]));
const pages=element(),actions=element(),frame=element();let changed;
const mobile={matches:false,addEventListener(_type,fn){changed=fn;}};
const document={getElementById:id=>ids[id],querySelector:s=>s==='.film-pages'?pages:s==='.film-actions'?actions:frame,createElement:element};
runInNewContext(script,{document,matchMedia:()=>mobile});
const visible=()=>cards.filter(c=>!c.hidden).length;
assert.equal(visible(),5);assert.equal(ids['film-prev'].disabled,true);assert.equal(ids['film-status'].textContent,'1 of 7');assert.equal(ids['film-toggle'].removed,true);
ids['film-next'].onclick();assert.equal(ids['film-status'].textContent,'2 of 7');assert.equal(cards[5].hidden,false);assert.equal(cards[0].hidden,true);
track.onkeydown({target:track,key:'End',preventDefault(){}});assert.equal(ids['film-status'].textContent,'7 of 7');assert.equal(visible(),4);assert.equal(ids['film-next'].disabled,true);
mobile.matches=true;changed();assert.equal(visible(),4);assert.equal(ids['film-status'].textContent,'1 of 9');
track.onkeydown({target:track,key:'End',preventDefault(){}});assert.equal(visible(),2);assert.equal(ids['film-status'].textContent,'9 of 9');
assert.equal(cards.length,34);for(const card of cards){assert(card.attrs['aria-label'].includes('Course'));assert.equal(card.children.length,1);}
const html=await readFile(new URL('../../academy/index.html',import.meta.url),'utf8');const posters=[...html.matchAll(/<a class="film-card"[^>]+>[\s\S]*?<\/a>/g)];assert.equal(posters.length,34);for(const [card]of posters){assert.match(card,/<img[^>]+alt="[^"]+"/);assert.match(card,/href="https:\/\/ummabbadacademy.com\/courses\//);}
console.log('Two-row course wall: paging, keyboard navigation, phone layout and all 34 destinations passed.');

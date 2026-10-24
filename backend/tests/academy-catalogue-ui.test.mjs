import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const script=await readFile(new URL('../../js/m4l-academy-catalogue.js',import.meta.url),'utf8');
const element=()=>({dataset:{},attrs:{},children:[],classList:{add(){}},setAttribute(k,v){this.attrs[k]=v;},append(child){this.children.push(child);},remove(){this.removed=true;}});
const cards=Array.from({length:34},(_,i)=>({...element(),querySelector:()=>({alt:'Original Academy artwork for Course '+i})}));
let scrollListener;
const track={...element(),clientWidth:900,scrollWidth:11000,scrollLeft:0,querySelectorAll:()=>cards,addEventListener(_type,fn){scrollListener=fn;},scrollBy({left}){this.scrollTo({left:this.scrollLeft+left});},scrollTo({left}){this.scrollLeft=Math.max(0,Math.min(this.scrollWidth-this.clientWidth,left));scrollListener?.();}};
const ids=Object.fromEntries(['film-track','film-status','film-prev','film-next','film-toggle'].map(id=>[id,id==='film-track'?track:element()]));
const pages=element();let resized;
const document={getElementById:id=>ids[id],querySelector:()=>pages,createElement:element};
runInNewContext(script,{document,window:{addEventListener(_type,fn){resized=fn;}},matchMedia:()=>({matches:true}),requestAnimationFrame:fn=>fn()});
assert.equal(cards.filter(c=>!c.hidden).length,34);assert.equal(ids['film-prev'].disabled,true);assert.equal(ids['film-toggle'].removed,true);assert.equal(pages.hidden,true);
ids['film-next'].onclick();assert(track.scrollLeft>0);assert.equal(ids['film-prev'].disabled,false);
track.onkeydown({target:track,key:'End',preventDefault(){}});assert.equal(track.scrollLeft,track.scrollWidth-track.clientWidth);assert.equal(ids['film-next'].disabled,true);
track.onkeydown({target:track,key:'Home',preventDefault(){}});assert.equal(track.scrollLeft,0);assert.equal(ids['film-prev'].disabled,true);
track.clientWidth=320;resized();assert.equal(cards.filter(c=>!c.hidden).length,34);
for(const card of cards){assert(card.attrs['aria-label'].includes('Course'));assert.equal(card.children.length,1);}
const html=await readFile(new URL('../../academy/index.html',import.meta.url),'utf8');const posters=[...html.matchAll(/<a class="film-card"[^>]+>[\s\S]*?<\/a>/g)];assert.equal(posters.length,34);for(const [card]of posters){assert.match(card,/<img[^>]+alt="[^"]+"/);assert.match(card,/href="https:\/\/ummabbadacademy.com\/courses\//);}
console.log('Self-paced rail: scrolling, keyboard navigation, responsive resizing and all 34 destinations passed.');

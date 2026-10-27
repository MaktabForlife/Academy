import {newCourse,newBlock,validateCourse} from '../../../../academy/course-websites/model.mjs';
import {SURAH_KAHF_LESSONS} from './surah-kahf.js';
import {isSurahKahfCourse} from './course-companion.js';

// Convert only our trusted, checked-in edition. Imported HTML is never accepted.
function tree(html){
 const root={tag:'root',children:[]},stack=[root];
 for(const token of html.match(/<[^>]*>|[^<]+/g)||[]){
  if(token.startsWith('</')){stack.pop();continue;}
  if(token.startsWith('<')){const tag=token.match(/^<([a-z0-9]+)/i)?.[1]?.toLowerCase();if(!tag)continue;const node={tag,cls:token.match(/class="([^"]*)"/)?.[1]||'',noteKey:token.match(/data-note-key="([^"]*)"/)?.[1]||'',children:[]};stack.at(-1).children.push(node);if(!['br','input','img','hr'].includes(tag))stack.push(node);}
  else stack.at(-1).children.push(token);
 }
 return root;
}
const decode=text=>text.replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,s=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[s]).replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n)));
const text=node=>typeof node==='string'?decode(node):node.children.map(text).join(node.tag==='br'?'\n':'');
const clean=node=>text(node).replace(/\s+/g,' ').trim();
const nodes=node=>node.children.filter(n=>typeof n!=='string');
const find=(node,predicate)=>{if(typeof node==='string')return [];return [...(predicate(node)?[node]:[]),...nodes(node).flatMap(n=>find(n,predicate))];};
export function kahfBlocks(html,prefix){
 const result=[];
 const add=(type,fields)=>{const block=newBlock(type);block.id=prefix+'-b'+result.length;Object.assign(block,fields);result.push(block);};
 const visit=node=>{
  if(typeof node==='string'){if(node.trim())add('text',{text:decode(node).trim()});return;}
  if(['button','textarea','input'].includes(node.tag))return;
  if(node.cls.includes('ayah-card')){const arabic=find(node,n=>n.cls.includes('arabic-text'))[0],reference=find(node,n=>n.cls.includes('ayah-reference'))[0];add('ayah',{arabic:arabic?clean(arabic):'',reference:reference?clean(reference):'',translation:find(node,n=>n.tag==='p'&&!n.cls.includes('arabic-text')).map(clean).join('\n')});return;}
  if(node.cls.includes('word-pair')){const pair=nodes(node);for(let i=0;i<pair.length;i+=2){const values=pair.slice(i,i+2).map(n=>({arabic:find(n,x=>x.tag==='span').map(clean).join(' '),meaning:find(n,x=>['strong','small'].includes(x.tag)).map(clean).join(' · ')}));add('words',{leftArabic:values[0]?.arabic||'',leftMeaning:values[0]?.meaning||'',rightArabic:values[1]?.arabic||'',rightMeaning:values[1]?.meaning||''});}return;}
  if(node.tag==='blockquote'){const arabic=nodes(node).filter(n=>n.cls.includes('arabic-text'));for(const a of arabic)add('arabic',{arabic:clean(a)});add('quote',{text:nodes(node).filter(n=>n.tag!=='cite'&&!n.cls.includes('arabic-text')).map(clean).filter(Boolean).join('\n\n'),attribution:find(node,n=>n.tag==='cite').map(clean).join(' ')});return;}
  if(['ul','ol'].includes(node.tag)){add('list',{items:nodes(node).filter(n=>n.tag==='li').map(clean),ordered:node.tag==='ol'});return;}
  if(node.cls.includes('journal-question')){const question=find(node,n=>n.tag==='label')[0];add('reflection',{text:question?nodes(question).map(clean).join(' '):clean(node),legacyNoteKey:find(node,n=>Boolean(n.noteKey))[0]?.noteKey||''});return;}
  if(['p','aside'].includes(node.tag)||node.cls.includes('lesson-callout')){const value=clean(node);if(value)add(node.cls.includes('arabic-text')?'arabic':node.cls.includes('source-')||node.tag==='aside'?'note':node.cls.includes('lesson-callout')?'callout':'text',node.cls.includes('arabic-text')?{arabic:value}:{text:value});return;}
  for(const child of node.children)visit(child);
 };
 for(const node of tree(html).children)visit(node);
 return result;
}
export function courseWebsiteTemplate(activity){
 const course=newCourse();
 if(isSurahKahfCourse(activity)){
  course.lessons=SURAH_KAHF_LESSONS.map(lesson=>({...lesson,sections:lesson.sections.map((section,i)=>({id:lesson.id+'-s'+i,title:section.title,label:section.label,blocks:kahfBlocks(section.body,lesson.id+'-s'+i)}))}));
  for(const lesson of course.lessons)if(!lesson.journal){const block=newBlock('reflection');block.id=lesson.id+'-general-reflection';block.text='What would you like to carry from this lesson?';block.legacyNoteKey='general';lesson.sections.push({id:lesson.id+'-reflection',title:'Pause and reflect',label:'YOUR REFLECTION',blocks:[block]});}
  for(const theme of course.home.themes)theme.lessonId=course.lessons.find(l=>l.title.toLowerCase().includes(theme.label.toLowerCase()))?.id||'';
 }else{
  course.name=activity.name;course.tag='COURSE';course.home.headline='A space to learn and grow.';course.home.subtitle=activity.name;course.home.description='Welcome to your course.';course.home.themes=[];course.home.journeyTitle='Your learning journey';
 }
 validateCourse(course);return course;
}

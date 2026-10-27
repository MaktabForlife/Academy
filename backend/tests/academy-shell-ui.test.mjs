import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../../js/m4l-academy-mobile.js',import.meta.url),'utf8');
function fixture({compact=true,verified=true,mode='ADMIN_LEARN'}={}){
 const handlers=new Map(),created=[];
 function node(tag='div'){
  const n={tag,className:'',children:[],dataset:{},attrs:{},hidden:false,innerHTML:'',textContent:'',parentElement:null,
   setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},getAttribute(k){return this.attrs[k]??null;},
   append(...items){for(const item of items){item.remove();item.parentElement=this;this.children.push(item);}},
   prepend(item){item.remove();item.parentElement=this;this.children.unshift(item);},
   get childNodes(){return this.children;},
   before(item){this.parentElement.insertBefore(item,this);},
   replaceWith(...items){const parent=this.parentElement;for(const item of items)parent.insertBefore(item,this);this.remove();},
   after(item){item.remove();item.parentElement=this.parentElement;const siblings=this.parentElement.children;siblings.splice(siblings.indexOf(this)+1,0,item);},
   remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;},
   insertBefore(item,before){item.remove();item.parentElement=this;const index=this.children.indexOf(before);this.children.splice(index<0?this.children.length:index,0,item);},
   replaceChildren(){this.children=[];this.innerHTML='';},addEventListener(){},close(){this.open=false;},showModal(){this.open=true;},
   matches(s){return s.split(',').some(value=>{const q=value.trim();return q.startsWith('.')?this.className.split(' ').includes(q.slice(1)):q==='[data-shell-role]'?Boolean(this.dataset.shellRole):q.startsWith('#')?this.id===q.slice(1):this.tag===q;});},
   querySelectorAll(s){return this.children.flatMap(child=>[...(child.matches(s)?[child]:[]),...child.querySelectorAll(s)]);},
   querySelector(s){return this.querySelectorAll(s)[0]||null;}};
  n.classList={contains:c=>n.className.split(' ').includes(c),add:(...classes)=>{n.className=[...new Set([...n.className.split(' ').filter(Boolean),...classes])].join(' ');},toggle(c,on){const classes=new Set(n.className.split(' ').filter(Boolean));if(on??!classes.has(c))classes.add(c);else classes.delete(c);n.className=[...classes].join(' ');}};
  created.push(n);
  return n;
 }
 const body=node('body');if(compact){body.dataset.academyAdminContext='badge';body.dataset.academyHeaderDates='true';}
 const sidebar=node('aside');sidebar.className='academy-connected-sidebar';const brand=node('a');brand.className='academy-connected-brand';sidebar.append(brand,node('nav'));body.append(sidebar);
 const document={body,title:'Surah Al Kahf',createElement:node,getElementById:id=>body.querySelector('#'+id),querySelector:s=>body.querySelector(s),querySelectorAll:s=>body.querySelectorAll(s),addEventListener(){}};
 const boundary={adminRealm:()=>mode.startsWith('ADMIN'),adminAccess:()=>verified,current:()=>mode,audience:()=>mode.replace(/^ADMIN_/,''),homeUrl:()=>'/academy/admin/#timetable/learn'};
 const data={signedIn:true,globalAdmin:true,profile:{name:'Synthetic Admin'},workspaceAccess:{learn:true,teach:true,admin:true},personalActivities:[]};
 const window={M4L_ACADEMY_WORKSPACE:boundary,M4L_ACADEMY_SHELL_DATA:data,addEventListener:(key,fn)=>handlers.set(key,fn)};
 runInNewContext(source,{window,document,location:{pathname:'/academy/course-companion/surah-kahf/',hash:'#overview'},localStorage:{getItem:()=>verified?'synthetic-session':''},matchMedia:()=>({matches:false,addEventListener(){}})});
 const profile=node();profile.className='academy-profile';const name=node('strong');name.id='academy-shell-name';const role=node('small');role.id='academy-shell-role';profile.append(name,role);window.M4L_ACADEMY_SHELL.banners.append(profile);window.M4L_ACADEMY_SHELL.update(data);
 return {window,document,body,profile,role,context:created.find(n=>n.id==='academy-workspace-context'),boundary,handlers,update(next=data){window.M4L_ACADEMY_SHELL.update(next);}};
}

test('course headers use the compact Admin badge beside the verified account and retain read-only context',()=>{
 const f=fixture();assert.equal(f.context.hidden,false);assert.equal(f.context.parentElement.className,'academy-admin-identity');assert.equal(f.context.parentElement.parentElement,f.profile);assert.equal(f.context.className,'academy-admin-context');
 assert.match(f.context.innerHTML,/class="academy-admin-badge"/);assert.match(f.context.innerHTML,/ADMIN-LEARN · Student class view · read only/);assert.match(f.context.innerHTML,/data-curriculum-open/);assert.match(f.context.innerHTML,/aria-haspopup="dialog"/);
 assert.equal(f.role.textContent,'Admin-Learn · Student view');assert.ok(f.document.querySelector('.academy-date-box'));assert.ok(f.document.querySelector('.academy-connected-brand'));
});
test('an Admin URL alone never displays the badge and revoked access clears it',()=>{
 const unverified=fixture({verified:false});assert.equal(unverified.context.hidden,true);assert.equal(unverified.context.innerHTML,'');
 const f=fixture();f.boundary.adminAccess=()=>false;f.handlers.get('m4l-academy-access')();assert.equal(f.context.hidden,true);assert.equal(f.context.innerHTML,'');
 const learner=fixture({mode:'LEARN'});assert.equal(learner.context.hidden,true);assert.equal(learner.role.textContent,'Student');
});
test('the course reuses the V107.94 badge already shared by other workspace pages',()=>{
 const f=fixture({compact:false});assert.equal(f.context.className,'academy-admin-context');assert.equal(f.context.parentElement.className,'academy-admin-identity');assert.equal(f.context.parentElement.parentElement,f.profile);assert.match(f.context.innerHTML,/class="academy-admin-badge"/);assert.equal(f.document.querySelector('.academy-date-box'),null);
});

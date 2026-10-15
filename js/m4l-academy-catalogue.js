(() => {
 'use strict';
 const track=document.getElementById('film-track');if(!track)return;
 const cards=[...track.querySelectorAll('.film-card')],status=document.getElementById('film-status'),previous=document.getElementById('film-prev'),next=document.getElementById('film-next'),pages=document.querySelector('.film-pages');
 const mobile=matchMedia('(max-width:600px)');let page=0;
 track.classList.add('course-wall');track.setAttribute('role','group');track.setAttribute('aria-label','Self-paced courses');
 const actions=document.querySelector('.film-actions');document.querySelector('.film-window').append(actions);
 document.getElementById('film-toggle')?.remove();
 for(const card of cards){const image=card.querySelector('img'),title=(image?.alt||'Academy course').replace(/^Original Academy artwork for /,'');const caption=document.createElement('span');caption.className='wall-caption';caption.textContent=title;card.append(caption);card.setAttribute('aria-label',title+' (opens the Academy course website)');}
 const size=()=>mobile.matches?4:5;
 function show(){const count=Math.ceil(cards.length/size());page=Math.max(0,Math.min(page,count-1));cards.forEach((card,i)=>{card.hidden=i<page*size()||i>=(page+1)*size();card.dataset.wallSlot=String(i-page*size());});status.textContent=(page+1)+' of '+count;previous.disabled=page===0;next.disabled=page===count-1;pages.innerHTML='';for(let i=0;i<count;i++){const button=document.createElement('button');button.type='button';button.textContent=String(i+1);button.setAttribute('aria-label','Course wall page '+(i+1));button.setAttribute('aria-pressed',String(i===page));button.onclick=()=>{page=i;show();};pages.append(button);}}
 previous.onclick=()=>{page--;show();};next.onclick=()=>{page++;show();};
 track.onkeydown=e=>{if(e.target!==track)return;const count=Math.ceil(cards.length/size());if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();page=e.key==='Home'?0:e.key==='End'?count-1:page+(e.key==='ArrowRight'?1:-1);show();}};
 mobile.addEventListener('change',()=>{page=0;show();});show();
})();

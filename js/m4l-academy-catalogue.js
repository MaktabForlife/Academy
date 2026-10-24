/* Self-paced course posters remain available in one swipeable rail. */
(() => {
 'use strict';
 const track=document.getElementById('film-track');if(!track)return;
 const cards=[...track.querySelectorAll('.film-card')],previous=document.getElementById('film-prev'),next=document.getElementById('film-next');
 track.classList.add('course-rail');track.setAttribute('role','region');track.setAttribute('aria-label','Self-paced courses');
 document.getElementById('film-toggle')?.remove();document.querySelector('.film-pages').hidden=true;document.getElementById('film-status').hidden=true;
 for(const card of cards){card.hidden=false;const image=card.querySelector('img'),title=(image?.alt||'Academy course').replace(/^Original Academy artwork for /,'');const caption=document.createElement('span');caption.className='wall-caption';caption.textContent=title;card.append(caption);card.setAttribute('aria-label',title+' (opens the Academy course website)');}
 function state(){previous.disabled=track.scrollLeft<=1;next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;}
 const move=direction=>track.scrollBy({left:direction*Math.max(180,track.clientWidth*.8),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
 previous.onclick=()=>move(-1);next.onclick=()=>move(1);track.addEventListener('scroll',state,{passive:true});window.addEventListener('resize',state);
 track.onkeydown=event=>{if(event.target!==track)return;if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();if(event.key==='Home'||event.key==='End')track.scrollTo({left:event.key==='Home'?0:track.scrollWidth});else move(event.key==='ArrowRight'?1:-1);}};
 requestAnimationFrame(state);
})();

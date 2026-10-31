// Owner-requested presentation changes over the read-only released homepage.
export const homepageReviewId='20261031-reference-184223';
export function applyHomepageReview(root){
 const header=root.querySelector('.public-home-header');
 const byline=root.querySelector('.mobile-site-byline');
 if(header&&byline&&byline.parentElement!==header)header.append(byline);
 const hub=root.querySelector('.single-circle-home #animated-hub');
 if(!hub||hub.dataset.homepageReview===homepageReviewId)return;
 hub.dataset.homepageReview=homepageReviewId;
 hub.classList.add('home-reference-arrangement');
 const hifz=hub.querySelector('[data-home-area="hifz"]');
 const hifzCopy=hifz?.querySelector('.hub-image-copy');
 if(hifzCopy){
  hifzCopy.dataset.previewTextScope='reference-hifz';
  hifzCopy.innerHTML='<span class="meta">HIFZ ACADEMY</span><h3 class="arwa-name" lang="ar" dir="rtl">معهد أروى لتحفيظ القرآن</h3><p>A lifetime committed to the Qur’an.</p>';
 }
 const circle=hub.querySelector('.hub-academy-centre');
 if(circle){
  circle.dataset.previewTextScope='reference-circle';
  circle.innerHTML='<h1>Making space<br>for what<br>matters</h1><p class="hub-academy-tagline">Faith, woven into the life<br>you lead</p><p class="hub-academy-signoff">A place to connect and grow</p>';
 }
 const tafseer=hub.querySelector('[data-home-area="tafseer"]');
 if(tafseer){
  const combined=document.createElement('section');
  combined.className='hub-next hub-worship-learning';
  combined.dataset.homeArea='tafseer';combined.dataset.combinedWorship='';
  combined.dataset.previewTextScope='reference-worship';
  combined.setAttribute('aria-labelledby','worship-learning-title');
  combined.innerHTML='<div class="hub-panel-copy"><h3 id="worship-learning-title">Worship with understanding</h3><a class="worship-programme-row" href="/?login=1" data-action="visitor-access" data-id="tafseer"><h4>Tafseer &amp; Tadabbur</h4><span lang="ar" dir="rtl">التفسير والتدبر</span></a><a class="worship-programme-row" href="/?login=1" data-action="visitor-access" data-id="mothers"><h4>Mothers of the Ummah</h4><span lang="ar" dir="rtl">أمهات الأمة</span></a><p class="worship-purpose">Bringing knowledge into practice.</p></div>';
  tafseer.replaceWith(combined);
 }
 const academy=hub.querySelector('[data-home-area="academy"]');
 if(academy){
  academy.dataset.previewTextScope='reference-academia';
  academy.innerHTML='<span class="meta">ISLAMIC ACADEMIA</span><p class="academia-programmes">Aalimiyah Course<br>Reboot Your Maktab<br>Two Year Arabic Intensive</p><p class="academia-purpose">Learn with depth and purpose.</p>';
 }
 const arabic=hub.querySelector('[data-home-area="arabic-adventures"] .hub-panel-copy');
 if(arabic){
  arabic.dataset.previewTextScope='reference-arabic';
  arabic.innerHTML='<h3>Arabic Adventures</h3><p>Falling in love with the language of the<br>Qur’an.</p>';
 }
 hub.querySelector('[data-home-area="mothers"]')?.remove();
}

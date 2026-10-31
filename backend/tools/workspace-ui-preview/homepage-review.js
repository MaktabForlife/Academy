// Owner-requested presentation changes over the read-only released homepage.
export function applyHomepageReview(root){
 const header=root.querySelector('.public-home-header');
 const byline=root.querySelector('.mobile-site-byline');
 if(header&&byline&&byline.parentElement!==header)header.append(byline);
 const hub=root.querySelector('.single-circle-home #animated-hub');
 const tafseer=hub?.querySelector('[data-home-area="tafseer"]');
 if(tafseer&&!tafseer.hasAttribute('data-combined-worship')){
  const combined=document.createElement('section');
  combined.className='hub-panel hub-next hub-worship-learning';
  combined.dataset.homeArea='tafseer';combined.dataset.combinedWorship='';
  combined.dataset.previewTextScope='worship';
  combined.setAttribute('aria-labelledby','worship-learning-title');
  combined.innerHTML='<div class="hub-panel-copy"><h3 id="worship-learning-title">Worship with understanding</h3><h4 class="tafseer-name" lang="ar" dir="rtl"><a href="/?login=1" data-action="visitor-access" data-id="tafseer">التفسير والتدبر</a></h4><h4 class="worship-mou"><a href="/?login=1" data-action="visitor-access" data-id="mothers" aria-label="Mothers of the Ummah (MOU)">MOU</a></h4><p>Bringing knowledge into practice.</p></div>';
  tafseer.replaceWith(combined);
 }
 hub?.querySelector('[data-home-area="mothers"]')?.remove();
}

// Preview-only continuation, never the real one-use Academy connector.
export {accessArea,learningDestination} from '/shared/circles-sign-in.mjs';
import {identity} from '/api.mjs';
export async function signInFromCircles(){throw Error('Use the sample account chooser in this offline review.');}
let chooser;
export function openAcademyFromCircles({request,navigation,dashboard,onError=()=>{}}){
 let closed=false;const generation=identity.generation;
 void request('/__preview/continue',{body:{...(navigation?{navigation}:{}),...(dashboard?{dashboard}:{})}}).then(value=>{
  if(closed||generation!==identity.generation)return;
  if(value.choices.length===1){location.assign(value.choices[0].href);return;}
  chooser?.remove();chooser=document.createElement('dialog');chooser.className='circles-sign-in';chooser.setAttribute('aria-labelledby','preview-programme-title');
  const close=document.createElement('button');close.type='button';close.className='circles-sign-in-close';close.textContent='×';close.setAttribute('aria-label','Close programme choices');close.onclick=()=>chooser.close();
  const heading=document.createElement('h2');heading.id='preview-programme-title';heading.textContent=value.title;
  const nav=document.createElement('nav');nav.setAttribute('aria-label','Programme workspaces');
  for(const item of value.choices){const a=document.createElement('a');a.className='btn outline';a.textContent=item.label;a.href=item.href;nav.append(a);}
  chooser.append(close,heading,nav);document.body.append(chooser);chooser.showModal();
 }).catch(error=>{if(!closed&&generation===identity.generation)onError(error.message);});
 return {close(){closed=true;chooser?.close();}};
}

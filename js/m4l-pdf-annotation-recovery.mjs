import {createAcademyNativeRecovery} from './m4l-v111-editor.mjs';
const fail=(code,message)=>Object.assign(Error(message),{code});
export async function createPdfAnnotationRecovery({client,bytes,source='local',name='',file='',editor,onUnavailable=()=>{},recoveryFactory=createAcademyNativeRecovery}={}){
 if(!client?.session||!editor?.snapshotAnnotations||!editor?.restoreAnnotations||!['local','public'].includes(source))throw fail('PDF_DRAFT_SOURCE_REQUIRED','This PDF editor cannot prepare protected recovery.');
 const original=new Uint8Array(bytes).slice(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',original)),x=>x.toString(16).padStart(2,'0')).join('');
 let retained={};
 const capture=()=>retained.draft?.dirty?retained.draft.document:({format:'ACADEMY_PDF_LOCAL_DRAFT_1',sha256:digest,source,name:String(name).slice(0,240),file:source==='public'?String(file).slice(0,4110):'',annotations:editor.snapshotAnnotations()});
 const recovery=await recoveryFactory({client,resource:{type:'academy-pdf-annotations',source,sha256:digest},capture,baseVersion:()=>digest,isDirty:()=>Boolean(retained.draft?.dirty||editor.hasUnsaved()),onUnavailable});
 let disposed=false,timer=null,suppressed=true;retained=await recovery.prepare();
 const checkedRead=()=>client.request('/api/account/session',{});
 const verify=()=>{if(disposed)throw fail('PDF_DRAFT_DISPOSED','This PDF has been replaced.');};
 const checkpoint=async()=>{verify();if(retained.marker||retained.draft?.dirty)return;await recovery.checkpoint(capture(),{dirty:editor.hasUnsaved()});verify();};
 const unsubscribe=editor.onAnnotationsChanged(()=>{if(suppressed||disposed||retained.marker||retained.draft?.dirty)return;clearTimeout(timer);const view=client.getState().viewVersion;timer=setTimeout(()=>void checkpoint().catch(error=>{if(!disposed&&client.getState().viewVersion===view)onUnavailable(error);}),0);});
 return {
  sha256:digest,
  retained:()=>Boolean(retained.marker||retained.draft?.dirty),
  async review(){verify();const current=await checkedRead();verify();if(!client.isCurrentResult(current))throw fail('PDF_DRAFT_CONTEXT_CHANGED','Unlock Academy and read current access again.');const saved=await recovery.prepare();verify();retained=saved;const doc=saved.draft?.document;if(doc&&(doc.format!=='ACADEMY_PDF_LOCAL_DRAFT_1'||doc.sha256!==digest||doc.source!==source))throw fail('PDF_DRAFT_SOURCE_MISMATCH','Select the exact original PDF before restoring these annotations.');return {current,draft:doc||null,marker:saved.marker};},
  async resolve({confirmed=false,current,restore=false}={}){verify();if(!confirmed||!client.isCurrentResult(current))throw fail('MANUAL_RECOVERY_REQUIRED','Read current account access and explicitly choose how to recover.');const doc=retained.draft?.document;if(restore&&(!doc||doc.sha256!==digest||doc.source!==source))throw fail('PDF_DRAFT_SOURCE_MISMATCH','This draft belongs to a different PDF.');await recovery.discardRetained({confirmed:true,currentServerValue:current});verify();retained={};if(restore){suppressed=true;try{await editor.restoreAnnotations(doc.annotations);}finally{suppressed=false;}await checkpoint();}else await recovery.checkpoint(capture(),{dirty:false});return doc;},
  async activate(){verify();if(this.retained())throw fail('PDF_DRAFT_REVIEW_REQUIRED','Review the retained annotation draft before editing.');suppressed=false;const current=await checkedRead();verify();return current;},
  checkpoint,
  // Export is local. This controller neither posts PDF bytes nor creates an upload receipt.
  async exportLocal(){verify();if(this.retained())throw fail('PDF_DRAFT_REVIEW_REQUIRED','Review the retained annotation draft before exporting.');const current=await checkedRead();verify();const assertCurrent=()=>{if(!client.isCurrentResult(current))throw fail('PDF_EXPORT_CONTEXT_CHANGED','Unlock and revalidate this PDF before exporting.');};assertCurrent();await checkpoint();await editor.download({assertCurrent});assertCurrent();await recovery.checkpoint(capture(),{dirty:editor.hasUnsaved()});},
  async revalidate(){verify();return checkedRead();},
  dispose(){disposed=true;clearTimeout(timer);unsubscribe?.();recovery.dispose();}
 };
}

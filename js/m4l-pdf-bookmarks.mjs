import {createAcademyNativeRecovery} from './m4l-v111-editor.mjs';
import {pdfBookmark} from './m4l-pdf-bookmarks-model.mjs?v=106.82';
const browser=window;
const v2=()=>browser.M4L_ACADEMY_AUTH?.selected===true;
const token=()=>v2()?browser.M4L_ACADEMY_AUTH.ownerKey():localStorage.getItem('m4l_account_token')||'';
let proof=null,generation=0,recovery=null,recoveryOwner='',recoveryTask=null,proposal=null,absentRevision=null,lastReadError='';
let owner=token(),saved=null;
function changed(){browser.dispatchEvent(new Event('m4l-pdf-bookmarks-change'));}
function reset(){generation++;owner=token();saved=null;proof=null;absentRevision=null;if(recoveryOwner&&recoveryOwner!==owner){recovery?.dispose();recovery=null;recoveryTask=null;recoveryOwner='';proposal=null;}changed();}
async function request(action,input={}){
  if(v2()){
   const auth=browser.M4L_ACADEMY_AUTH,client=await auth.ready;await client.ensureFresh();if(owner!==token())reset();const ticket=generation,session=token();
   const response=await (browser.M4L_ACADEMY_WORKSPACE?.fetch||client.protectedFetch.bind(client))('/api/academy/bookmarks/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),result=await response.json();
   client.trackResult(result,response);if(ticket!==generation||session!==token()||!client.isCurrentResult(result))throw new DOMException('The Academy session changed.','AbortError');
   if(!response.ok||result.success!==true||action==='list'&&!Array.isArray(result.bookmarks))throw Object.assign(Error(result.error||'Your bookmarks could not be checked.'),{status:response.status});
   if(action==='list'){client.trackResult(result.bookmarks,response);absentRevision=result.absentRevision;proof=result;lastReadError='';}else if(result.bookmark)client.trackResult(result.bookmark,response);return result;
  }
  if(owner!==token())reset();
  const session=token();if(!session)throw Error('Sign in on Academy home to save and view your bookmarks.');
  const response=await fetch(`${browser.M4L_CONFIG?.API_BASE||''}/api/academy/bookmarks/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session},body:JSON.stringify(input)});
  const result=await response.json();
  if(session!==token())throw Error('Your Academy account changed. Open bookmarks again.');
  if(!response.ok||!result.success){if(response.status===401){saved=null;changed();}throw Error(result.error||'Bookmarks could not be updated. Please try again.');}
  return result;
}
async function recoveryController(){
 const auth=browser.M4L_ACADEMY_AUTH,client=await auth.ready;await client.ensureFresh();const current=token();if(!current||!client.hasSession())throw Error('Sign in to manage your bookmarks.');
 if(recovery&&recoveryOwner===current)return recovery;if(recoveryTask?.owner===current)return recoveryTask.promise;
 const task={owner:current};recoveryTask=task;task.promise=(async()=>{
  const made=await createAcademyNativeRecovery({client,resource:{type:'academy-bookmarks'},capture:()=>proposal,baseVersion:()=>proposal?.baseVersion||absentRevision,isDirty:()=>Boolean(proposal)});
  if(current!==token()){made.dispose();throw new DOMException('The Academy account changed.','AbortError');}recovery=made;recoveryOwner=current;return made;
 })().finally(()=>{if(recoveryTask===task)recoveryTask=null;});return task.promise;
}
async function checkedList(){const result=await request('list');saved=result.bookmarks;return result;}
async function nativeMutation(action,input){
 const controller=await recoveryController(),retained=await controller.prepare();
 if(retained.marker)throw Object.assign(Error('The previous bookmark save has an unknown outcome. Review the current saved bookmarks before choosing another action.'),{code:'SAVE_OUTCOME_UNKNOWN'});
 if(retained.draft?.dirty&&retained.draft.document&&!proposal)throw Object.assign(Error('A retained bookmark draft is available. Review it before making another change.'),{code:'DRAFT_RECOVERY_PENDING'});
 const current=await checkedList(),entry=action==='save'?pdfBookmark(input.bookmark):null,row=entry?current.bookmarks.find(b=>b.file===entry.file&&b.page===entry.page):current.bookmarks.find(b=>b.key===input.key),baseVersion=row?.revision||current.absentRevision;
 if(!/^[a-f0-9]{64}$/.test(baseVersion||''))throw Error('The current bookmark revision could not be checked.');
 const body={...(entry?{bookmark:entry}:{key:input.key}),expectedRevision:baseVersion};proposal={action,...body,baseVersion};
 const attempt=await controller.beforeMutation({path:'/api/academy/bookmarks/'+action,body});let result;
 try{result=await request(action,body);await controller.finishMutation(attempt,result);}catch(error){try{await controller.markUnknown(attempt);}catch{}throw Object.assign(Error(error.message||'The bookmark outcome could not be confirmed.'),{code:'SAVE_OUTCOME_UNKNOWN',status:error.status,causeCode:error.code});}
 try{proposal={...proposal,baseVersion:result.bookmark?.revision||result.revision||baseVersion};await controller.checkpoint(proposal,{dirty:false});}catch(error){lastReadError='Saved online; local draft cleanup could not be completed.';}
 proposal=null;try{await checkedList();}catch(error){saved=null;proof=null;lastReadError=error.message;}changed();return result;
}
export const academyBookmarks={
  signedIn:()=>v2()?browser.M4L_ACADEMY_AUTH.hasSession():Boolean(token()),
  writable:()=>!v2()||browser.M4L_ACADEMY_AUTH.hasSession(),
  readError:()=>lastReadError,
  async recover(){if(!v2())return null;const controller=await recoveryController(),retained=await controller.prepare();let current;if(retained.marker)await controller.reviewCurrent(async()=>current=await checkedList());else current=await checkedList();return {draft:retained.draft?.document||null,marker:retained.marker||null,current};},
  async resolveRecovery({confirmed=false,current,restore=false}={}){if(!v2()||!confirmed)throw Error('Review your current saved bookmarks first.');const controller=await recoveryController(),retained=await controller.prepare(),document=retained.draft?.document||null;await controller.discardRetained({confirmed:true,currentServerValue:current});proposal=restore?document:null;if(proposal)await controller.checkpoint(proposal,{dirty:true});return proposal;},
  async list(){const result=v2()?await checkedList():await request('list');saved=result.bookmarks;return saved;},
  async save(entry){const result=v2()?await nativeMutation('save',{bookmark:entry}):await request('save',{bookmark:pdfBookmark(entry)});if(v2())return result.bookmark;if(saved)saved=[result.bookmark,...saved.filter(b=>b.key!==result.bookmark.key)];changed();return result.bookmark;},
  async remove(key){if(v2()){await nativeMutation('delete',{key});return;}await request('delete',{key});if(saved)saved=saved.filter(b=>b.key!==key);changed();},
  loaded:()=>owner===token()&&saved!==null&&(!v2()||browser.M4L_ACADEMY_AUTH.isCurrentResult(proof)),
  current:()=>owner===token()&&(!v2()||browser.M4L_ACADEMY_AUTH.isCurrentResult(proof))?saved||[]:[]
};
browser.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)reset();});
browser.addEventListener('m4l-academy-session',()=>{if(owner!==token())reset();});

for(const event of ['academy-v2-context','academy-v2-mask','academy-v2-revalidate','m4l-academy-session-ended','pagehide'])browser.addEventListener(event,value=>{if(v2()&&(event!=='academy-v2-mask'||value.detail?.masked!==false))reset();});

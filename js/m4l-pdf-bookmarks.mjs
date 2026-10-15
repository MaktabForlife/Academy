import {pdfBookmark} from './m4l-pdf-bookmarks-model.mjs?v=106.72';
const token=()=>localStorage.getItem('m4l_account_token')||'';
let owner=token(),saved=null;
function changed(){window.dispatchEvent(new Event('m4l-pdf-bookmarks-change'));}
function reset(){owner=token();saved=null;changed();}
async function request(action,input={}){
  if(owner!==token())reset();
  const session=token();if(!session)throw Error('Sign in on Academy home to save and view your bookmarks.');
  const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/academy/bookmarks/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session},body:JSON.stringify(input)});
  const result=await response.json();
  if(session!==token())throw Error('Your Academy account changed. Open bookmarks again.');
  if(!response.ok||!result.success){if(response.status===401){saved=null;changed();}throw Error(result.error||'Bookmarks could not be updated. Please try again.');}
  return result;
}
export const academyBookmarks={
  signedIn:()=>Boolean(token()),
  async list(){const result=await request('list');saved=result.bookmarks;return saved;},
  async save(entry){const result=await request('save',{bookmark:pdfBookmark(entry)});if(saved)saved=[result.bookmark,...saved.filter(b=>b.key!==result.bookmark.key)];changed();return result.bookmark;},
  async remove(key){await request('delete',{key});if(saved)saved=saved.filter(b=>b.key!==key);changed();},
  current:()=>saved||[]
};
window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)reset();});
window.addEventListener('m4l-academy-session',()=>{if(owner!==token())reset();});

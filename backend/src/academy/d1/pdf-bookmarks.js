import {pdfBookmark} from '../../../../js/m4l-pdf-bookmarks-model.mjs';
import {payloadHash} from '../../programs/timetable-model.js';
import {rehearsalError} from './repository.js';

export function pdfBookmarks(repository,auth){
  const p=(sql,...values)=>repository.db.prepare(sql).bind(...values),account=auth.user.accountid;
  const dto=row=>({key:row.bookmark_key,file:row.file,title:row.title,page:row.page_number,pageLabel:row.page_label,createdAt:row.created_at});
  return {async run(action,input={}){
    try{
      if(action==='list')return {bookmarks:(await p('SELECT * FROM academy_pdf_bookmarks WHERE account_id=? ORDER BY updated_at DESC,bookmark_key LIMIT 200',account).all()).results.map(dto)};
      let bookmark,key;
      if(action==='save'){
        try{bookmark=pdfBookmark(input.bookmark);}catch(error){throw rehearsalError(error.message,400,'INVALID_BOOKMARK');}
        key=await payloadHash({file:bookmark.file,page:bookmark.page});
      }else if(action==='delete'&&/^[a-f0-9]{64}$/.test(input.key||''))key=input.key;
      else throw rehearsalError('Choose a saved bookmark.',400,'INVALID_BOOKMARK');
      const guard=crypto.randomUUID(),now=new Date().toISOString();
      // Recheck credentials and revocation in the SAME transaction as a write.
      const valid=p(`INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,EXISTS(
        SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id)
        WHERE a.account_id=? AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0
          AND c.credential_epoch=? AND s.session_id=? AND s.credential_epoch=c.credential_epoch
          AND s.revoked_at IS NULL AND s.expires_at>?))`,guard,account,auth.state.account.credential_epoch,auth.sid,now);
      const change=action==='delete'?p('DELETE FROM academy_pdf_bookmarks WHERE account_id=? AND bookmark_key=?',account,key):
        p(`INSERT INTO academy_pdf_bookmarks(account_id,bookmark_key,file,title,page_number,page_label,created_at,updated_at)
          SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM academy_pdf_bookmarks WHERE account_id=? AND bookmark_key=?)
            OR (SELECT count(*) FROM academy_pdf_bookmarks WHERE account_id=?)<200
          ON CONFLICT(account_id,bookmark_key) DO UPDATE SET title=excluded.title,page_label=excluded.page_label,updated_at=excluded.updated_at`,
          account,key,bookmark.file,bookmark.title,bookmark.page,bookmark.pageLabel,now,now,account,key,account);
      const result=await repository.db.batch([valid,change,p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)]);
      if(action==='delete')return {deleted:true,key};
      if(!result[1].meta.changes)throw rehearsalError('You have 200 bookmarks. Remove one before adding another.',400,'BOOKMARK_LIMIT');
      return {bookmark:{...bookmark,key,createdAt:now}};
    }catch(error){
      if(/no such table: academy_pdf_bookmarks/.test(error.message))throw rehearsalError('Academy bookmarks need the database update. Please try again shortly.',503,'BOOKMARK_SCHEMA_REQUIRED');
      if(/academy_management_stale/.test(error.message))throw rehearsalError('Your Academy session has ended. Sign in again to save bookmarks.',401,'SESSION_ENDED');
      throw error;
    }
  }};
}

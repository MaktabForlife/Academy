import { isActivePlatformValue as active } from '../lib/platform-schema.js';
import { assertUnique,key } from '../programs/model.js';
import { parseRoles } from './academy-access.js';

export function programRoleAccounts(tables,programId,prepared){
  const accounts=tables.UserAccounts;assertUnique(accounts,'AccountID','Accounts');
  const column=`PROGRAM:${programId}`;
  const scope=tables.AcademyAccessScopes?.find(r=>r.ScopeKey===column);
  return accounts.map(account=>{
    let roles=[];
    if(prepared&&scope){
      const row=tables.AcademyAccessMatrix.find(r=>key(r.AccountID)===key(account.AccountID));
      const review=tables.AcademyAccessReview.find(r=>key(r.AccountID)===key(account.AccountID)&&r.ScopeKey===column);
      if(row&&Object.hasOwn(row,column)&&review?.ReviewStatus!=='REQUIRED')roles=parseRoles(row[column]);
    }else if(!prepared)roles=tables.UserCourseAccess.filter(r=>key(r.AccountID)===key(account.AccountID)&&key(r.CourseID)===key(programId)&&active(r.Active)).map(r=>r.Role);
    return {AccountID:account.AccountID,DisplayName:account.DisplayName,Active:active(account.Active),Roles:[...new Set(roles)]};
  });
}

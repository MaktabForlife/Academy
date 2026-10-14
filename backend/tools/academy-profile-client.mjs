// Shared by local acceptance tools and regression fixtures. Use the same guarded
// account-change API as User profiles; never restore the retired write routes.
export async function profileChange(post,accountId,token,changes={}) {
  const directory=await post('/api/admin/platform/user-profiles/get',{},token);
  if(directory.status!==200)throw Error('Cannot read the authorised profile directory: '+JSON.stringify(directory.body));
  const account=directory.body.accounts.find(a=>a.accountId.toUpperCase()===accountId.toUpperCase());
  if(!account)throw Error('Profile not found: '+accountId);
  const reset=changes.mode==='reset-pin';
  return post('/api/admin/platform/user-profiles/save',{
    mode:reset?'reset-pin':'profile',accountId:account.accountId,baseRevision:account.revision,operationId:crypto.randomUUID(),
    ...(!reset?{creating:false,displayName:account.displayName,uniqueId:account.uniqueId,active:account.active}:{}),...changes
  },token);
}

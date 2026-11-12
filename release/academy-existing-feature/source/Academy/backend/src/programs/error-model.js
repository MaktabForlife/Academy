
// Never expose upstream response bodies, account data or credentials in diagnostics.
export function programFailure(error, action, stage='request') {
  if(error.publicMessage)return {success:false,status:error.status,error:error.publicMessage,
    ...(error.code?{code:error.code}:{}),
    ...(typeof error.retryable==='boolean'?{retryable:error.retryable}:{}),
    ...(error.code==='ROW_CHANGED'?{currentRecord:error.currentRecord,rowRevision:error.rowRevision,...(error.entryKey?{entryKey:error.entryKey}:{})}:{})};
  const save=['save','submit','manage-save','publish','recover','prepare','prepare-library'].includes(action);
  const reference=crypto.randomUUID(),upstreamStatus=null;
  let code='PROGRAM_BACKEND_ERROR',message='The program service encountered an unexpected error.',retryable=save,retryAfterMs=save?1500:0;
  if((/network connection|connection (closed|reset)|fetch failed|failed to fetch|networkerror/i.test(String(error.message))||error.name==='AbortError'||error.name==='TimeoutError')){
    code='BACKEND_CONNECTION_FAILED';message='The backend connection was interrupted.';retryable=true;retryAfterMs=1500;
  }
  console.error(JSON.stringify({event:'program_request_failed',reference,action,stage,code,upstreamStatus,
    errorType:error.name,location:[...String(error.stack||'').matchAll(/\b([A-Za-z0-9_.-]{1,80}\.m?js):(\d+):(\d+)/g)].slice(0,2).map(match=>`${match[1]}:${match[2]}:${match[3]}`)}));
  return {success:false,status:503,code,retryable,retryAfterMs,reference,
    error:`${message} ${save?'The save has not been confirmed; your entry is kept.':'Your displayed records and unfinished edits are kept.'} Reference: ${reference}`};
}

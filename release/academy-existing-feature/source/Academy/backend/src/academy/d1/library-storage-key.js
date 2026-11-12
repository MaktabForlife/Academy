// This is the complete, stable Cloudflare object name, including its suffix.
export function openLibraryStorageKey(env){
  const key=String(env.ACADEMY_OPEN_LIBRARY_STORAGE_KEY||'').trim();
  if(!key)throw Object.assign(new Error('Open Library storage is not configured.'),{status:503,code:'OPEN_LIBRARY_STORAGE_REQUIRED'});
  return key;
}

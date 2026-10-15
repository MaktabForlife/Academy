// Preserve the exact object name used by both the old branch and the cleaned runtime.
export function developmentLibraryStorageKey(settings){
  const bindings=settings.result?.bindings||settings.resources?.bindings||settings.bindings||[];
  const values=Object.fromEntries(bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
  const legacy=String(values.PLATFORM_SPREADSHEET_ID||'').trim();
  const neutral=String(values.ACADEMY_OPEN_LIBRARY_STORAGE_KEY||'').trim();
  if(!legacy)throw Error('EXISTING_LIBRARY_NAMESPACE_REQUIRED_FOR_BRANCH_SWITCHING');
  const previous=legacy+':open-library-metadata';
  if(neutral&&neutral!==previous)throw Error('LIBRARY_NAMESPACE_MISMATCH');
  return previous;
}

// Exact provider-owned schema names only. Never query their contents.
// Cloudflare documents _cf_KV as reserved underlying storage; it was observed
// on the newly created hosted Core before any application DDL was submitted.
export const jwtFeatureUserObjectPredicate="sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT IN ('_cf_METADATA','_cf_KV')";
export const jwtFeatureObjectDefinitionsSQL='SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE '+jwtFeatureUserObjectPredicate+' ORDER BY type,name';
export const jwtFeatureUserTablesSQL="SELECT name FROM sqlite_schema WHERE type='table' AND "+jwtFeatureUserObjectPredicate+' ORDER BY name';
export const jwtFeatureEmptyObjectPrecountSQL='SELECT count(*) n FROM sqlite_schema WHERE '+jwtFeatureUserObjectPredicate;

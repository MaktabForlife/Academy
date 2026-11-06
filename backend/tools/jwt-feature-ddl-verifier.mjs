// Public fixed read-only UI verifier builder; table names come from reviewed DDL.
export function ddlVerifierSQL(tables){
 if(!Array.isArray(tables)||!tables.length||tables.length>256||new Set(tables).size!==tables.length||!tables.every(x=>/^[a-z_][a-z0-9_]*$/.test(x)))throw Error('INVALID_PUBLIC_TABLE_SET');
 const sum=names=>names.length===1?'(SELECT count(*) FROM "'+names[0]+'")':'('+sum(names.slice(0,Math.floor(names.length/2)))+'+'+sum(names.slice(Math.floor(names.length/2)))+')';
 return "SELECT (SELECT count(*) FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA') user_objects,(SELECT count(*) FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_METADATA') user_tables,"+sum(tables)+" user_rows,(SELECT count(*) FROM pragma_foreign_key_check) foreign_key_errors,(SELECT count(*) FROM pragma_quick_check) quick_rows,(SELECT quick_check FROM pragma_quick_check LIMIT 1) quick_check;";
}

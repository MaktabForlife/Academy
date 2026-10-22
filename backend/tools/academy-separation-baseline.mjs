// Phase 0 only: inspect local source and saved DDL. No cloud bindings or writes.
import {readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative,dirname,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

export const repositoryRoot=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>readFileSync(resolve(repositoryRoot,file),'utf8');
const git=(...args)=>execFileSync('git',args,{cwd:repositoryRoot,encoding:'utf8'}).trim();
function filesIn(directory){
 const files=[];
 for(const entry of readdirSync(directory,{withFileTypes:true})){
  const path=resolve(directory,entry.name);
  if(entry.isDirectory())files.push(...filesIn(path));else if(entry.isFile())files.push(path);
 }
 return files.sort();
}
export function sourceSchema(){
 const db=new DatabaseSync(':memory:');
 const migrations=readdirSync(resolve(repositoryRoot,'backend/migrations/academy')).filter(n=>/^\d+_.+\.sql$/.test(n)).sort();
 try{
  for(const name of migrations)db.exec(read('backend/migrations/academy/'+name));
  const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>({name,columns:db.prepare(`PRAGMA table_info("${name}")`).all().map(r=>({name:r.name,type:r.type,notnull:r.notnull,default:r.dflt_value,pk:r.pk})),foreignKeys:db.prepare(`PRAGMA foreign_key_list("${name}")`).all()}));
  return {migrations:migrations.map(name=>({name,sha256:sha(read('backend/migrations/academy/'+name))})),tables,columnCount:tables.reduce((n,t)=>n+t.columns.length,0),triggers:db.prepare("SELECT name,tbl_name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all()};
 }finally{db.close();}
}
export function sourceBindings(){
 // Current checked-in JSONC has whole-line comments. Do not load .env/.dev.vars.
 const config=JSON.parse(read('backend/wrangler.jsonc').replace(/^\s*\/\/.*$/gm,''));
 const env=config.env.development;
 return {worker:env.name,entry:env.main,d1:env.d1_databases.map(({binding,database_name,migrations_dir})=>({binding,database_name,migrations_dir})),r2:env.r2_buckets.map(({binding,bucket_name})=>({binding,bucket_name})),durableObjects:env.durable_objects.bindings.map(({name,class_name})=>({name,class_name})),scheduled:env.triggers.crons,configuredVariableNames:Object.keys(env.vars||{}).sort(),secrets:'Not read or exported'};
}
export function routeInventory(){
 const file='backend/src/academy/d1/worker.js',source=read(file),rows=[];
 source.split('\n').forEach((line,i)=>{
  const patterns=[...line.matchAll(/path\.match\((\/\^.*?\$\/)\)/g)].map(m=>m[1]);
  for(const pattern of patterns)rows.push({file,line:i+1,kind:'DISPATCH_PATTERN',value:pattern});
  for(const match of line.matchAll(/['"](\/api\/[^'"\s]*)['"]/g))rows.push({file,line:i+1,kind:'LITERAL_ROUTE_OR_GUARD',value:match[1]});
 });
 return rows;
}
export function writerInventory(){
 const rows=[];
 const scans=['backend/src','backend/tools','backend/migrations/academy','functions'];
 for(const directory of scans)for(const path of filesIn(resolve(repositoryRoot,directory))){
  const file=relative(repositoryRoot,path);
  if(!['.js','.mjs','.sql'].includes(extname(file))||file==='backend/tools/academy-separation-baseline.mjs')continue;
  const source=readFileSync(path,'utf8'),mode=file.startsWith('backend/migrations/')?'SCHEMA_UPGRADE':file.startsWith('backend/tools/')?'OFFLINE_OR_MAINTENANCE_TOOL':'RUNTIME';
  source.split('\n').forEach((line,i)=>{
   for(const match of line.matchAll(/\b(INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+([a-z_][a-z_0-9]*|\$\{[^}]+\})/gi)){
    // SQL UPDATE OF is a trigger declaration, not a target table.
    if(match[2].toUpperCase()==='OF')continue;
    rows.push({file,line:i+1,mode,kind:'SQL_WRITE',operation:match[1].toUpperCase(),target:match[2],dynamic:match[2].startsWith('${')});
   }
   for(const match of line.matchAll(/\bCREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_0-9]+)/gi))rows.push({file,line:i+1,mode,kind:'TRIGGER_DEFINITION',target:match[1]});
   if(/\.(?:put|delete|deleteAll|setAlarm)\s*\(/.test(line)&&/bucket|storage|\br2\b|env\.|objects|this\./i.test(line))rows.push({file,line:i+1,mode,kind:'OBJECT_OR_COORDINATOR_WRITE',target:'Review bound object/storage call'});
   if(/(?:async\s+)?scheduled\s*\(/.test(line))rows.push({file,line:i+1,mode,kind:'SCHEDULED_ENTRY',target:'Trace called services'});
   if(/\.exec\s*\(|\.batch\s*\(/.test(line))rows.push({file,line:i+1,mode,kind:'SQL_EXEC_OR_BATCH',target:'Trace statement builder; includes non-business DDL/read batches'});
  });
 }
 return rows;
}
export function captureBaseline(){
 const tracked=git('ls-files','-z').split('\0').filter(Boolean);
 const hashes=Object.fromEntries(tracked.filter(file=>existsSync(resolve(repositoryRoot,file))).map(file=>[file,sha(readFileSync(resolve(repositoryRoot,file)))]));
 return {format:'ACADEMY_SEPARATION_PHASE0_V1',capturedAt:new Date().toISOString(),head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),workingTree:git('status','--porcelain'),version:JSON.parse(read('version.json')).version,trackedFiles:hashes,schema:sourceSchema(),bindings:sourceBindings(),routes:routeInventory(),writers:writerInventory(),inventoryLimitations:'Static route references include guards. SQL/object candidates include builders and offline tools; consulted with the reviewed writer-family map. No inventory is an executable permission allowlist.',liveData:'Not read. Source and schema metadata only.'};
}
export function verifyPreservation(baseline){
 const changed=[],missing=[];
 for(const [file,hash] of Object.entries(baseline.trackedFiles)){
  const path=resolve(repositoryRoot,file);
  if(!existsSync(path))missing.push(file);else if(sha(readFileSync(path))!==hash)changed.push(file);
 }
 return {success:!changed.length&&!missing.length,headMatches:git('rev-parse','HEAD')===baseline.head,changed,missing,checkedFiles:Object.keys(baseline.trackedFiles).length};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2);
 if(args.length===2&&args[0]==='--out'){
  const target=resolve(args[1]);
  if(existsSync(target))throw Error('Baseline already exists; choose a new evidence path.');
  const baseline=captureBaseline();mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(baseline,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({head:baseline.head,version:baseline.version,tables:baseline.schema.tables.length,columns:baseline.schema.columnCount,routeReferences:baseline.routes.length,writerCandidates:baseline.writers.length,output:target}));
 }else if(args.length===2&&args[0]==='--verify'){
  const result=verifyPreservation(JSON.parse(readFileSync(resolve(args[1]),'utf8')));console.log(JSON.stringify(result));if(!result.success||!result.headMatches)process.exitCode=1;
 }else throw Error('Use --out <new-private-baseline.json> or --verify <baseline.json>. This tool never contacts cloud services.');
}

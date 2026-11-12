// Temporary, fixed compiled schema phase. Never imported by the final app.
import {jwtFeatureDatabaseEnv} from './jwt-feature-storage.mjs';
import {jwtFeatureObjectDefinitionsSQL} from './jwt-feature-schema.mjs';
export const schemaClaimSlot='jwt-feature-schema-v1';
const unavailable=()=>{throw Error('FEATURE_SCHEMA_UNAVAILABLE');};
export function assertSchemaPhase(c){
 if(!c.ddl)return;
 const d=c.ddl;
 if(d.schema!==1||d.initialObjectHashes?.core!=='746047e55a185d77723c183c1652a18afafa0ea6a9ced7a623c652fe404c90bc'||d.initialObjectHashes?.admin!=='4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'||d.firstDefinitionHash!=='ba6adc0dad88252e65296438061de7e8d62e238bcfd1aa882817f5e4a536f739'||d.rawRemainderHash!=='2e68592a63bee5e652dd1299d67cc1691535911c5976b3352504d61ff0e4123f'||d.inputHashes?.core!=='1b2d6c85ee3fd797a7fab9bb297d7b700b30542a4fba1428996da21236afa9ce'||d.inputHashes?.admin!=='0cebae64a69e62a235b3828eb39d1001e3d23b992ffeb391920239096018a830')unavailable();
 for(const owner of ['core','admin']){
  if(!Array.isArray(d.statements?.[owner])||d.statements[owner].length!==(owner==='core'?1371:83)||!d.statements[owner].every(s=>typeof s==='string'&&s.length<=100000&&/^CREATE(?: UNIQUE)? (TABLE|INDEX|VIEW|TRIGGER)\b/i.test(s))||!/^[a-f0-9]{64}$/.test(d.statementHashes?.[owner]))unavailable();
 }
 if(c.tables.core.length!==172||c.tables.admin.length!==55)unavailable();
}
export const schemaVerification=c=>({core:{objects:1372,tables:172,userRows:0,foreignKeyErrors:0,quickCheck:'ok',fingerprint:c.objectHashes.core},admin:{objects:83,tables:55,userRows:0,foreignKeyErrors:0,quickCheck:'ok',fingerprint:c.objectHashes.admin}});
export function withSchemaPhase(Base,c,{window,sha}){
 const publicState=s=>({schema:1,stage:'SCHEMA_ONLY',state:s?.state||'UNCLAIMED',source:s?.source||c.source,manifestHash:s?.manifestHash||c.manifestHash,planId:s?.planId||c.planId,...(s?{startedAt:s.startedAt,finishedAt:s.finishedAt||null,phase:s.phase}:{}),...(s?.state==='VERIFIED'?{sourceDigest:s.sourceDigest,verification:s.verification}: {})});
 return class JWTFeatureSchemaPhase extends Base{
  #schemaEnv;
  constructor(ctx,env){super(ctx,env);this.#schemaEnv=env;ctx.blockConcurrencyWhile(async()=>{
   const old=await ctx.storage.get(schemaClaimSlot);if(old?.state==='PREPARING')await ctx.storage.put(schemaClaimSlot,{...old,state:'UNKNOWN',phase:'interrupted',finishedAt:Math.floor(Date.now()/1000)});
  });}
  async setupSchemaStatus(value){try{this.setupBinding(value);return publicState(await this.ctx.storage.get(schemaClaimSlot));}catch{return {state:'UNKNOWN',source:c.source,manifestHash:c.manifestHash};}}
  async setupSchemaExecute(value){
   let owns=false;
   try{
    this.setupBinding(value);if(Object.keys(value).sort().join(',')!=='manifestHash,nonceDigest,source'||!/^[a-f0-9]{64}$/.test(value.nonceDigest))unavailable();
    for(const owner of ['core','admin'])if(await sha(c.ddl.statements[owner].join('\n')+'\n')!==c.ddl.statementHashes[owner])unavailable();
    const claim=await this.ctx.storage.transaction(async storage=>{
     const existing=await storage.get(schemaClaimSlot);if(existing)return {existing};
     window(this.#schemaEnv);
     const state={state:'PREPARING',stage:'SCHEMA_ONLY',source:c.source,manifestHash:c.manifestHash,nonceDigest:value.nonceDigest,planId:c.planId,sourceDigest:c.sourceDigest,databaseIds:c.databaseIds,startedAt:Math.floor(Date.now()/1000),phase:'claimed'};
     await storage.put(schemaClaimSlot,state);return {state};
    });
    if(claim.existing)return {...publicState(claim.existing),alreadyClaimed:true};owns=true;window(this.#schemaEnv);
    const selected=jwtFeatureDatabaseEnv(this.#schemaEnv),db={core:selected.ACADEMY_DB.withSession('first-primary'),admin:selected.ACADEMY_ADMIN_DB.withSession('first-primary')};
    // Both full starting footprints are checked before either owner receives DDL.
    for(const owner of ['core','admin']){
     window(this.#schemaEnv);const objects=(await db[owner].prepare(jwtFeatureObjectDefinitionsSQL).all()).results.map(r=>[r.type,r.name,r.tbl_name,r.sql]);
     if(await sha(JSON.stringify(objects))!==c.ddl.initialObjectHashes[owner]||objects.length!==(owner==='core'?1:0))unavailable();
     if(owner==='core'&&(objects[0][0]!=='table'||objects[0][1]!=='academy_announcements'||objects[0][2]!=='academy_announcements'||await sha(objects[0][3])!==c.ddl.firstDefinitionHash))unavailable();
    }
    window(this.#schemaEnv);const firstRows=(await db.core.prepare('SELECT count(*) n FROM academy_announcements').all()).results;
    if(firstRows.length!==1||firstRows[0].n!==0)unavailable();
    const verify=async owner=>{
     window(this.#schemaEnv);const objects=(await db[owner].prepare(jwtFeatureObjectDefinitionsSQL).all()).results.map(r=>[r.type,r.name,r.tbl_name,r.sql]);
     if(objects.length!==(owner==='core'?1372:83)||await sha(JSON.stringify(objects))!==c.objectHashes[owner])unavailable();
     const queries=[];for(let i=0;i<c.tables[owner].length;i+=5)queries.push(db[owner].prepare(c.tables[owner].slice(i,i+5).map(name=>"SELECT '"+name+"' name,count(*) n FROM \""+name+"\"").join(' UNION ALL ')));
     window(this.#schemaEnv);const counts=(await db[owner].batch(queries)).flatMap(r=>r.results);if(counts.length!==c.tables[owner].length||counts.some(r=>r.n!==0))unavailable();
     window(this.#schemaEnv);if((await db[owner].prepare('PRAGMA foreign_key_check').all()).results.length)unavailable();
     window(this.#schemaEnv);const quick=(await db[owner].prepare('PRAGMA quick_check').all()).results;if(quick.length!==1||Object.values(quick[0])[0]!=='ok')unavailable();
    };
    // Separate owner transactions; full Core verification precedes Admin DDL.
    window(this.#schemaEnv);await db.core.batch(c.ddl.statements.core.map(s=>db.core.prepare(s)));await verify('core');
    window(this.#schemaEnv);await db.admin.batch(c.ddl.statements.admin.map(s=>db.admin.prepare(s)));await verify('admin');
    await this.ctx.storage.transaction(async storage=>{const old=await storage.get(schemaClaimSlot);if(old?.state!=='PREPARING'||old.nonceDigest!==value.nonceDigest)unavailable();await storage.put(schemaClaimSlot,{...old,state:'VERIFIED',phase:'complete',finishedAt:Math.floor(Date.now()/1000),verification:schemaVerification(c)});});
    return publicState(await this.ctx.storage.get(schemaClaimSlot));
   }catch{
    if(owns)try{await this.ctx.storage.transaction(async storage=>{const old=await storage.get(schemaClaimSlot);if(old?.state==='PREPARING')await storage.put(schemaClaimSlot,{...old,state:'UNKNOWN',phase:'staged-outcome',finishedAt:Math.floor(Date.now()/1000)});});}catch{}
    try{return publicState(await this.ctx.storage.get(schemaClaimSlot));}catch{return {state:'UNKNOWN',source:c.source,manifestHash:c.manifestHash};}
   }
  }
 };
}

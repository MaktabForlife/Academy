import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {prepareFeaturePreview,validateFeatureTarget} from '../tools/academy-feature-preview.mjs';
const target={name:'academy-feature-10660',bucket:'academy-feature-10660',databaseId:'00000000-0000-4000-8000-000000010660',accountId:'0'.repeat(32)};
test('feature packaging refuses live resources and round-trips a small, isolated synthetic database entirely locally',async()=>{
  validateFeatureTarget(target);
  for(const bad of [{...target,databaseId:'7E732B79-A72F-4DA6-BE83-524919C49BA4'},{...target,name:'devrebootworker'},{...target,bucket:'maktab4lifemedia'}])assert.throws(()=>validateFeatureTarget(bad));
  const parent=mkdtempSync('/private/tmp/maktab-feature-package-'),directory=join(parent,'preview');
  try{
    const result=await prepareFeaturePreview({...target,repo:new URL('../../',import.meta.url).pathname,directory});assert.equal(result.accounts,12);assert(result.seedRows<1000);assert.equal(result.liveDatabaseChanged,false);
    const config=JSON.parse(readFileSync(join(directory,'wrangler.preview.json'),'utf8'));assert.equal(config.d1_databases[0].database_id,target.databaseId);assert(config.r2_buckets.every(b=>b.bucket_name===target.bucket));assert(!config.services);assert.deepEqual(config.triggers.crons,['*/15 * * * *']);
  }finally{rmSync(parent,{recursive:true,force:true});}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {pagesTarget} from '../tools/academy-pages-build.mjs';
test('the split branch has its own API build while current Development bindings remain held',()=>{
 assert.equal(pagesTarget('feature-split-db'),'split');assert.equal(pagesTarget('feature-admin'),'feature');assert.equal(pagesTarget('development'),'development');
 const config=JSON.parse(readFileSync(new URL('../wrangler.split-data.jsonc',import.meta.url),'utf8'));
 assert.equal(config.main,undefined);assert.equal(config.routes,undefined);assert.equal(config.triggers,undefined);
 assert.deepEqual(config.d1_databases.map(d=>d.database_name).sort(),['dev-academy-admin','dev-academy-core']);
 const feature=JSON.parse(readFileSync(new URL('../wrangler.feature.jsonc',import.meta.url),'utf8')),development=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(feature.d1_databases[0].database_name,'maktab-academy');assert.equal(development.env.development.d1_databases[0].database_name,'maktab-academy');
 assert.equal(feature.vars.ACADEMY_DB_GENERATION,undefined);assert.equal(development.env.development.vars.ACADEMY_DB_GENERATION,undefined);
});

 test('split assets use only the separate version URL and reject other deployed hosts',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{runInNewContext}=await import('node:vm'),{buildAcademyAssets}=await import('../tools/academy-assets.mjs');const dir=mkdtempSync('/private/tmp/academy-split-assets-');try{buildAcademyAssets({repo:fileURLToPath(new URL('../../',import.meta.url)),directory:dir,target:'split'});const code=readFileSync(dir+'/js/m4l-config.js','utf8');for(const host of ['feature-split-db.academy-maktab4life.pages.dev','maktab4life.org']){const window={location:{hostname:host}};runInNewContext(code,{window});assert.equal(window.M4L_CONFIG.API_BASE,host.startsWith('feature-split-db')?'https://split-db-feature_worker.maktab4life.workers.dev':'');}}finally{rmSync(dir,{recursive:true,force:true});}
 });

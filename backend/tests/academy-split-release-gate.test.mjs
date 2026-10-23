import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {buildDevelopmentPages} from '../tools/academy-pages-build.mjs';
test('the pending split branch cannot fall through to a Development API build',()=>{
 assert.throws(()=>buildDevelopmentPages(fileURLToPath(new URL('../../',import.meta.url)),{branch:'feature-split-db'}),/SPLIT_PREVIEW_HELD/);
 const config=JSON.parse(readFileSync(new URL('../wrangler.split-data.jsonc',import.meta.url),'utf8'));
 assert.equal(config.main,undefined);assert.equal(config.routes,undefined);assert.equal(config.triggers,undefined);
 assert.deepEqual(config.d1_databases.map(d=>d.database_name).sort(),['dev-academy-admin','dev-academy-core']);
 const feature=JSON.parse(readFileSync(new URL('../wrangler.feature.jsonc',import.meta.url),'utf8')),development=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(feature.d1_databases[0].database_name,'maktab-academy');assert.equal(development.env.development.d1_databases[0].database_name,'maktab-academy');
 assert.equal(feature.vars.ACADEMY_DB_GENERATION,undefined);assert.equal(development.env.development.vars.ACADEMY_DB_GENERATION,undefined);
});

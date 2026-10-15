import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {academyDependencyGraph,assertAcademySourceBoundary} from '../tools/academy-boundary.mjs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('current website, API and package releases agree',()=>{
 const version=JSON.parse(read('../../version.json')).version;
 for(const file of ['../../js/version.json','../package.json','../package-lock.json'])assert.equal(JSON.parse(read(file)).version,version,file);
 assert(read('../src/academy/d1/worker.js').includes(`version:'${version}'`));assert(read('../tools/academy-site.mjs').includes(`siteVersion='${version}'`));
 assert(read('../../academy/index.html').includes('V'+version));assert.equal(read('../../js/m4l-config.js'),read('../../js/m4l-development-academy-config.js'));
});
test('legacy application and backend clients are absent from Development source',async()=>{
 assert(await assertAcademySourceBoundary());assert(academyDependencyGraph().length>80);
 for(const file of ['../../app.js','../../apps-script/code.gs','../../admin/index.html','../../student/index.html','../src/worker.js','../src/lib/google-sheets.js','../src/lib/google-drive.js','../tools/academy-migration/export.mjs'])assert.equal(existsSync(new URL(file,import.meta.url)),false,file);
 for(const file of ['../../programs/library.html','../../programs/library-view.html'])assert(!read(file).includes('m4l-program-library'));
});

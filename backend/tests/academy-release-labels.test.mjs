import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {academyClientConfiguration} from '../tools/hosting-client.mjs';
import {buildAcademyAssets} from '../tools/academy-assets.mjs';
import {hosting} from '../src/academy/hosting.mjs';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const source=readFileSync(new URL('../../js/m4l-academy-navigation.js',import.meta.url),'utf8');
const release=JSON.parse(readFileSync(new URL('../../js/version.json',import.meta.url),'utf8')).version;
function render(config,script=source,html='<html><head></head><body><span class="pb-version">V108.8</span></body></html>'){
 const {window,document}=parseHTML(html),h=hosting(),location={origin:h.academyPortalOrigin,hostname:new URL(h.academyPortalOrigin).hostname,pathname:'/academy/courses/manage/',search:'',href:h.academyPortalOrigin+'/academy/courses/manage/'};
 const store={getItem:()=>null,setItem(){},removeItem(){},length:0,key:()=>null};
 let calls=0;const context={window,document,location,localStorage:store,sessionStorage:store,URL,URLSearchParams,Event:window.Event,fetch:()=>{calls++;throw Error('Version rendering must not fetch.');}};
 vm.runInNewContext(config,context);vm.runInNewContext(script,context);
 return {window,document,calls};
}
test('all navigation and management labels render the current packaged release without a version request',()=>{
 const f=render(academyClientConfiguration());
 assert.equal(f.document.querySelector('.site-version').textContent,'Website V'+release);
 assert.equal(f.document.querySelector('.pb-version').textContent,'V'+release);
 assert.equal(f.calls,0);assert.equal(f.window.M4L_CONFIG.API_BASE,hosting().academyApiOrigin);
});
test('a later release and absent metadata cannot display stale hardcoded versions',()=>{
 const next=render(academyClientConfiguration('987.6'));
 assert.equal(next.document.querySelector('.site-version').textContent,'Website V987.6');assert.equal(next.document.querySelector('.pb-version').textContent,'V987.6');
 const missing=render('window.M4L_CONFIG={};');
 assert.equal(missing.document.querySelector('.site-version').textContent,'');assert.equal(missing.document.querySelector('.pb-version').textContent,'');
});
test('generated public assets carry matching release metadata and render the real Course header',()=>{
 const repo=new URL('../..',import.meta.url).pathname,directory=mkdtempSync(join(tmpdir(),'academy-management-release-'));
 const built=buildAcademyAssets({repo,directory,target:'development'});
 assert(built.files.includes('js/m4l-academy-navigation.js'));
 const json=JSON.parse(readFileSync(join(directory,'js/version.json'),'utf8'));
 const f=render(readFileSync(join(directory,'js/m4l-config.js'),'utf8'),readFileSync(join(directory,'js/m4l-academy-navigation.js'),'utf8'),readFileSync(join(directory,'academy/courses/manage/index.html'),'utf8'));
 assert.equal(f.window.M4L_CONFIG.RELEASE_VERSION,json.version);
 for(const label of f.document.querySelectorAll('.site-version,.pb-version'))assert.equal(label.textContent,(label.classList.contains('site-version')?'Website V':'V')+json.version);
 assert.equal(f.calls,0);
});

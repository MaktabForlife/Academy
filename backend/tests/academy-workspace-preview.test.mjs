import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,realpathSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {circlesPublicFile,circlesHomepage,previewWebsiteReturn} from '../tools/workspace-ui-preview/circles-home.mjs';

test('preview serves only public homepage assets and never lesson payloads or files outside the bundle',t=>{
 const temporary=realpathSync(mkdtempSync(path.join(os.tmpdir(),'academy-ui-circles-')));
 t.after(()=>rmSync(temporary,{recursive:true,force:true}));
 const root=path.join(temporary,'public');mkdirSync(path.join(root,'circles/assets'),{recursive:true});
 for(const name of ['index.html','circles/app.js','circles/assets/logo.png'])writeFileSync(path.join(root,name),'fixture');
 writeFileSync(path.join(temporary,'private.png'),'private');
 symlinkSync(path.join(temporary,'private.png'),path.join(root,'circles/assets/outside.png'));
 assert.equal(circlesPublicFile(root,'/'),path.join(root,'index.html'));
 assert.equal(circlesPublicFile(root,'/circles/app.js'),path.join(root,'circles/app.js'));
 assert.equal(circlesPublicFile(root,'/circles/assets/logo.png'),path.join(root,'circles/assets/logo.png'));
 for(const target of ['/circles/free-learning/lesson.json','/circles/free-learning/notes.pdf','/circles-login.mjs','/circles/assets/../../private.png','/circles/assets/outside.png'])assert.equal(circlesPublicFile(root,target),null,target);
});

test('preview adapts the released entry without running Studio authentication or rewriting the source',t=>{
 const temporary=mkdtempSync(path.join(os.tmpdir(),'academy-ui-entry-'));
 t.after(()=>rmSync(temporary,{recursive:true,force:true}));
 const file=path.join(temporary,'index.html');
 writeFileSync(file,'<head></head><body><main id="experience"></main><script type="module">if(!window.AcademyCirclesRedirecting)await import("/circles-login.mjs");</script></body>');
 const output=circlesHomepage(file);
 assert.match(output,/<main id="experience">/);
 assert.match(output,/src="\/__preview\/circles-login.js"/);
 assert.doesNotMatch(output,/import\("\/circles-login.mjs"\)/);
 writeFileSync(file,'<head></head><body>Changed upstream entry</body>');
 assert.throws(()=>circlesHomepage(file),/entry changed/);
});

test('signed-out native entrances return to the website while signed-in Home and public readers remain intact',()=>{
 function run(pathname,token,hash=''){
  const handlers=new Map(),location={pathname,hash,replace(value){this.destination=value;}};
  vm.runInNewContext(previewWebsiteReturn,{location,localStorage:{getItem:()=>token},window:{addEventListener:(type,fn)=>handlers.set(type,fn)}});
  return {location,handlers,signOut(){token='';handlers.get('m4l-academy-session')?.();}};
 }
 assert.equal(run('/academy/','').location.destination,'/');
 assert.equal(run('/academy/admin/','').location.destination,'/');
 assert.equal(run('/academy/course-websites/public/','').location.destination,undefined);
 const signedIn=run('/academy/','sample','#dashboard');
 assert.equal(signedIn.location.destination,undefined);
 signedIn.signOut();assert.equal(signedIn.location.destination,'/');
});

import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createJournalPreview} from './academy-student-journal-preview.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=process.env.JOURNAL_ACCEPTANCE_OUTPUT||resolve(root,'../../outputs/student-journal-r2-local');mkdirSync(output,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.ACADEMY_BROWSER_RUNTIME||'/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const preview=await createJournalPreview({twoReflections:true,fullAuth:true}),{origin,fixture}=preview,browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),context=await browser.newContext(),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',error=>errors.push(String(error)));
await context.route('**/*',route=>{const url=route.request().url();return url.startsWith(origin+'/')||url.startsWith('blob:')||url.startsWith('data:')?route.continue():route.abort();});
const journal=async()=>{await page.goto(origin+'/academy/journal/?workspace=LEARN');await page.locator('#journal-new:not([disabled])').waitFor();};
const course=async()=>{await page.goto(origin+preview.courseUrl);await page.locator('[data-sp-note="intention-reflection"]').waitFor();};
const deviceRows=()=>page.evaluate(async()=>{const {journalDevice}=await import('/academy/journal/device.mjs');return (await journalDevice().list(''));});
const draftText=async text=>(await deviceRows()).some(row=>row.fields?.reflection===text);
const flush=()=>page.waitForFunction(()=>window.M4L_STUDENT_JOURNAL?.canLeave()??window.M4L_COURSE_WEBSITES?.canLeave());
const makeDraft=async text=>{await journal();await page.locator('#journal-new').click();await page.locator('[name=reflection]').fill(text);await flush();assert(await draftText(text));};
const saved=id=>page.waitForFunction(id=>document.querySelector('[data-journal-status="'+id+'"]')?.textContent==='Saved to your journal.',id);
const login=async id=>{await page.locator('#academy-login').click();await page.locator('#demo-username').fill('separation-'+id);await page.locator('#demo-pin').fill('1234');await page.locator('#login-preview [type=submit]').click();await page.locator('#academy-sign-out:not([hidden])').waitFor();};
try{
 await page.goto(origin+'/sample/a');await page.locator('#journal-new:not([disabled])').waitFor();await makeDraft('Unrelated journal draft');await course();
 for(const [id,text] of [['intention-reflection','My intention'],['practice-reflection','My practice']]){await page.locator('[data-sp-note="'+id+'"]').fill(text);}
 await flush();assert.equal(fixture.journalBucket.calls.put,0);
 await page.locator('[data-journal-save="intention-reflection"]').click();await saved('intention-reflection');await page.locator('[data-journal-save="practice-reflection"]').click();await saved('practice-reflection');
 assert.equal(fixture.journalBucket.calls.put,2);assert.equal(fixture.journalBucket.documents()[0].entries.length,2);checks.push('Two reflection drafts from the same file version save sequentially without a false conflict.');
 for(const [id,text] of [['intention-reflection','Second intention'],['practice-reflection','Second practice']])await page.locator('[data-sp-note="'+id+'"]').fill(text);
 await page.locator('[data-journal-save="intention-reflection"]').click();await saved('intention-reflection');await flush();await page.reload();await page.locator('[data-sp-note="practice-reflection"]').waitFor();await page.locator('[data-journal-save="practice-reflection"]').click();await saved('practice-reflection');assert.equal(fixture.journalBucket.calls.put,4);checks.push('A restored device draft saves after another local entry has changed the file version.');
 await page.locator('[data-sp-note="intention-reflection"]').fill('Course draft survives errors');await flush();
 for(const status of [503,403]){
  const puts=fixture.journalBucket.calls.put;
  await page.route('**/api/academy/course-websites/read',route=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({success:false,error:'Synthetic course unavailable'})}));
  await page.evaluate(()=>document.querySelector('[data-page-content-refresh]').click());await page.waitForFunction(()=>document.getElementById('website-status')?.textContent==='Synthetic course unavailable'&&document.getElementById('course-reader').hidden);
  assert(await draftText('Course draft survives errors'));assert(await draftText('Unrelated journal draft'));assert.equal(fixture.journalBucket.calls.put,puts);
  await page.unroute('**/api/academy/course-websites/read');await page.reload();await page.locator('[data-sp-note="intention-reflection"]').waitFor();assert.equal(await page.locator('[data-sp-note="intention-reflection"]').inputValue(),'Course draft survives errors');
 }
 checks.push('Course 503 and access-denied 403 responses preserve both course drafts and unrelated journal drafts.');
 await page.route('**/api/academy/course-websites/read',route=>route.abort('failed'));await page.evaluate(()=>document.querySelector('[data-page-content-refresh]').click());await page.waitForFunction(()=>document.getElementById('course-reader').hidden);assert(await draftText('Course draft survives errors'));assert(await draftText('Unrelated journal draft'));await page.unroute('**/api/academy/course-websites/read');checks.push('A failed course connection keeps the private device copy and all drafts.');
 await page.goto(origin+'/academy/');await page.locator('#academy-sign-out:not([hidden])').waitFor();
 const oldSession=await page.evaluate(async()=>{const {journalDigest,journalBase,journalDevice}=await import('/academy/journal/device.mjs');const sessionKey=await journalDigest(journalBase(window.M4L_CONFIG.API_BASE)+'|'+localStorage.getItem('m4l_account_token'));return {sessionKey,ownerKey:(await journalDevice().get('session:'+sessionKey)).ownerKey};});
 await page.locator('#academy-sign-out').click();await page.locator('#academy-login:not([hidden])').waitFor();assert(!(await deviceRows()).some(row=>row.entry||row.entries));
 const blocked=await page.evaluate(async previous=>{const device=(await import('/academy/journal/device.mjs')).journalDevice();try{await device.put([['draft:'+previous.ownerKey+':late',{entry:{id:'late'},fields:{reflection:'Late private response'}}]],{sessionKey:previous.sessionKey});return false;}catch{return true;}},oldSession);assert(blocked);checks.push('Signing out from the dashboard clears device copies/drafts and blocks late writes from the old session.');
 await login('studentA');await journal();assert(!(await deviceRows()).some(row=>row.fields?.reflection==='Unrelated journal draft'||row.fields?.reflection==='Course draft survives errors'));assert.equal(await page.locator('[data-entry]').count(),2);checks.push('A new login for the same student fetches saved entries without restoring discarded device drafts.');
 await makeDraft('Discard on off-page switch');await page.goto(origin+'/academy/');await page.locator('#academy-switch-account:not([hidden])').waitFor();await page.locator('#academy-switch-account').click();await page.locator('#account-switch-id').fill('separation-studentB');await page.locator('#account-switch-pin').fill('1234');await page.locator('[data-switch-form] [type=submit]').click();await page.waitForFunction(()=>window.M4L_ACADEMY_LOGIN?.currentId()==='separation-studentB');await journal();assert.equal(await page.locator('[data-entry]').count(),0);assert(!(await deviceRows()).some(row=>row.fields?.reflection==='Discard on off-page switch'));checks.push('Switching accounts from the dashboard purges the previous owner’s drafts and keeps the next account isolated.');
 await makeDraft('Discard on secondary-page logout');await page.goto(origin+'/academy/open-library/');await page.locator('#ac-signout:not([hidden])').waitFor();await page.locator('#ac-signout').click();await page.waitForURL('**/academy/**');await page.locator('#academy-login:not([hidden])').waitFor();assert(!(await deviceRows()).some(row=>row.entry||row.entries));checks.push('Sign-out from a secondary Academy page also clears the previous owner’s journal partition.');
 assert.deepEqual(errors,[]);writeFileSync(resolve(output,'regressions.json'),JSON.stringify({passed:true,checks,errors,r2Calls:fixture.journalBucket.calls},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,output}));
}catch(error){await page.screenshot({path:resolve(output,'regression-failure.png'),fullPage:true});writeFileSync(resolve(output,'regression-failure.json'),JSON.stringify({error:String(error),errors,checks,status:await page.locator('#website-status').evaluateAll(nodes=>nodes.map(node=>({html:node.outerHTML,display:getComputedStyle(node).display,parent:node.parentElement.outerHTML.slice(0,300)})))},null,2));throw error;}finally{await browser.close();await preview.close();}

import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startMessagingPreview} from './academy-messaging-preview.mjs';
const {chromium}=await import('/Users/hbnaidu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const out='/private/tmp/academy-messaging-acceptance';await mkdir(out,{recursive:true});
const preview=await startMessagingPreview(),browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==preview.base)return route.abort();return route.continue();});
const dialog=()=>page.locator('.am-dialog[open]');
async function identity(role){await page.goto(preview.base+'/preview/bootstrap?role='+role);await page.locator('#ad-messages').waitFor();await page.locator('#ad-messages [data-am-dashboard-compose]').waitFor();}
try{
 await identity('student');assert.equal(await page.locator('#ad-unread').textContent(),'1');
 const originalFMA=await page.locator('#ad-attention').textContent();
 await page.locator('[data-ad-inbox]:visible').first().click();await dialog().getByRole('button',{name:'Preparation for our next lesson',exact:false}).click();await dialog().getByRole('button',{name:'Acknowledge notice',exact:true}).waitFor();
 await page.screenshot({path:out+'/inbox-desktop.png',fullPage:true});assert.match(await dialog().textContent(),/Opened/);assert.equal(await dialog().getByText(/^✓ Acknowledged/).count(),0);
 await dialog().getByRole('button',{name:'Acknowledge notice',exact:true}).click();await dialog().getByText(/^✓ Acknowledged/).waitFor();
 await dialog().getByRole('button',{name:'Archive for me'}).click();await dialog().getByRole('button',{name:'Archived',exact:true}).click();await dialog().getByRole('button',{name:'Preparation for our next lesson',exact:false}).click();await dialog().getByRole('button',{name:'Restore to inbox'}).click();
 checks.push('Dashboard opens the real inbox; explicit acknowledgement and personal archive/restore work independently.');
 await dialog().getByRole('button',{name:'Send notice',exact:true}).click();await dialog().locator('[data-am-class][value="messaging-200"]').check();await dialog().locator('[name=subject]').fill('Student class notice');await dialog().locator('[name=body]').fill('Mutha’ala for the class\nPlease revise page 25.\nحفظ الدرس');await dialog().locator('[name=requiresAcknowledgement]').check();
 await page.screenshot({path:out+'/send-student-desktop.png',fullPage:true});
 await dialog().getByRole('button',{name:'Review notice',exact:false}).click();await dialog().getByRole('heading',{name:'200 unique recipients'}).waitFor();assert.equal(await dialog().locator('.am-recipient-list li').count(),30);await dialog().getByRole('button',{name:'Show more recipients'}).click();await dialog().locator('.am-recipient-list li').nth(59).waitFor();assert.equal(await dialog().locator('.am-recipient-list li').count(),60);
 await page.screenshot({path:out+'/review-200-desktop.png',fullPage:true});await dialog().getByRole('button',{name:'Send notice',exact:true}).click();await dialog().getByText('Notice sent.',{exact:true}).waitFor();
 await dialog().getByRole('button',{name:'Student class notice',exact:false}).click();await dialog().getByRole('heading',{name:'Student class notice',exact:true}).waitFor();assert.match(await dialog().locator('.am-stats').textContent(),/200\/200/);await page.screenshot({path:out+'/report-desktop.png',fullPage:true});
 await dialog().getByRole('button',{name:'Close messages'}).click();assert.equal(await page.locator('#ad-attention').textContent(),originalFMA);
 checks.push('Student sends to exactly 200 unique test recipients after review; Sent shows delivery and receipts; FMA stays unchanged.');
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});await page.locator('[data-ad-inbox]:visible').first().click();await dialog().getByRole('button',{name:'Student class notice',exact:false}).click();await dialog().getByRole('button',{name:'Back to notices',exact:false}).waitFor();assert(await dialog().evaluate(el=>{const r=el.getBoundingClientRect();return el.scrollWidth<=innerWidth+1&&Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2;}));await page.screenshot({path:out+'/inbox-mobile-'+width+'.png',fullPage:false});
  await dialog().getByRole('button',{name:'Back to notices',exact:false}).click();await dialog().getByRole('button',{name:'Send notice',exact:true}).click();await dialog().locator('[name=subject]').waitFor();assert(await dialog().evaluate(el=>el.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/send-mobile-'+width+'.png',fullPage:false});await dialog().getByRole('button',{name:'Close messages'}).click();
 }
 checks.push('Inbox uses full mobile detail with Back; composer fits 390px and 320px without horizontal overflow.');
 await page.setViewportSize({width:1440,height:1000});await identity('student');
 await page.locator('[data-ad-inbox]:visible').first().click();await dialog().getByRole('button',{name:'Send notice',exact:true}).click();
 await dialog().locator('[data-am-class][value="class-1"]').check();await dialog().locator('[name=subject]').fill('Linked class preparation');await dialog().locator('[name=body]').fill('Please open the original Class Note for the reading allocations.');
 await dialog().getByRole('button',{name:'Link a lesson or Class Note'}).click();await dialog().locator('[name=linkSession] option').nth(1).waitFor({state:'attached'});await dialog().locator('[name=linkSession]').selectOption('0');
 await dialog().locator('[name=linkNote] option').nth(1).waitFor({state:'attached'});const noteId=await dialog().locator('[name=linkNote] option').nth(1).getAttribute('value');await dialog().locator('[name=linkNote]').selectOption(noteId);
 await dialog().getByRole('button',{name:'Review notice',exact:false}).click();await dialog().getByRole('button',{name:'Send notice',exact:true}).click();await dialog().getByText('Notice sent.',{exact:true}).waitFor();
 await dialog().getByRole('button',{name:'Inbox',exact:true}).first().click();await dialog().getByRole('button',{name:'Linked class preparation',exact:false}).click();await dialog().getByRole('button',{name:'Open Class Note',exact:false}).click();
 await page.locator('.cn-dialog[open]').getByText('Aisha: paragraphs 1–3.',{exact:false}).waitFor();await page.locator('.cn-dialog[open]').getByRole('button',{name:'Close',exact:true}).click();
 checks.push('A sent notice opens the canonical Class Note with its original reading allocations.');
 await page.locator('[data-ad-inbox]:visible').first().click();await dialog().getByRole('button',{name:'Send notice',exact:true}).click();await dialog().locator('[data-am-class][value="class-1"]').check();
 await dialog().locator('[name=subject]').fill('Scheduled class reminder');await dialog().locator('[name=body]').fill('Scheduled instructions');await dialog().locator('[name=timing][value=scheduled]').check();await dialog().locator('[name=scheduleLocal]').waitFor();assert(await dialog().locator('[name=timing][value=scheduled]').isChecked());
 const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Johannesburg',dateStyle:'short',timeStyle:'short'}).format(new Date(Date.now()+7200000)).replace(' ','T');await dialog().locator('[name=scheduleLocal]').fill(local);
 await dialog().getByRole('button',{name:'Review notice',exact:false}).click();await dialog().getByRole('button',{name:'Schedule notice',exact:true}).click();await dialog().getByText('Notice scheduled.',{exact:true}).waitFor();
 await dialog().getByRole('button',{name:'Scheduled class reminder',exact:false}).click();await dialog().getByRole('button',{name:'Cancel notice',exact:true}).waitFor();page.once('dialog',d=>d.accept());await dialog().getByRole('button',{name:'Cancel notice',exact:true}).click();await dialog().getByText('Notice cancelled.',{exact:true}).waitFor();await dialog().getByRole('button',{name:'Close messages'}).click();
 checks.push('Scheduling uses the Academy time zone; a saved schedule can be opened and cancelled.');
 await page.setViewportSize({width:1440,height:1000});await identity('globalAdmin');await page.locator('[data-ad-inbox]:visible').first().click();await dialog().getByRole('button',{name:'Send notice',exact:true}).click();await dialog().locator('[name=allAcademy]').waitFor();assert.equal(await dialog().locator('[name=allAcademy]').count(),1);await dialog().locator('[name=allAcademy]').check();await dialog().locator('[name=subject]').fill('All Academy notice');await dialog().locator('[name=body]').fill('Whole Academy test audience');await page.screenshot({path:out+'/send-global-admin-desktop.png',fullPage:true});
 await dialog().getByRole('button',{name:'Review notice',exact:false}).click();await dialog().getByRole('heading',{name:/unique recipients/}).waitFor();assert.match(await dialog().textContent(),/All Academy/);
 await dialog().getByRole('button',{name:'Edit notice',exact:false}).click();await dialog().locator('[name=body]').fill('Private unsaved draft');await page.evaluate(()=>{localStorage.removeItem('m4l_account_token');window.dispatchEvent(new Event('m4l-academy-session'));});await dialog().waitFor({state:'hidden'});assert.equal(await page.getByText('Private unsaved draft').count(),0);
 checks.push('Global Admin has All Academy; sign-out clears an unsaved private draft and closes the inbox.');
 assert.deepEqual(errors,[]);await writeFile(out+'/verification.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,output:out},null,2));
}catch(e){await page.screenshot({path:out+'/failure.png',fullPage:true});console.error('Browser errors:',errors);throw e;}finally{await browser.close();await preview.close();}

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ACADEMY_BROWSER_RUNTIME || 'playwright');
const repo = fileURLToPath(new URL('../../', import.meta.url));
const output = path.resolve(process.env.DASHBOARD_DESIGN_ARTIFACTS || path.join(repo, 'artifacts/dashboard-design'));
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const filename = pathname === '/ummabbadacademy.png' ? 'ummabbadacademy.png'
    : /^\/academy\/dashboard-design\/(?:index\.html|dashboard\.(?:js|css))?$/.test(pathname)
      ? pathname.slice(1) + (pathname.endsWith('/') ? 'index.html' : '') : null;
  if (!filename) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const content = await readFile(path.join(repo, filename));
    const type = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.png':'image/png' }[path.extname(filename)];
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control':'no-store' }); response.end(content);
  } catch { response.writeHead(404); response.end('Not found'); }
});
const serveOnly = process.argv.includes('--serve');
await new Promise((resolve,reject) => { server.once('error',reject); server.listen(serveOnly ? Number(process.env.DASHBOARD_DESIGN_PORT || 4178) : 0,'127.0.0.1',resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
if (serveOnly) {
  console.log(`Dashboard design: ${origin}/academy/dashboard-design/`);
  await new Promise(resolve => { process.once('SIGINT',resolve); process.once('SIGTERM',resolve); });
  await new Promise(resolve => server.close(resolve));
  process.exit(0);
}
let browser;
const checks = [];
try {
  browser = await chromium.launch({ headless:true, ...(process.env.ACADEMY_BROWSER_EXECUTABLE ? { executablePath:process.env.ACADEMY_BROWSER_EXECUTABLE } : { channel:'chrome' }) });
  const page = await browser.newPage({ viewport:{ width:1440, height:1100 }, colorScheme:'light' });
  const errors = [], unexpectedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (!url.startsWith(origin + '/') || url.includes('/api/')) { unexpectedRequests.push(url); return route.abort(); }
    return route.continue();
  });
  await page.goto(origin + '/academy/dashboard-design/');
  const main = page.locator('#dashboard-main');
  const modal = page.locator('#detail-dialog');
  const fya = main.locator('.attention-panel');
  const task = id => fya.locator(`button[data-id="${id}"]`);
  const count = async number => {
    await page.waitForFunction(expected => document.querySelectorAll('#dashboard-main .attention-panel .attention-row').length === expected,number);
    assert.equal(await fya.locator('.attention-row').count(),number);
  };
  const close = async () => { if (await modal.isVisible()) await page.locator('#close-dialog').click(); };
  const workspace = async name => {
    await close(); await page.locator(`#workspace-picker button[data-workspace="${name}"]`).click();
    await page.waitForFunction(space => location.hash === `#${space}/home`,name);
    await page.waitForFunction(space => document.querySelector('#workspace-picker button[aria-pressed="true"]')?.dataset.workspace === space,name);
  };
  const options = async () => { if (!await page.locator('#design-options').isVisible()) await page.locator('#options-button').click(); };
  const reset = async () => { await options(); await page.locator('#reset-preview').click(); };
  const screenshot = async name => {
    await page.locator('#options-button').evaluate(button => {
      const options = document.getElementById('design-options'); options.hidden = true; button.setAttribute('aria-expanded','false');
      document.getElementById('preview-toast').classList.remove('visible');
    });
    const viewport = page.viewportSize();
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({width:viewport.width,height});
    await page.evaluate(() => window.scrollTo(0,0));
    await page.waitForTimeout(200);
    await page.screenshot({ path:path.join(output,name),fullPage:false,animations:'disabled' });
    await page.setViewportSize(viewport);
  };
  const noOverflow = async () => {
    const overflow = await page.evaluate(() => ({document:document.documentElement.scrollWidth, viewport:innerWidth, product:document.getElementById('academy-design').scrollWidth, productWidth:document.getElementById('academy-design').clientWidth}));
    assert.ok(overflow.document <= overflow.viewport + 1,JSON.stringify(overflow));
    assert.ok(overflow.product <= overflow.productWidth + 1,JSON.stringify(overflow));
  };

  await count(4);
  await screenshot('learn-desktop.png');
  for (const space of ['learn','teach','admin']) {
    await workspace(space); await count(4);
    if (space !== 'learn') await screenshot(`${space}-desktop.png`);
    for (const width of [320,390,768]) {
      await page.setViewportSize({width,height:900}); await noOverflow();
      if (width === 390) await screenshot(`${space}-mobile.png`);
    }
    await page.setViewportSize({width:1440,height:1100});
  }
  checks.push('All three workspaces render at desktop, 768px, 390px and 320px without horizontal overflow.');

  await workspace('learn');
  await main.locator('.messages-panel button[data-id="prep"]').click();
  await modal.getByRole('heading',{name:'Mutha’ala for tonight’s lesson',exact:true}).waitFor();
  await close(); await count(4);
  assert.equal(await main.locator('.messages-panel .message-button.unread').count(),2);
  assert.equal(await task('prep').count(),1);
  await task('ack').click(); await modal.getByRole('button',{name:'I acknowledge',exact:true}).click();
  await count(3); assert.equal(await task('ack').count(),0);
  assert.equal(await main.locator('.messages-panel .message-button.unread').count(),1);
  checks.push('Reading preparation clears unread state while preserving FYA; acknowledgement clears its own action and unread state.');

  await task('homework').click(); await modal.getByRole('button',{name:'Submit homework',exact:true}).click();
  assert.equal(await modal.locator('#homework-error').isVisible(),true);
  await modal.locator('#homework-answer').fill('The house is big. The book is useful. The lesson is clear.');
  await modal.getByRole('button',{name:'Save draft',exact:true}).click(); await count(3);
  await task('homework').click();
  assert.match(await modal.locator('#homework-answer').inputValue(),/house is big/);
  await modal.getByRole('button',{name:'Submit homework',exact:true}).click(); await count(2);
  await task('feedback').click(); await modal.getByRole('button',{name:'Mark as reviewed',exact:true}).click(); await count(1);
  checks.push('Homework validates, keeps a draft without completing the task, and clears on submission; feedback requires explicit review.');

  await workspace('teach');
  await task('register').click(); await modal.getByRole('button',{name:'Save register',exact:true}).click();
  assert.equal(await modal.locator('#register-error').isVisible(),true);
  for (const select of await modal.locator('[data-register]').all()) await select.selectOption({label:'Present'});
  await modal.getByRole('button',{name:'Save register',exact:true}).click(); await count(3);
  for (let remaining=3;remaining>0;remaining--) {
    if (remaining === 3) await task('submissions').click();
    await modal.locator('#review-feedback').fill('Good examples. Recheck the predicate in the final sentence.');
    await modal.getByRole('button',{name:'Save feedback',exact:true}).click();
    if (remaining > 1) assert.match(await modal.locator('.detail-meta').innerText(),new RegExp(`${remaining-1} submission`));
  }
  await count(2);
  await task('plan').click(); await modal.locator('#lesson-plan').fill('Aim: form questions. Preparation: read the examples on page 15.');
  await modal.getByRole('button',{name:'Save lesson plan',exact:true}).click(); await count(1);
  await task('confirm').click(); await modal.getByRole('button',{name:'Confirm entry',exact:true}).click();
  assert.equal(await modal.locator('#confirm-error').isVisible(),true);
  await modal.locator('#confirm-entry').check(); await modal.getByRole('button',{name:'Confirm entry',exact:true}).click(); await count(0);
  await workspace('admin'); await count(3);
  assert.equal(await task('overdue-plan').count(),0);
  checks.push('Teacher registers, review queues, memorisation and planning complete correctly; saving a plan also resolves the matching admin follow-up.');

  await task('enrolment').click();
  for (let index=0;index<3;index++) {
    const name=['Maryam Yusuf','Hafsa Ali','Zaynab Hassan'][index];
    await modal.locator(`button[data-action="review-enrolment"][data-id="${name}"]`).click();
    await modal.getByRole('button',{name:index === 1 ? 'Decline request' : 'Approve enrolment',exact:true}).click();
  }
  await count(2);
  await task('release').click(); await modal.getByRole('button',{name:'Release 2 reports',exact:true}).click();
  assert.equal(await modal.locator('#release-error').isVisible(),true);
  await modal.locator('#release-confirm').check(); await modal.getByRole('button',{name:'Release 2 reports',exact:true}).click(); await count(1);
  await task('followup').click(); await close(); await count(1);
  checks.push('Admin decisions reduce the enrolment queue; report release requires review; viewing missing acknowledgements never dismisses them.');

  await options(); await page.locator('#account-preview').selectOption('scoped');
  await page.waitForFunction(() => location.hash === '#admin/home');
  assert.equal(await page.locator('#workspace-picker button').count(),2);
  assert.equal(await page.locator('#workspace-picker button[data-workspace="teach"]').count(),0);
  assert.equal((await main.innerText()).includes('Qur’an & tajwīd'),false);
  await page.evaluate(() => { location.hash = '#admin/notice/release'; });
  await modal.getByRole('heading',{name:'This item isn’t available',exact:true}).waitFor();
  assert.equal((await modal.innerText()).includes('Autumn assessment'),false);
  await close();
  await page.locator('#account-preview').selectOption('global'); await workspace('learn');
  assert.equal(await main.getByRole('heading',{name:'Your learning starts here',exact:true}).count(),1);
  assert.equal(await task('prep').count(),0);
  assert.equal(await page.locator('#workspace-picker button[data-workspace="teach"]').count(),0);
  await page.locator('#account-preview').selectOption('none');
  assert.equal(await page.locator('#workspace-picker button').count(),1);
  assert.match(await page.locator('#workspace-authority').innerText(),/None/);
  checks.push('Scoped Course Admin sees no other Course/Program; inaccessible deep links disclose no content; Global Admin gains no personal enrolment or teaching assignment; role None is explicit.');

  await page.locator('#account-preview').selectOption('all'); await reset();
  await page.locator('#state-preview').selectOption('loading');
  await main.getByRole('status').waitFor();
  await page.locator('#state-preview').selectOption('error');
  await main.getByRole('heading',{name:'Your dashboard couldn’t load',exact:true}).waitFor();
  assert.equal(await main.getByText('You’re up to date',{exact:true}).count(),0);
  await main.getByRole('button',{name:'Try again',exact:true}).click(); await count(4);
  await page.locator('#state-preview').selectOption('clear'); await count(0);
  await main.getByRole('heading',{name:'You’re up to date',exact:true}).waitFor();
  assert.equal(await main.locator('.messages-panel .message-button').count(),3);
  await page.locator('#state-preview').selectOption('empty');
  await main.getByRole('heading',{name:'Your learning starts here',exact:true}).waitFor();
  await page.locator('#state-preview').selectOption('normal');
  checks.push('Loading, error/retry, empty and completed states are distinct; a completed FYA does not remove messages.');

  await page.locator('#sign-in-preview').click(); await modal.getByRole('button',{name:'Continue with sample account',exact:true}).click();
  await page.waitForFunction(() => location.hash === '#learn/home');
  await page.locator('#deep-link-preview').click(); await modal.getByRole('button',{name:'Continue with sample account',exact:true}).click();
  await page.waitForFunction(() => location.hash === '#learn/notice/prep');
  await modal.getByRole('heading',{name:'Mutha’ala for tonight’s lesson',exact:true}).waitFor();
  await page.waitForTimeout(100);
  assert.equal(await modal.isVisible(),true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => location.hash === '#learn/home');
  await main.locator('.messages-panel button[data-id="prep"]').click();
  await page.locator('#close-dialog').focus(); await page.keyboard.press('Enter');
  await page.locator('.brand').click(); await count(4);
  await page.locator('.workspace-footer button').click(); await main.getByRole('heading',{name:'A place to learn and grow',exact:true}).waitFor();
  await main.getByRole('button',{name:'Return to your dashboard',exact:true}).click(); await count(4);
  checks.push('Normal sign-in opens the dashboard; notice sign-in preserves its destination; Escape/keyboard close work; Home and public catalogue remain distinct.');

  await page.locator('button[data-device="phone"]').click(); await noOverflow();
  assert.ok((await page.locator('#academy-design').boundingBox()).width <= 390);
  assert.equal(await fya.locator('.attention-row:visible').count(),2);
  await fya.getByRole('button',{name:'View all 4 actions',exact:true}).click();
  assert.equal(await modal.locator('.attention-row:visible').count(),4); await close();
  const positions=await main.evaluate(node => Object.fromEntries(['attention-panel','next-panel','messages-panel'].map(name => [name,node.querySelector('.'+name).getBoundingClientRect().top])));
  assert.ok(positions['attention-panel'] < positions['next-panel'] && positions['next-panel'] < positions['messages-panel']);
  await page.locator('#mobile-nav button[data-action="more"]').click();
  await modal.getByRole('heading',{name:'Your workspace',exact:true}).waitFor(); await close();
  await page.locator('button[data-device="responsive"]').click();
  await page.emulateMedia({colorScheme:'dark'}); await noOverflow(); await screenshot('learn-dark.png');
  assert.deepEqual(errors,[]); assert.deepEqual(unexpectedRequests,[]);
  checks.push('Phone preview, mobile More menu and dark appearance work; no JavaScript errors, external requests or Academy API calls occur.');
  const report={success:true,checks,screenshots:output};
  await writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}

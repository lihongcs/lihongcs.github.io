// Usage: NODE_PATH=/path/to/node_modules node tacdino/verify-site.cjs [base URL]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:8765';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = [], requests = [];
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'tacdino-site-qa-'));
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => requests.push(r.url()));
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${base}/tacdino/`, {waitUntil: 'networkidle'});
  await page.waitForSelector('#vt-table tbody tr');
  assert.equal(await page.title(), 'Tac-DINO: Learning Tactile Features with Patch Alignment');
  assert.equal(requests.some(r => r.endsWith('.mp4')), false, 'No videos should download at page entry');
  await page.screenshot({path: path.join(output, 'desktop-hero.png')});
  for (const target of ['method', 'results', 'demos']) {
    await page.locator(`#${target}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({path: path.join(output, `desktop-${target}.png`)});
  }
  await page.locator('#tab-objectfolder').click();
  assert.match(await page.locator('#vt-table').innerText(), /14\.62/);
  await page.locator('#tab-objectfolder').press('ArrowLeft');
  assert.equal(await page.locator('#tab-touch3d').getAttribute('aria-selected'), 'true');
  assert.match(await page.locator('#vt-table').innerText(), /37\.62/);
  await page.locator('details summary').click();
  assert.match(await page.locator('#multimodal-table').innerText(), /42\.10/);
  assert.match(await page.locator('#policy-table').innerText(), /71\.26/);
  const clipChecks = [];
  for (const video of await page.locator('.loop-video').all()) {
    await video.scrollIntoViewIfNeeded();
    await video.evaluate(async v => { if (!v.src) {v.src = v.dataset.src; v.load();} await v.play(); });
    await page.waitForTimeout(250);
    const info = await video.evaluate(v => ({src: v.getAttribute('src'),duration: v.duration,currentTime: v.currentTime,error: v.error,muted: v.muted}));
    assert.equal(info.error, null); assert.equal(info.muted, true); assert.ok(info.currentTime > 0); clipChecks.push(info);
  }
  await page.locator('#motion-toggle').click();
  assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.loop-video').evaluateAll(vs => vs.every(v => v.paused)), true);
  const widths = [];
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({width, height: 900});
    await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
    const size = await page.evaluate(() => ({viewport: innerWidth, scroll: document.documentElement.scrollWidth}));
    assert.equal(size.scroll, size.viewport, `Overflow at ${width}px`); widths.push(size);
    if (width === 390) {
      await page.screenshot({path: path.join(output, 'mobile-hero.png')});
      await page.locator('#results').scrollIntoViewIfNeeded();
      await page.screenshot({path: path.join(output, 'mobile-results.png')});
    }
  }
  await page.goto(`${base}/tac_dino/index.html?qa=1#method`);
  await page.waitForURL('**/tacdino/?qa=1#method');
  const reduced = await browser.newPage({reducedMotion:'reduce'});
  await reduced.goto(`${base}/tacdino/#demos`);
  await reduced.waitForTimeout(500);
  assert.equal(await reduced.locator('.loop-video').evaluateAll(vs => vs.every(v => v.paused)), true);
  assert.equal(await reduced.locator('#motion-toggle').innerText(), 'Play animations');
  await browser.close();
  assert.deepEqual(errors, []);
  const result = {passed: true, clips: clipChecks, widths, consoleErrors: errors, screenshots: output};
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch(e => {console.error(e);process.exit(1);});

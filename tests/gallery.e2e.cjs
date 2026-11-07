// Run on a fresh local seed before tests/e2e.cjs, which changes the listing and its photos.
// Use the fixture server described there; no authentication or external image service needed.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const BASE = process.env.BASE || 'http://localhost:8788/';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      page.setDefaultTimeout(8000);
      // First photo fails, the chosen cover loads. This must not trap the visitor on the unavailable photo.
      await page.route('**/media/A00001', r => r.fulfill({ status: 404, body: '' }));
      await page.route('**/media/A00002', r => r.fulfill({ contentType: 'image/jpeg', body: readFileSync('tests/fixtures/photo.jpg') }));
      await page.route(/matterport\.com/, r => r.abort());
      await page.goto(BASE + 'p/HE-R001');
      await page.locator('#stage img').waitFor();
      await page.click('[data-all]');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Escape');
      await page.locator('#stage.noimg').waitFor();
      const next = page.locator('.stage-nav.next');
      assert.ok(await next.evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }), `${width}px: unavailable-photo notice does not cover Next`);
      await next.click();
      await page.waitForFunction(() => document.querySelector('#stage img')?.naturalWidth > 0 && !document.querySelector('#stage').classList.contains('noimg'));
      assert.match(await page.locator('#stage-note').textContent(), /Photo 2 of 2/);
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Next photo');
      // Keyboard focus survives replacement of the photo; Enter advances without pointer input.
      await page.keyboard.press('Enter');
      await page.locator('#stage.noimg').waitFor();
      assert.match(await page.locator('#stage-note').textContent(), /Photo 1 of 2/);
      await page.locator('.stage-nav.prev').click();
      await page.waitForFunction(() => document.querySelector('#stage img')?.naturalWidth > 0);
      assert.match(await page.locator('#stage-note').textContent(), /Photo 2 of 2/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: no horizontal overflow`);
      await page.close();
    }
    console.log('Gallery OK: unavailable image, lightbox return, both arrows, keyboard/focus and recovery at 1280/390.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

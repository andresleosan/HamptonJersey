// Run against the local seed described in tests/e2e.cjs; only unsaved UI edits, no fixture writes.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const BASE = process.env.BASE || 'http://localhost:8788/';
(async () => {
  const { signSession, COOKIE } = await import('../server/auth.js');
  const localKey = readFileSync('.dev.vars', 'utf8').match(/^SESSION_SECRET=(.+)$/m)[1];
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.context().addCookies([{ name: COOKIE, value: await signSession('admin@example.test', localKey),
        domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
      await page.goto(BASE + 'admin/#/p/HE-R001');
      const visible = page.getByLabel('Visible on the website', { exact: true }).first();
      const label = visible.locator('..');
      await label.scrollIntoViewIfNeeded();
      assert.ok(await label.evaluate(e => e.getBoundingClientRect().height) >= (width === 390 ? 44 : 32), `${width}px: native control label retains its target size`);
      const checked = await visible.isChecked();
      await visible.setChecked(!checked);
      assert.equal(await visible.isChecked(), !checked, 'checkbox responds to pointer');
      await visible.setChecked(checked);
      await page.goto(BASE + 'admin/#/viewings?listing=HE-R001');
      const card = page.locator('section.interest');
      await card.getByRole('list', { name: 'People counted' }).getByRole('listitem').filter({ hasText: 'Mark Querée' })
        .getByRole('button', { name: 'Remove from count', exact: true }).click();
      const form = card.locator('form'), other = form.getByLabel('Other', { exact: true });
      assert.ok(await other.locator('..').evaluate(e => e.getBoundingClientRect().height) >= (width === 390 ? 44 : 32));
      await other.check();
      assert.ok(await other.isChecked(), 'radio responds to pointer');
      await form.getByRole('button', { name: 'Save', exact: true }).click();
      await form.getByText('Add a note for Other').waitFor();
      await other.focus();
      await page.keyboard.press('ArrowLeft');
      assert.ok(await form.getByLabel('Not a buyer or tenant', { exact: true }).isChecked(), 'radio responds to keyboard');
      await form.getByRole('button', { name: 'Close', exact: true }).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: no horizontal overflow`);
      await page.close();
    }
    console.log('Native controls OK: pointer, keyboard, validation and label targets at 1280/390.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

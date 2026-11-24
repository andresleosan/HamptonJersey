const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const BASE = process.env.BASE;
const DAY = 86_400_000;

(async () => {
  assert.ok(BASE && process.env.E2E_VARS, 'must use isolated local fixtures');
  const { signSession, COOKIE } = await import('../server/auth.js');
  const vars = parseEnv(readFileSync(process.env.E2E_VARS, 'utf8'));
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/Los_Angeles' });
    await ctx.addCookies([{ name: COOKIE, value: await signSession('admin@example.test', vars.SESSION_SECRET),
      domain: new URL(BASE).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }]);
    const page = await ctx.newPage(), now = Date.now();
    const archived = Array.from({ length: 52 }, (_, i) => {
      const n = i + 1, updated = new Date(now - (52.5 - n) * DAY).toISOString();
      return { id: 'HE-R' + String(n).padStart(3, '0'), title: 'Pagination fixture ' + n,
        updated_at: n % 2 ? updated : updated.replace('T', ' ').replace('Z', ''),
        material_change_at: null, archived_at: updated, published: 0, operation: 'sale', use: 'residential',
        country: 'Jersey', availability: 'for_sale', provenance: { kind: 'hampton', labels: [] } };
    });
    const published = { ...archived[51], id: 'HE-R900', title: 'Published fixture', archived_at: null, published: 1 };
    await page.route('**/api/admin/listings', route => route.fulfill({ json: { listings: [published, ...archived], provenance_tracking: true } }));
    await page.goto(BASE + 'admin/#/listings');
    const tab = name => page.getByRole('button', { name });
    const prev = tab('Previous page'), next = tab('Next page');
    const sort = tab('Last edited'), heading = page.getByRole('columnheader', { name: 'Last edited' });
    const date = page.getByLabel('Last edited', { exact: true });
    const first = () => page.locator('tbody tr').first().getByRole('link').first().innerText();
    const range = async (a, b, n) => page.getByText('Showing ' + a + '\u2013' + b + ' of ' + n + ' listings', { exact: true }).waitFor();
    await tab(/^Archived/).click();
    await range(1, 25, 52);
    assert.equal(await page.locator('tbody tr').count(), 25);
    assert.equal(await first(), 'Pagination fixture 1');
    assert.ok(await prev.isDisabled());
    await next.click(); await range(26, 50, 52);
    await sort.focus(); await page.keyboard.press('Enter');
    await range(1, 25, 52);
    assert.equal(await heading.getAttribute('aria-sort'), 'descending');
    assert.equal(await first(), 'Pagination fixture 52', 'newest from outside original first page is now first');
    await next.click(); await range(26, 50, 52);
    assert.equal(await first(), 'Pagination fixture 27');
    await next.click(); await range(51, 52, 52);
    assert.ok(await next.isDisabled());
    await date.selectOption('30'); await range(1, 25, 30);
    assert.equal(await date.inputValue(), '30');
    await next.click(); await range(26, 30, 30);
    await date.selectOption('7'); await range(1, 7, 7);
    assert.ok(await prev.isDisabled());
    await sort.click();
    assert.equal(await heading.getAttribute('aria-sort'), 'ascending');
    assert.equal(await first(), 'Pagination fixture 46');
    await date.selectOption(''); await range(1, 25, 52);
    await next.click(); await range(26, 50, 52);
    await tab(/^Published/).click();
    await page.getByText('Showing 1\u20131 of 1 listing', { exact: true }).waitFor();
    assert.ok(await prev.isDisabled());
    assert.ok(await next.isDisabled());
    await tab(/^Archived/).click(); await range(1, 25, 52);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByLabel('Sort by last edited').selectOption('desc');
    assert.equal(await first(), 'Pagination fixture 52');
    console.log('Last edited, independent date filter, full-list sort, 25-row paging and mobile control verified.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

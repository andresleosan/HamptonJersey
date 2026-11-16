// Persistent WebKit renderer: reads {"url":..} lines on stdin, writes {"html","final"} lines on stdout.
import { createRequire } from 'module';
import readline from 'readline';
const require = createRequire('/root/cotizador-video/package.json');
const { webkit } = require('playwright-core');
const browser = await webkit.launch();
const ctx = await browser.newContext({ userAgent: 'HamptonEstatesBot/0.1 (+https://www.hamptonestatesjersey.com)', locale: 'en-GB' });
const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) {
  const { url } = JSON.parse(line);
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 2500); await page.waitForTimeout(700); }
    console.log(JSON.stringify({ html: await page.content(), final: page.url() }));
  } catch (e) { console.log(JSON.stringify({ error: String(e).slice(0, 200) })); }
  await page.close();
}
await browser.close();

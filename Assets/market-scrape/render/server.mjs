// Renderizador por stdio (sin puertos): lee {id,url} por línea y responde {id,status,final,html|error} por línea.
import readline from 'node:readline';
import { chromium } from 'playwright-core';
const UA = 'HamptonEstatesBot/0.1 (+https://www.hamptonestatesjersey.com)';
// --no-sandbox solo es aceptable aquí: contenedor no root, sin capacidades, sin acceso al host.
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ userAgent: UA, locale: 'en-GB', serviceWorkers: 'block' });
const send = o => process.stdout.write(JSON.stringify(o) + '\n');
async function render({ id, url }) {
  if (!/^https?:\/\//.test(url || '')) return send({ id, error: 'bad url' });
  const page = await ctx.newPage();
  try {
    // no descargar imágenes, fuentes ni medios: solo se leen datos de texto
    await page.route('**/*', r => ['image', 'font', 'media'].includes(r.request().resourceType()) ? r.abort() : r.continue());
    const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    send({ id, status: r ? r.status() : null, final: page.url(), html: await page.content() });
  } catch (e) { send({ id, error: String(e).slice(0, 200) }); }
  finally { await page.close(); }
}
readline.createInterface({ input: process.stdin }).on('line', l => { try { render(JSON.parse(l)); } catch {} });

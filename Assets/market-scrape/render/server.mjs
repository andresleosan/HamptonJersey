// Renderizador por stdio (sin puertos): lee {id,url} por línea y responde {id,status,final,html|error} por línea.
import readline from 'node:readline';
import dns from 'node:dns/promises';
import net from 'node:net';
import { chromium } from 'playwright-core';
const UA = 'HamptonEstatesBot/0.1 (+https://www.hamptonestatesjersey.com)';
// --no-sandbox solo es aceptable aquí: contenedor no root, sin capacidades, sin acceso al host.
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ userAgent: UA, locale: 'en-GB', serviceWorkers: 'block' });
// Nunca salir hacia redes privadas, loopback, link-local o CGNAT (SSRF): se resuelve cada host antes de dejar pasar la petición.
const PRIV = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|22[4-9]\.|2[3-5]\d\.|::1$|::$|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:|::ffff:)/i;
const bare = h => h.toLowerCase().replace(/^www\./, '');
async function publicHost(h) {
  if (PRIV.test(h)) return false;
  if (net.isIP(h)) return true;
  try { return (await dns.lookup(h, { all: true })).every(a => !PRIV.test(a.address)); } catch { return false; }
}
const send = o => process.stdout.write(JSON.stringify(o) + '\n');
async function render({ id, url }) {
  if (!/^https?:\/\/[^\\@\s]+$/.test(url || '') || !(await publicHost(new URL(url).hostname))) return send({ id, error: 'bad url' });
  const page = await ctx.newPage();
  try {
    // no descargar imágenes, fuentes ni medios: solo se leen datos de texto
    const home = bare(new URL(url).hostname);
    await page.route('**/*', async r => {
      const q = r.request(), u = new URL(q.url());
      if (!/^https?:$/.test(u.protocol) || u.username || u.password) return r.abort();
      if (['image', 'font', 'media'].includes(q.resourceType())) return r.abort();
      // recursos de terceros (JS/CSS/API) permitidos solo si son públicos; el cambio de host de la página lo detecta el lector
      return (await publicHost(u.hostname)) ? r.continue() : r.abort();
    });
    const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    send({ id, status: r ? r.status() : null, final: page.url(), html: await page.content() });
  } catch (e) { send({ id, error: String(e).slice(0, 200) }); }
  finally { await page.close(); }
}
readline.createInterface({ input: process.stdin }).on('line', l => { try { render(JSON.parse(l)); } catch {} });

// Local-only Pages Functions fixture. Uses the existing proxy for real outbound requests.
const { createRequire } = require('node:module');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { resolve, join, dirname } = require('node:path');
const { tmpdir } = require('node:os');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const repo = process.cwd();
const fromRepo = createRequire(join(repo, 'package.json'));
const { unstable_readConfig } = fromRepo('wrangler');
const { Miniflare, convertV4MiniflareOptions } = fromRepo('miniflare');
const { EnvHttpProxyAgent, fetch: proxyFetch } = fromRepo('undici');
const QA_TEST_DB_ID = 'a4a52a8c-98d3-4444-998a-000000000099';

// An opt-in stub for the isolated, offline test fixture only; all other outbound calls retain the existing proxy.
function offlineTurnstile(request, enabled) {
  const url = new URL(request.url);
  if (!enabled || url.origin !== 'https://challenges.cloudflare.com' || url.pathname !== '/turnstile/v0/siteverify') return null;
  return Response.json({ success: true });
}

async function startFixture({ persist = process.env.E2E_PERSIST, varsFile = process.env.E2E_VARS,
  port = Number(process.env.PORT || 8788), qaDb = false } = {}) {
  if (!persist || !varsFile) throw Error('Set E2E_PERSIST and E2E_VARS to isolated local fixtures.');
  const vars = parseEnv(readFileSync(varsFile, 'utf8'));
  if (!/^1x0+AA$/.test(vars.TURNSTILE_SECRET || '') || !/^1x0+A[AB]$/.test(vars.TURNSTILE_SITE_KEY || '')) {
    throw Error('The fixture requires the official always-pass Turnstile test pair.');
  }
  const config = unstable_readConfig({ config: 'wrangler.toml' });
  const scratch = mkdtempSync(join(tmpdir(), 'hampton-e2e-worker-'));
  const dispatcher = new EnvHttpProxyAgent();
  let mf;
  try {
    const bundle = join(scratch, 'index.js');
    const wrangler = join(dirname(fromRepo.resolve('wrangler')), '..', 'bin', 'wrangler.js');
    execFileSync(process.execPath, [wrangler, 'pages', 'functions', 'build', '--outdir', scratch], { cwd: repo, stdio: 'pipe' });
    const options = await convertV4MiniflareOptions({
      host: '127.0.0.1', port, https: process.env.E2E_LOCAL_HTTPS === '1',
      modules: true, modulesRoot: scratch, scriptPath: bundle, name: 'hampton-e2e',
      compatibilityDate: config.compatibility_date,
      bindings: { ...config.vars, ...vars },
      d1Databases: { ...Object.fromEntries(config.d1_databases.map(d => [d.binding, d.database_id])),
        ...(qaDb ? { QA_DB: QA_TEST_DB_ID } : {}) },
      r2Buckets: Object.fromEntries(config.r2_buckets.map(b => [b.binding, b.bucket_name])),
      resourcePersistencePath: join(resolve(persist), 'v3'),
      assets: { directory: resolve(config.pages_build_output_dir), binding: 'ASSETS', run_worker_first: true, routerConfig: { has_user_worker: true } },
      outboundService: request => offlineTurnstile(request, process.env.E2E_OFFLINE_TURNSTILE === '1') ?? proxyFetch(request.url, {
        method: request.method, headers: request.headers, body: request.body,
        duplex: 'half', redirect: 'manual', dispatcher,
      }),
    });
    mf = new Miniflare(options);
    const url = await mf.ready;
    if (qaDb) await (await mf.getD1Database('QA_DB')).prepare('SELECT 1 FROM listings LIMIT 1').first();
    return { url, close: async () => { await mf.dispose(); await dispatcher.close(); rmSync(scratch, { recursive: true }); } };
  } catch (error) {
    if (mf) await mf.dispose();
    await dispatcher.close();
    rmSync(scratch, { recursive: true });
    throw error;
  }
}

if (require.main === module) {
  startFixture().then(({ url, close }) => {
    console.log(`Local E2E fixture ready: ${url}`);
    let closing = false;
    const stop = async () => { if (closing) return; closing = true; await close(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { startFixture, QA_TEST_DB_ID, offlineTurnstile };

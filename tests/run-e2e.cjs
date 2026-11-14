// A fresh local database and test credentials for each run; never uses .dev.vars.
const { mkdtempSync, readFileSync, writeFileSync, rmSync, chmodSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { tmpdir } = require('node:os');
const { randomBytes, generateKeyPairSync } = require('node:crypto');
const { parseEnv } = require('node:util');
const { startFixture } = require('./serve-e2e.cjs');
const { run: runProcess } = require('./e2e-process.cjs');
const structuredFixture = process.env.E2E_SCRIPT === 'tests/pub06-structured.e2e.cjs';
if (structuredFixture && (process.env.E2E_PRODUCTION_READONLY !== '0' || process.env.HAMPTON_E2E_ISOLATED !== '1' ||
    process.env.E2E_LOCAL_HTTPS !== '1')) throw new Error('PUB-06 fixtures require the isolated local browser runner');
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());

const run = (args, env = process.env) => runProcess(process.execPath, args, { env, signal: controller.signal });

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hampton-e2e-'));
  chmodSync(dir, 0o700);
  let server;
  try {
    const example = parseEnv(readFileSync('.dev.vars.example', 'utf8'));
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    const vars = {
      ...(structuredFixture ? { PUB06_STRUCTURED_ECONOMICS_READY: '1' } : {}),
      ...(process.env.E2E_SCRIPT === 'tests/pub08-integrated.e2e.cjs' ? { PUB08_CONTENT_READY: '1' } : {}),
      ...(process.env.E2E_SCRIPT === "tests/listing-health.e2e.cjs" ? { LISTING_HEALTH_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/search-milestones.e2e.cjs" ? { SEARCH_MILESTONES_READY: "1" } : {}),
      // ponytail: SPR-02 A drives the gate-off direct unpublish 409; the gated withdrawal flow is pub09-withdrawal.e2e.cjs.
      ...(process.env.E2E_SCRIPT === 'tests/listing-history.e2e.cjs' ? { PUB09_WITHDRAWALS_READY: '0' } : {}),
      ...(process.env.E2E_SCRIPT === "tests/vis-09-viewing-rules.e2e.cjs" ? { VIS09_VIEWING_POLICY_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm-06-tenancy-origin.e2e.cjs" ? { ADM06_TENANCY_ORIGIN_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm-16-tenancy-exit.e2e.cjs" ? { ADM16_TENANCY_EXIT_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm-13-inspections.e2e.cjs" ? { ADM13_INSPECTIONS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/pub-11-documents.e2e.cjs" ? { PUB11_DOCUMENTS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/age-14-suppression.e2e.cjs" ? { AGE14_SUPPRESSION_READY: "1" } : {}),
      SESSION_SECRET: randomBytes(32).toString('hex'),
      TURNSTILE_SITE_KEY: example.TURNSTILE_SITE_KEY,
      TURNSTILE_SECRET: example.TURNSTILE_SECRET,
      DRIVE_API: 'http://localhost:8799', DRIVE_TOKEN_URL: 'http://localhost:8799/token',
      GOOGLE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'e2e@example.iam.gserviceaccount.com', private_key: privateKey }),
    };
    const varsFile = join(dir, 'fixture.vars');
    writeFileSync(varsFile, Object.entries(vars).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
    const persist = join(dir, 'state');
    console.log('Preparing isolated local E2E fixture.');
    const wrangler = join(dirname(require.resolve('wrangler')), '..', 'bin', 'wrangler.js');
    const vite = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
    // Same build steps as npm run build, without npm/npx parent processes on cancellation.
    await run(['scripts/check-release.mjs']);
    await run([vite, 'build', '--config', 'admin/vite.config.mjs']);
    await run([wrangler, 'd1', 'migrations', 'apply', 'hampton', '--local', '--persist-to', persist]);
    // Canonical migrations include the combined PUB-06/SPR-01 schema (0052).
    await run([wrangler, 'd1', 'execute', 'hampton', '--local', '--persist-to', persist, '--file', 'tests/fixtures/seed.sql']);
    server = await startFixture({ persist, varsFile, port: 0,
      seedMedia: process.env.E2E_SCRIPT === 'tests/pub08-integrated.e2e.cjs' });
    await run([process.env.E2E_SCRIPT || 'tests/e2e.cjs'], { ...process.env, BASE: server.url.href, E2E_PERSIST: persist, E2E_VARS: varsFile });
  } finally {
    if (server) await server.close();
    rmSync(dir, { recursive: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

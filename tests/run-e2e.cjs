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
      // VIS-10 reads PUB-07's occupancy, so its test needs both families on.
      ...(process.env.E2E_SCRIPT === "tests/vis10-house-rules.e2e.cjs" ? { VIS10_HOUSE_RULES_READY: "1", PUB07_COMPLIANCE_READY: "1" } : {}),
      // VIS-08 asks VIS-10's notice again on Confirm, so its test needs both on.
      ...(process.env.E2E_SCRIPT === "tests/vis08-viewing-cycle.e2e.cjs" ? { VIS08_CYCLE_READY: "1", VIS10_HOUSE_RULES_READY: "1" } : {}),
      // VIS-04's follow-up, on the cycle it completes (the answer recorded later).
      ...(process.env.E2E_SCRIPT === "tests/vis04-after-viewing.e2e.cjs" ? { VIS04_OUTCOME_READY: "1", VIS08_CYCLE_READY: "1" } : {}),
      PUB21_DRIVE_READY: "1", // Properties Queue's Drive imports: tested switched on, off in production (master plan)
      ...(process.env.E2E_SCRIPT === "tests/adm-06-tenancy-origin.e2e.cjs" ? { ADM06_TENANCY_ORIGIN_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm-16-tenancy-exit.e2e.cjs" ? { ADM16_TENANCY_EXIT_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm-13-inspections.e2e.cjs" ? { ADM13_INSPECTIONS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/not-05-missing-payments.e2e.cjs" ? { NOT05_MISSING_PAYMENTS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/pub-11-documents.e2e.cjs" ? { PUB11_DOCUMENTS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/pub07-compliance.e2e.cjs" ? { PUB07_COMPLIANCE_READY: "1" } : {}),
      // PUB-01's guide points at every family's section, so its test has them on as in production.
      ...(process.env.E2E_SCRIPT === "tests/pub01-guided-intake.e2e.cjs"
        ? { PUB07_COMPLIANCE_READY: "1", PUB08_CONTENT_READY: "1", PUB11_DOCUMENTS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/age-14-suppression.e2e.cjs" ? { AGE14_SUPPRESSION_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm17-legal-terms.e2e.cjs" ? { ADM17_LEGAL_TERMS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/est01-search-state.e2e.cjs" ? { EST01_SEARCH_STATE_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm11-compliance.e2e.cjs" ? { ADM11_CALENDAR_READY: "1", ADM17_LEGAL_TERMS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/bus10-identity.e2e.cjs" ? { BUS10_IDENTITY_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/aut19-criteria-proposal.e2e.cjs" ? { AUT19_CRITERIA_PROPOSALS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/est16-availability.e2e.cjs" ? { EST16_AVAILABILITY_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/est15-unavailability.e2e.cjs" ? { EST16_AVAILABILITY_READY: "1", EST15_UNAVAILABILITY_READY: "1" } : {}),
      // AGE-03 reuses EST-16's confirmed availability, so its test has both on.
      ...(process.env.E2E_SCRIPT === "tests/age03-enquiries.e2e.cjs" ? { AGE03_ENQUIRIES_READY: "1", EST16_AVAILABILITY_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm20-tenancy-law.e2e.cjs" ? { ADM20_TENANCY_LAW_READY: "1", ADM17_LEGAL_TERMS_READY: "1" } : {}),
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

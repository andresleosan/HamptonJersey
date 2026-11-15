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
      ...(process.env.E2E_SCRIPT === "tests/pub16-timed-closure.e2e.cjs" ? { PUB16_TIMED_CLOSURE_READY: "1" } : {}),
      PUB21_DRIVE_READY: "1", // Properties Queue's Drive imports: tested switched on, off in production (master plan)
      ...(process.env.E2E_SCRIPT === "tests/adm-06-tenancy-origin.e2e.cjs" ? { ADM06_TENANCY_ORIGIN_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm-16-tenancy-exit.e2e.cjs" ? { ADM16_TENANCY_EXIT_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm-13-inspections.e2e.cjs" ? { ADM13_INSPECTIONS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm12-repairs.e2e.cjs" ? { ADM12_SUPPLIERS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/not-05-missing-payments.e2e.cjs" ? { NOT05_MISSING_PAYMENTS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/pub-11-documents.e2e.cjs" ? { PUB11_DOCUMENTS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/pub07-compliance.e2e.cjs" ? { PUB07_COMPLIANCE_READY: "1" } : {}),
      // PUB-01's guide points at every family's section, so its test has them on as in production.
      ...(process.env.E2E_SCRIPT === "tests/pub01-guided-intake.e2e.cjs"
        ? { PUB07_COMPLIANCE_READY: "1", PUB08_CONTENT_READY: "1", PUB11_DOCUMENTS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/age-14-suppression.e2e.cjs" ? { AGE14_SUPPRESSION_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm17-legal-terms.e2e.cjs" ? { ADM17_LEGAL_TERMS_READY: "1" } : {}),
      // EST-01 checks the Matches column as it reads without SAP-02's counts (on in wrangler.toml); SAP-02 has its own check.
      ...(process.env.E2E_SCRIPT === "tests/est01-search-state.e2e.cjs" ? { EST01_SEARCH_STATE_READY: "1", SAP02_COUNTS_READY: "0" } : {}),
      // ADM-20's warnings check expects New tenancy without the 2025 rules (on in wrangler.toml); ADM-20 has its own check.
      ...(process.env.E2E_SCRIPT === "tests/adm-20-warnings.e2e.cjs" ? { ADM20_TENANCY_LAW_READY: "0" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm11-compliance.e2e.cjs" ? { ADM11_CALENDAR_READY: "1", ADM17_LEGAL_TERMS_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/bus10-identity.e2e.cjs" ? { BUS10_IDENTITY_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/bus01-market-matching.e2e.cjs"
        ? { BUS01_MARKET_MATCHING_READY: "1", BUS10_IDENTITY_READY: "1", EST01_SEARCH_STATE_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/aut19-criteria-proposal.e2e.cjs" ? { AUT19_CRITERIA_PROPOSALS_READY: "1" } : {}),
      // EST-16 on its own: EST-15 (on in wrangler.toml) would ask for a reason and withdraw proposals; its own check covers both.
      ...(process.env.E2E_SCRIPT === "tests/est16-availability.e2e.cjs" ? { EST16_AVAILABILITY_READY: "1", EST15_UNAVAILABILITY_READY: "0" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/est15-unavailability.e2e.cjs" ? { EST16_AVAILABILITY_READY: "1", EST15_UNAVAILABILITY_READY: "1" } : {}),
      // AGE-03 reuses EST-16's confirmed availability, so its test has both on.
      ...(process.env.E2E_SCRIPT === "tests/age03-enquiries.e2e.cjs" ? { AGE03_ENQUIRIES_READY: "1", EST16_AVAILABILITY_READY: "1" } : {}),
      // AGE-05 sends only with AGE-03, EST-16 and EST-15 on. The email service counts as set up here, with no email binding
      // and no clock Worker in the fixture: an enquiry can be queued and nothing is ever sent.
      ...(process.env.E2E_SCRIPT === "tests/age05-send.e2e.cjs" ? { AGE03_ENQUIRIES_READY: "1", EST16_AVAILABILITY_READY: "1",
        EST15_UNAVAILABILITY_READY: "1", AGE05_SEND_READY: "1", EMAIL_SERVICE_READY: "true" } : {}),
      // AGE-06 records answers to enquiries (AGE-03) as EST-16 confirmations that EST-15 propagates: the four on.
      ...(process.env.E2E_SCRIPT === "tests/age06-responses.e2e.cjs" ? { AGE03_ENQUIRIES_READY: "1", EST16_AVAILABILITY_READY: "1",
        EST15_UNAVAILABILITY_READY: "1", AGE06_RESPONSES_READY: "1" } : {}),
      // AGE-08 calls about enquiries sent (AGE-03) and closes the call with an answer (AGE-06): the five on.
      ...(process.env.E2E_SCRIPT === "tests/age08-call-tasks.e2e.cjs" ? { AGE03_ENQUIRIES_READY: "1", EST16_AVAILABILITY_READY: "1",
        EST15_UNAVAILABILITY_READY: "1", AGE06_RESPONSES_READY: "1", AGE08_CALL_TASKS_READY: "1" } : {}),
      // SAP-02/SAP-03/EST-04 count what EST-16's confirmations and AGE-03's enquiries say, so its test has the three on.
      ...(process.env.E2E_SCRIPT === "tests/sap02-match-counts.e2e.cjs"
        ? { SAP02_COUNTS_READY: "1", EST16_AVAILABILITY_READY: "1", AGE03_ENQUIRIES_READY: "1" } : {}),
      ...(process.env.E2E_SCRIPT === "tests/adm20-tenancy-law.e2e.cjs" ? { ADM20_TENANCY_LAW_READY: "1", ADM17_LEGAL_TERMS_READY: "1" } : {}),
      // ADM-15 reads ADM-20's rules and ADM-17's validation, so its test has the three on.
      ...(process.env.E2E_SCRIPT === "tests/adm15-rent-review.e2e.cjs"
        ? { ADM15_RENT_REVIEW_READY: "1", ADM20_TENANCY_LAW_READY: "1", ADM17_LEGAL_TERMS_READY: "1" } : {}),
      // SPR-08 reads VIS-08's dates and EST-16's confirmation beside its own notes, so its test has the three on.
      ...(process.env.E2E_SCRIPT === "tests/spr08-listing-sections.e2e.cjs"
        ? { SPR08_SECTIONS_READY: "1", VIS08_CYCLE_READY: "1", EST16_AVAILABILITY_READY: "1", BUS07_PROVENANCE_READY: "0" } : {}),
      // BUS-07 reads BUS-10's homes, EST-16's confirmations and SPR-08's Adverts card, so its test has the four on.
      ...(process.env.E2E_SCRIPT === "tests/bus07-provenance.e2e.cjs" ? { BUS07_PROVENANCE_READY: "1", BUS10_IDENTITY_READY: "1",
        EST16_AVAILABILITY_READY: "1", SPR08_SECTIONS_READY: "1" } : {}),
      // SPR-03 captures from EST-16's confirmation and shows its record in SPR-08's sections.
      ...(process.env.E2E_SCRIPT === "tests/spr03-capture.e2e.cjs" ? { SPR03_CAPTURE_READY: "1", EST16_AVAILABILITY_READY: "1",
        SPR08_SECTIONS_READY: "1", BUS07_PROVENANCE_READY: "0" } : {}),
      // AGE-10 reviews the photos of SPR-03's capture, in SPR-08's sections.
      ...(process.env.E2E_SCRIPT === "tests/age10-photo-permissions.e2e.cjs" ? { AGE10_PHOTOS_READY: "1", SPR03_CAPTURE_READY: "1",
        EST16_AVAILABILITY_READY: "1", SPR08_SECTIONS_READY: "1", BUS07_PROVENANCE_READY: "0" } : {}),
      // AGE-12 presents AGE-10's suitable photos of SPR-03's capture on a client's private link.
      ...(process.env.E2E_SCRIPT === "tests/age12-private-presentation.e2e.cjs" ? { AGE12_PRESENTATIONS_READY: "1", AGE10_PHOTOS_READY: "1",
        SPR03_CAPTURE_READY: "1", EST16_AVAILABILITY_READY: "1", SAP02_COUNTS_READY: "1" } : {}),
      // EST-19: the trash of properties confirmed not available and the six-month photo purge, both tested on.
      ...(process.env.E2E_SCRIPT === "tests/est19-trash.e2e.cjs" ? { EST16_AVAILABILITY_READY: "1", EST15_UNAVAILABILITY_READY: "1",
        EST19_TRASH_READY: "1", EST19_PURGE_READY: "1" } : {}),
      // NOT-08/NOT-09: Inbox tabs and one-click actions over AGE-06/AGE-08's enquiry tasks and AUT-19's proposals.
      ...(process.env.E2E_SCRIPT === "tests/not0809-inbox-actions.e2e.cjs" ? { NOT0809_INBOX_READY: "1", AGE03_ENQUIRIES_READY: "1",
        EST16_AVAILABILITY_READY: "1", EST15_UNAVAILABILITY_READY: "1", AGE06_RESPONSES_READY: "1", AGE08_CALL_TASKS_READY: "1",
        AUT19_CRITERIA_PROPOSALS_READY: "1" } : {}),
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

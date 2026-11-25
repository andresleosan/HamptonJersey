// AUT-22: the week's saved Insights (weekly_insights, ANA-08) emailed to the team summary's recipients, once per week and
// recipient, through the approved queue (outbound) that Hermes's carrier sends verbatim. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, seedListing } from "./helpers.mjs";
import { configure } from "./email-helpers.mjs";
import { claimForHermes } from "../../server/email.js";
import { weeklyInsightsPass } from "../../server/weekly-insights.js";
import { weeklyInsightsEmailPass } from "../../server/weekly-insights-email.js";
import worker from "../../server/jobs.js";

const TS = "2026-11-09T08:00:00.000Z", WEEK = "2026-11-02", LATER = "2026-11-10T09:30:00.000Z";
const NEXT = "2026-11-16T08:10:00.000Z", NEXT_WEEK = "2026-11-09";
const TEAM = ["team@example.test", "ops@example.test"];
const PRIVATE = ["Private fixture", "private@example.test", "Private visitor", "visitor@example.test", "+447700900123"];
const run = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);
const all = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a);
const weekly = env => all(env, "SELECT * FROM outbound WHERE template = 'weekly_insights' ORDER BY id");

async function world({ on = true, snapshot = true, ...settings } = {}) {
  const env = makeEnv();
  seedListing(env);
  env.HERMES_MAIL_READY = "1";
  if (on) env.AUT22_WEEKLY_EMAIL_READY = "1";
  configure(env, { recipients: TEAM, ...settings });
  for (const [day, n] of [["2026-11-01", 7], [WEEK, 2], ["2026-11-08", 3]]) run(env, "INSERT INTO daily_stats VALUES(?,'HE-R001','view',?)", day, n);
  const cid = Number(run(env, `INSERT INTO contacts(name,email,phone,last_activity_at,created_at,updated_at)
    VALUES('Private fixture','private@example.test','+447700900123',?,?,?)`, TS, TS, TS).lastInsertRowid);
  run(env, "INSERT INTO applicants(contact_id,operation,stage,source,created_at,updated_at) VALUES(?,'rent','searching','phone',?,?)", cid, "2026-11-03T10:00:00.000Z", TS);
  run(env, `INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
    VALUES('HE-R001','In person','2026-11-04','10:00','Private visitor','visitor@example.test','completed','2026-11-03T09:00:00.000Z')`);
  if (snapshot) assert.equal((await weeklyInsightsPass(env, TS)).created, true);
  return env;
}
// Each claim the carrier would make now, until none is left (each is settled as sent so the next one comes).
async function claims(env) {
  const out = [];
  for (let c; (c = await claimForHermes(env));) {
    out.push(c);
    run(env, "UPDATE outbound SET status = 'accepted', message_id = ?, claim_token = NULL WHERE ref = ?", `m-${out.length}`, c.ref);
  }
  return out;
}

test("one email per week and recipient, from the stored snapshot, idempotent across ticks", async () => {
  const env = await world();
  await weeklyInsightsEmailPass(env, TS);
  await weeklyInsightsEmailPass(env, TS);
  await weeklyInsightsEmailPass(env, LATER);
  const rows = weekly(env);
  assert.deepEqual(rows.map(r => r.recipient).sort(), [...TEAM].sort());
  for (const r of rows) {
    assert.equal(r.status, "queued");
    assert.equal(r.entity_id, WEEK);
    assert.equal(r.config_revision, 1);
    assert.equal(r.approved_by, "admin@example.test");
  }
  // The next week's snapshot is a new email for each recipient; the old week is not sent again.
  await weeklyInsightsPass(env, NEXT);
  await weeklyInsightsEmailPass(env, NEXT);
  await weeklyInsightsEmailPass(env, NEXT);
  assert.equal(weekly(env).length, 4);
  assert.equal(weekly(env).filter(r => r.entity_id === NEXT_WEEK).length, 2);
});

test("the claim hands the carrier the queued text verbatim, with the snapshot's figures only", async () => {
  const env = await world();
  run(env, "UPDATE daily_stats SET n = 100"); // after the snapshot: never recalculated
  await weeklyInsightsEmailPass(env, LATER);
  assert.equal(all(env, "SELECT COUNT(*) n FROM weekly_insights")[0].n, 1, "no snapshot is made by the email");
  const got = await claims(env);
  assert.equal(got.length, 2);
  for (const c of got) {
    assert.ok(c.subject.startsWith(`Hampton weekly Insights · ${WEEK} to 2026-11-08`));
    assert.match(c.text, /^5 listing views/m);
    assert.match(c.text, /^1 viewing requests/m);
    assert.match(c.text, /^1 new applicants/m);
    assert.match(c.text, /^1 viewings completed/m);
    assert.match(c.text, /HE-R001: 5 views/);
    assert.match(c.text, /View counting covers the whole week/);
    assert.match(c.text, /#\/insights\/weekly\/2026-11-02/);
    assert.ok(!c.text.includes("100"));
    for (const p of PRIVATE) assert.ok(!c.text.includes(p) && !c.subject.includes(p), p);
  }
  assert.equal(got[0].text, weekly(env).find(r => r.ref === got[0].ref).text);
});

test("no snapshot stored for the week: nothing is queued and none is calculated", async () => {
  const env = await world({ snapshot: false });
  await weeklyInsightsEmailPass(env, LATER);
  assert.equal(weekly(env).length, 0);
  assert.equal(all(env, "SELECT COUNT(*) n FROM weekly_insights")[0].n, 0);
});

test("an old week is never sent as backlog", async () => {
  const env = await world();
  await weeklyInsightsEmailPass(env, NEXT); // the week of 2026-11-02 is past and the new one has no snapshot yet
  assert.equal(weekly(env).length, 0);
  // Queued for a week that is no longer the latest: not claimed.
  await weeklyInsightsEmailPass(env, TS);
  await weeklyInsightsPass(env, NEXT);
  assert.equal(weekly(env).filter(r => r.entity_id === WEEK).length, 2);
  const got = await claims(env);
  assert.equal(got.filter(c => c.subject.includes(WEEK)).length, 0);
});

test("a recipient removed, or the revision changed, after queueing: not claimed", async () => {
  const env = await world();
  await weeklyInsightsEmailPass(env, TS);
  configure(env, { recipients: ["team@example.test"] }); // same revision, ops removed
  assert.deepEqual((await claims(env)).map(c => c.to), ["team@example.test"]);
  const env2 = await world();
  await weeklyInsightsEmailPass(env2, TS);
  configure(env2, { recipients: TEAM, revision: 2 });
  assert.equal(await claimForHermes(env2), null);
  // The new revision does not send the week again: one per week and recipient.
  await weeklyInsightsEmailPass(env2, LATER);
  assert.equal(weekly(env2).filter(r => r.status === "queued" || r.status === "sending").length, 0);
});

test("the snapshot changed after queueing: not claimed", async () => {
  const env = await world();
  await weeklyInsightsEmailPass(env, TS);
  run(env, "UPDATE weekly_insights SET generated_at = '2026-11-09T09:00:00.000Z'");
  assert.equal(await claimForHermes(env), null);
});

test("switch off: nothing is queued and nothing queued is claimed", async () => {
  const env = await world({ on: false });
  await weeklyInsightsEmailPass(env, TS);
  assert.equal(weekly(env).length, 0);
  env.AUT22_WEEKLY_EMAIL_READY = "1";
  await weeklyInsightsEmailPass(env, TS);
  assert.equal(weekly(env).length, 2);
  env.AUT22_WEEKLY_EMAIL_READY = "0";
  assert.equal(await claimForHermes(env), null);
});

test("email off, team summary off or no approval: nothing is queued", async () => {
  for (const over of [{ enabled: false }, { summary: false }, { approved_at: null }, { recipients: [] }]) {
    const env = await world(over);
    await weeklyInsightsEmailPass(env, TS);
    assert.equal(weekly(env).length, 0, JSON.stringify(over));
  }
  const env = await world({ summary: true });
  await weeklyInsightsEmailPass(env, TS);
  configure(env, { recipients: TEAM, summary: false });
  assert.equal(await claimForHermes(env), null, "the team summary switched off after queueing");
});

test("pause: queued but not claimed until resumed", async () => {
  const env = await world();
  await weeklyInsightsEmailPass(env, TS);
  run(env, "INSERT INTO app_settings VALUES ('outbound','{\"paused\":true}',?, 'admin')", TS);
  assert.equal(await claimForHermes(env), null);
  assert.equal(weekly(env).filter(r => r.status === "queued").length, 2);
  run(env, "DELETE FROM app_settings WHERE key = 'outbound'");
  assert.equal((await claims(env)).length, 2);
});

test("the owner of a property is never a recipient", async () => {
  // A landlord and an owner in Advertisers whose addresses were typed into the team list.
  const env = await world();
  run(env, "INSERT INTO landlords(name,email,created_at,updated_at) VALUES('Owner fixture',' Ops@Example.test ',?,?)", TS, TS);
  await weeklyInsightsEmailPass(env, TS);
  assert.deepEqual(weekly(env).map(r => r.recipient), ["team@example.test"]);
  const env2 = await world();
  await weeklyInsightsEmailPass(env2, TS);
  run(env2, `INSERT INTO advertisers(name,kind,details,activity_on,created_at,updated_at,updated_by)
    VALUES('Seller fixture','individual',?,?,?,?,'admin@example.test')`,
  JSON.stringify({ contacts: [{ email: "TEAM@example.test" }] }), WEEK, TS, TS);
  assert.deepEqual((await claims(env2)).map(c => c.to), ["ops@example.test"], "an owner added after queueing is not claimed");
});

test("the website and the clock carry the same AUT22_WEEKLY_EMAIL_READY, off", () => {
  const flag = file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").match(/^AUT22_WEEKLY_EMAIL_READY = "(.*)"$/m)?.[1];
  assert.equal(flag("wrangler.toml"), "0");
  assert.equal(flag("jobs/wrangler.toml"), "0");
});

test("the clock's tick makes the week's snapshot and queues its emails only while switched on", async t => {
  t.mock.method(console, "log", () => {});
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-09T12:00:00.000Z") });
  for (const on of [true, false]) {
    const env = await world({ on, snapshot: false });
    await worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() }, env, { waitUntil() {} });
    assert.equal(all(env, "SELECT COUNT(*) n FROM weekly_insights")[0].n, 1);
    assert.equal(weekly(env).length, on ? 2 : 0, `switch ${on ? "on" : "off"}`);
  }
});

test("an email left unknown is not queued or claimed again", async () => {
  const env = await world();
  await weeklyInsightsEmailPass(env, TS);
  run(env, "UPDATE outbound SET status = 'unknown' WHERE template = 'weekly_insights'");
  await weeklyInsightsEmailPass(env, LATER);
  assert.equal(weekly(env).length, 2);
  assert.equal(await claimForHermes(env), null);
});

// D1 refuses an expression deeper than 100 (makeDb: 90). With every switch of wrangler.toml on, the claim carries this
// check in its CASE and still fits.
test("the carrier's claim with every switch on carries the weekly check and fits D1's depth", async () => {
  const toml = readFileSync(new URL("../../wrangler.toml", import.meta.url), "utf8");
  const vars = Object.fromEntries([...toml.slice(toml.indexOf("[vars]"), toml.indexOf("\n[", toml.indexOf("[vars]") + 1))
    .matchAll(/^([A-Z0-9_]+)\s*=\s*"([^"]*)"/gm)].map(m => [m[1], /_READY$/.test(m[1]) ? "1" : m[2]]));
  const env = await world(), db = env.DB, seen = [];
  await weeklyInsightsEmailPass(env, TS);
  const every = { ...vars, DB: { ...db, prepare: sql => { seen.push(sql); return db.prepare(sql); } } };
  const c = await claimForHermes(every);
  assert.ok(c?.subject.includes(WEEK), "a weekly email is claimed with every switch on");
  assert.ok(seen.find(sql => sql.startsWith("UPDATE outbound SET status='sending'"))
    .includes("WHEN 'weekly_insights' THEN (EXISTS (SELECT 1 FROM weekly_insights wi"));
});

// Run against a local fixture server: PW=... CHROME=... BASE=http://localhost:8789/ E2E_PERSIST=<local> node tests/reg11-review-e2e.cjs
const { chromium } = require(process.env.PW || "playwright-core");
const { readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const BASE = process.env.BASE || "http://localhost:8789/";
const persist = process.env.E2E_PERSIST || ".wrangler/e2e";
const secret = readFileSync(process.env.E2E_VARS || ".dev.vars", "utf8").match(/^SESSION_SECRET=(.+)$/m)[1].trim();
const d1 = sql => execFileSync("npx", ["wrangler", "d1", "execute", "hampton", "--local", "--persist-to", persist,
  "--json", "--command", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

(async () => {
  const { signSession, COOKIE } = await import("../server/auth.js");
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies([{ name: COOKIE, value: await signSession("admin@example.test", secret),
      domain: new URL(BASE).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Strict" }]);
    const page = await context.newPage();
    await page.goto(BASE + "admin/");
    for (const status of ["unknown", "not_applicable"]) {
      const created = await page.evaluate(async ({ status, run }) => {
        const r = await fetch("/api/admin/applicants", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Review Fixture", email: `review-${status}-${run}@example.test`, source: "phone",
            operation: "rent", household_adults: 2, household_children: 2 }) });
        return { status: r.status, data: await r.json() };
      }, { status, run: process.pid });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      const id = Number(created.data.id);
      d1(`INSERT INTO events (at,actor,entity_type,entity_id,type,data)
        SELECT '2026-11-07T12:00:00.000Z','public','contact',CAST(contact_id AS TEXT),'applicant.duplicate_submitted',
        '{"operation":"rent","household_children_status":"${status}"}' FROM applicants WHERE id=${id};
        INSERT INTO notifications (event_id,category,title,action_required,created_at)
        VALUES (last_insert_rowid(),'new_applicant','Review fixture',1,'2026-11-07T12:00:00.000Z');`);
      await page.goto(BASE + `admin/#/applicants/${id}`);
      await page.getByRole("button", { name: "Copy fields" }).click();
      assert.equal(await page.locator("#a-household_children_status").inputValue(), status);
      assert.match(await page.getByText("Total occupants:").innerText(), /Not yet confirmed/);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("Changes saved.", { exact: true }).waitFor();
      await page.reload();
      await page.locator("#a-household_children_status").waitFor();
      assert.equal(await page.locator("#a-household_children_status").inputValue(), status);
      assert.match(await page.getByText("Total occupants:").innerText(), /Not yet confirmed/);
      const saved = await page.evaluate(async id => (await (await fetch(`/api/admin/applicants/${id}`)).json()).applicant, id);
      assert.equal(saved.household_children, null);
      assert.equal(saved.household_total, null);
    }
    const commercial = await page.evaluate(async run => {
      const r = await fetch("/api/admin/applicants", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `Review Commercial ${run}`, email: `review-commercial-${run}@example.test`,
          source: "phone", operation: "buy", search_category: "commercial", commercial_kind: "property" }) });
      return { status: r.status, data: await r.json() };
    }, process.pid);
    assert.equal(commercial.status, 201);
    await page.goto(BASE + "admin/#/sales");
    await page.getByRole("button", { name: "Record offer", exact: true }).click();
    await page.getByLabel("Buyer", { exact: true }).fill(`Review Commercial ${process.pid}`);
    await page.getByText(/No To Buy search matches/).waitFor();
    assert.equal(await page.getByRole("radio", { name: new RegExp(`Review Commercial ${process.pid}`) }).count(), 0);
    console.log("REG-11 duplicate household and sales UI: OK");
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

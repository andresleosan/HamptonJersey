// End-to-end check against `wrangler pages dev` with the fixture database (see Task 13 of the plan).
// The seed's viewing dates are relative to today, so reseed before each run: delete .wrangler/e2e/v3/d1, then
//   npx wrangler d1 migrations apply hampton --local --persist-to .wrangler/e2e
//   npx wrangler d1 execute hampton --local --persist-to .wrangler/e2e --file tests/fixtures/seed.sql
//   npx wrangler pages dev --port 8788 --persist-to .wrangler/e2e     (terminal A)
//   PW=<playwright-core> CHROME=<chrome> node tests/e2e.cjs [screenshot-dir]   (terminal B)
// Matterport is never contacted: its requests are aborted.
const {chromium} = require(process.env.PW || "playwright-core");
const assert = require("node:assert/strict");
const {execFileSync} = require("node:child_process");
const {readFileSync} = require("node:fs");
const BASE = process.env.BASE || "http://localhost:8788/";
const SHOTS = process.argv[2];
const shot = (page, name) => SHOTS && page.screenshot({path: `${SHOTS}/${name}.png`, fullPage: true});
const secret = readFileSync(".dev.vars", "utf8").match(/^SESSION_SECRET=(.+)$/m)[1].trim();
const d1 = sql => execFileSync("npx", ["wrangler", "d1", "execute", "hampton", "--local", "--persist-to", ".wrangler/e2e", "--json", "--command", sql], {encoding: "utf8"});

async function newPage(ctx, viewport) {
  const page = await ctx.newPage();
  await page.setViewportSize(viewport);
  page.errors = [];
  page.on("pageerror", e => page.errors.push(e.message));
  page.on("console", m => m.type() === "error" && !/Failed to load resource|turnstile|challenges/i.test(m.text()) && page.errors.push(m.text()));
  await page.route(/matterport\.com/, r => r.abort());
  return page;
}

async function publicSite(browser) {
  const ctx = await browser.newContext();
  const page = await newPage(ctx, {width: 1280, height: 800});
  // Spec §1: the counter carries no cookies, even when the browser has one for the site (e.g. staff signed in).
  await ctx.addCookies([{name: "probe", value: "1", url: BASE}]);
  const stats = [], statsCookies = [];
  page.on("request", r => r.url().endsWith("/api/stats") && stats.push(r.postDataJSON()) && statsCookies.push(r.allHeaders().then(h => h.cookie)));
  await page.goto(BASE);
  await page.waitForSelector("#grid .card");
  await shot(page, "home");
  assert.equal(await page.getAttribute("footer a.staff", "href"), "/admin/", "discreet staff link in the footer");
  const body = await page.textContent("body");
  for (const word of ["Demo", "demo", "Illustrative", "snapshot", "Matterport sample"]) assert.ok(!body.includes(word), `no "${word}" on the public site`);
  const hrefs = await page.$$eval("#grid .card", cs => cs.map(c => c.getAttribute("href")));
  assert.ok(!hrefs.includes("#/p/HE-R003"), "drafts are not public");
  // Few listings: a showcase home (hero presents one property, every card shown, no search or filters).
  assert.deepEqual([...hrefs].sort(), ["#/p/HE-C001", "#/p/HE-R001", "#/p/HE-R002", "#/p/HE-R018"]);
  assert.match(await page.textContent('#grid .card[href="#/p/HE-R002"] .price'), /£1,900 pcm/);
  assert.equal(await page.$("#quick"), null, "no search form with few listings");
  assert.equal(await page.$("#tabs-region"), null, "no filter tabs with few listings");
  assert.match(await page.textContent(".hero h1"), /Le Bernage/);
  assert.equal(await page.$$eval(".dots button", d => d.length), 4, "one dot per listing in the hero carousel");
  await page.click('.dots [data-slide="1"]');
  assert.doesNotMatch(await page.textContent(".hero h1"), /Le Bernage/, "dots change the hero listing");
  await page.click('.dots [data-slide="0"]');
  await page.click("#hero-book");
  assert.equal(await page.inputValue("#book-slot select[name=prop]"), "HE-R001", "hero booking preselects the property");
  // 3D tour beside the booking form: a poster until the visitor reaches it, then it plays by itself with wheel zoom off.
  assert.equal(await page.$("#tour3d iframe"), null, "the tour does not load before it is reached");
  await page.$eval("#tour3d", el => el.scrollIntoView({block: "center"}));
  await page.waitForSelector("#tour3d iframe");
  assert.match(await page.getAttribute("#tour3d iframe", "src"), /my\.matterport\.com\/show\/\?m=JGPnGQ6hosj.*play=1.*wh=0/);
  await shot(page, "home-tour");

  // I3: opening a listing counts a view; the counter answers 204 whether it counts or not.
  const counted = page.waitForResponse(r => r.url().endsWith("/api/stats"));
  await page.goto(BASE + "#/p/HE-R001");
  await page.waitForSelector(".summary h1");
  assert.equal((await counted).status(), 204);
  assert.deepEqual(await page.$$eval(".media-tabs button", bs => bs.map(b => b.textContent)), ["Photos", "3D tour", "Aerial"]);
  assert.equal(await page.$$eval("#thumbs button", b => b.length), 2, "two public photos; external one hidden");
  assert.match(await page.getAttribute("#stage img", "src"), /\/media\/A00002$/, "M6: detail opens on the chosen cover");
  await page.click('#thumbs [data-i="1"]');
  assert.match(await page.getAttribute("#stage img", "src"), /\/media\/A00002$/);
  assert.equal(await page.getAttribute("#stage img", "alt"), "Kitchen");
  await page.click("[data-all]");
  assert.equal(await page.textContent("#lb-count"), "2 / 2", "full-screen viewer opens on the current photo");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.textContent("#lb-count"), "1 / 2");
  await page.keyboard.press("Escape");
  await page.click(".stage-nav.next");
  assert.match(await page.textContent("#stage-note"), /Photo 2 of 2/);
  await page.click("#tab-tour");
  assert.match(await page.getAttribute("#stage iframe", "src"), /my\.matterport\.com\/show\/\?m=TEST/);
  await page.click("#tab-aerial");
  assert.match(await page.getAttribute("#stage img", "src"), /A00003/);
  assert.match(await page.textContent(".detail"), /Property details[\s\S]*Oil-fired[\s\S]*Floor plans/);
  assert.ok(await page.$("#calc"));
  assert.equal((await page.request.get(BASE + "media/A00005")).status(), 404, "external photo is private");
  assert.equal((await page.request.get(BASE + "media/A00009")).status(), 404, "draft photo is private");
  // Back home and to the same listing without reloading: no second view.
  await page.goto(BASE + "#/");
  await page.goto(BASE + "#/p/HE-R001");
  await page.waitForSelector(".summary h1");
  await page.goto(BASE + "#/p/HE-R003");
  await page.waitForFunction(() => location.hash === "#/");

  // Booking on real slots (C13); the Turnstile test key passes automatically. Trinity rental's agent is Joshua.
  await page.goto(BASE + "#/p/HE-R002");
  const token = () => page.waitForFunction(() => document.querySelector('#detail-slot [name="cf-turnstile-response"]')?.value
    && !document.querySelector("#detail-slot button[type=submit]").disabled, null, {timeout: 20000});
  await page.waitForSelector("#detail-slot [name=time]:checked");
  await token();
  const chosen = () => page.$eval("#detail-slot form", f => Object.fromEntries(["negotiator", "date", "time"].map(n => [n, f.querySelector(`[name=${n}]:checked`)?.value ?? null])));
  const first = await chosen();
  assert.equal(await page.$eval("#detail-slot [name=negotiator]:checked", r => r.dataset.name), "Joshua Franco", "the listing's agent is preselected");
  assert.ok(first.date && first.time, "the first free day and time are chosen");
  await page.fill("#detail-slot input[name=name]", "Jane Le Brocq");
  await page.fill("#detail-slot input[name=email]", "jane@example.je");
  // Someone else takes that time before Jane sends: 409, her details stay, the time shows as booked and none is chosen.
  d1(`INSERT INTO viewing_requests (kind, date, time, end_time, name, email, status, created_at, negotiator_id)
    VALUES ('In person', '${first.date}', '${first.time}', substr(time('${first.time}', '+30 minutes'), 1, 5), 'Quick Racer',
      'racer@example.je', 'requested', '2026-10-23T00:00:00.000Z', ${first.negotiator})`);
  await page.click("#detail-slot button[type=submit]");
  await page.waitForSelector("#detail-slot .form-status >> text=That time was just booked");
  assert.equal(await page.inputValue("#detail-slot input[name=name]"), "Jane Le Brocq");
  assert.equal(await page.getAttribute(`#detail-slot [name=time][value="${first.time}"]`, "aria-label"), `${first.time}, booked`);
  assert.equal((await chosen()).time, null);
  await page.click("#detail-slot [name=time]:not(:disabled) + span");
  const second = await chosen();
  await token();
  await page.click("#detail-slot button[type=submit]");
  await page.waitForSelector("#detail-slot .confirm");
  assert.match(await page.textContent("#detail-slot .confirm"), /Request received[\s\S]*Joshua Franco will contact you[\s\S]*Trinity rental/);
  assert.deepEqual(JSON.parse(d1("SELECT listing_id, negotiator_id, date, time FROM viewing_requests WHERE name = 'Jane Le Brocq'"))[0].results,
    [{listing_id: "HE-R002", negotiator_id: +second.negotiator, date: second.date, time: second.time}]);
  // Booking another: the time Jane asked for shows as booked, with no one's details.
  await page.click("#detail-slot [data-again]");
  await page.click(`#detail-slot [name=date][value="${second.date}"] + span`);
  await page.waitForSelector(`#detail-slot [name=time][value="${second.time}"][aria-label="${second.time}, booked"]:disabled`);
  assert.deepEqual(stats, [{listing_id: "HE-R001", metric: "view"}, {listing_id: "HE-R001", metric: "photos"},
    {listing_id: "HE-R001", metric: "tour"}, {listing_id: "HE-R002", metric: "view"}], "once per listing and metric");
  assert.deepEqual(await Promise.all(statsCookies), [undefined, undefined, undefined, undefined], "no cookies on the counter");
  assert.deepEqual(page.errors, []);

  // The counter failing (network down or a 500) never breaks the listing or leaves an uncaught error.
  for (const [fail, done] of [[r => r.abort(), "requestfailed"], [r => r.fulfill({status: 500}), "response"]]) {
    const off = await newPage(ctx, {width: 1280, height: 800});
    await off.route(/\/api\/stats$/, fail);
    const settled = off.waitForEvent(done, r => r.url().endsWith("/api/stats"));
    await off.goto(BASE + "#/p/HE-R001");
    await off.waitForSelector(".summary h1");
    await settled;
    await off.evaluate(() => new Promise(r => setTimeout(r)));
    assert.deepEqual(off.errors, [], done);
    await off.close();
  }

  // M5: Turnstile blocked (content blocker) → the form offers the phone instead of a dead end.
  const blocked = await newPage(ctx, {width: 1280, height: 800});
  await blocked.route(/challenges\.cloudflare\.com/, r => r.abort());
  await blocked.goto(BASE + "#/p/HE-R002");
  await blocked.waitForSelector("#detail-slot >> text=01534 727582", {timeout: 15000});
  await blocked.close();

  const m = await newPage(ctx, {width: 390, height: 844});
  await m.goto(BASE + "#/p/HE-R001");
  await m.waitForSelector(".summary h1");
  assert.equal(await m.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, "no horizontal scroll on mobile");
  await shot(m, "detail-mobile");
  await ctx.close();
}

async function admin(browser) {
  const {signSession, COOKIE} = await import("../server/auth.js");
  const ctx = await browser.newContext();
  const page = await newPage(ctx, {width: 1280, height: 900});
  await page.goto(BASE + "admin/");
  await page.waitForSelector("text=Sign in with Google");
  assert.equal(await page.getAttribute(".login a.home", "href"), "/", "login screen links back to the public site");
  await ctx.addCookies([{name: COOKIE, value: await signSession("luismadef45@gmail.com", secret), domain: new URL(BASE).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Strict"}]);
  await page.reload();
  await page.waitForSelector("#t-inbox");
  assert.equal(await page.getAttribute("header.bar a.home", "href"), "/", "panel header links back to the public site");
  await page.goto(BASE + "admin/#/listings");
  await page.waitForSelector("#t-props");
  assert.match(await page.textContent(".seg"), /Published4[\s\S]*Drafts5/);
  await shot(page, "admin-list");

  await page.click('a[href="#/p/HE-R001"]');
  await page.waitForSelector("#f-title");
  assert.ok(await page.isVisible("text=Private · reference"));
  await page.fill("#f-title", "Le Bernage (edited)");
  // Review focus 2: session lost mid-edit → login dialog, typed text kept.
  await ctx.clearCookies();
  await page.getByRole("button", {name: "Save", exact: true}).click();
  await page.waitForSelector('[role=dialog] >> text=Your session has expired');
  assert.equal(await page.inputValue("#f-title"), "Le Bernage (edited)");
  // M11: focus moves into the dialog and the page behind it is inert.
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "Sign in with Google");
  assert.equal(await page.getAttribute("main.page", "inert"), "");
  // Signing in again needs Google; simulate it with a fresh cookie and a reload.
  await ctx.addCookies([{name: COOKIE, value: await signSession("luismadef45@gmail.com", secret), domain: new URL(BASE).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Strict"}]);
  await page.reload();
  await page.waitForSelector("#f-title");
  await page.fill("#f-title", "Le Bernage (edited)");
  await page.getByRole("button", {name: "Save", exact: true}).click();
  await page.waitForSelector("text=Changes saved.");
  const pub = await (await page.request.get(BASE + "api/listings")).json();
  assert.equal(pub.find(p => p.id === "HE-R001").title, "Le Bernage (edited)");
  // One Save for a field and a photo change: the photo save must carry the fresh updated_at (no false 409).
  await page.locator(".media-grid li").nth(1).getByLabel("Visible on the website").uncheck();
  await page.fill("#f-title", "Le Bernage");
  await page.getByRole("button", {name: "Save", exact: true}).click();
  await page.waitForSelector("text=Changes saved.");
  assert.equal(await page.$(".actionbar .unsaved"), null, "nothing left unsaved");
  // Discard puts back both the fields and the photos.
  await page.fill("#f-title", "Typing");
  await page.locator(".media-grid li").nth(1).getByLabel("Visible on the website").check();
  await page.getByRole("button", {name: "Discard", exact: true}).click();
  assert.equal(await page.inputValue("#f-title"), "Le Bernage");
  assert.ok(!(await page.locator(".media-grid li").nth(1).getByLabel("Visible on the website").isChecked()));

  // Review focus 1: a published listing with no public photo warns.
  await page.goto(BASE + "admin/#/p/HE-C001");
  await page.waitForSelector("#f-title");
  await page.uncheck(".media-grid li >> text=Visible on the website");
  await page.getByRole("button", {name: "Save", exact: true}).click();
  await page.waitForSelector("text=Changes saved.");
  await page.reload();
  await page.waitForSelector("text=no public photo");
  // M1: publishing it says it will NOT show, and the table marks it.
  await page.getByRole("button", {name: "Unpublish", exact: true}).click();
  await page.waitForSelector("text=Unpublished");
  await page.getByRole("button", {name: "Publish", exact: true}).click();
  await page.waitForSelector("text=won't appear on the website");
  await page.goto(BASE + "admin/#/listings");
  await page.waitForSelector('tr:has-text("HE-C001") >> text=no photo');

  await page.goto(BASE + "admin/#/p/HE-R002");
  await page.waitForSelector("#f-title");
  page.once("dialog", d => d.accept());
  await page.getByRole("button", {name: "Archive", exact: true}).click();
  await page.waitForSelector("text=Archived.");
  // M2: Restaurar can't silently drop typed edits; "Salir" asks first.
  await page.fill("#f-title", "Trinity rental (typing)");
  assert.ok(await page.getByRole("button", {name: "Restore", exact: true}).isDisabled());
  page.once("dialog", d => d.dismiss());
  await page.getByRole("button", {name: "Sign out", exact: true}).click();
  assert.equal(await page.inputValue("#f-title"), "Trinity rental (typing)", "still in the editor after cancelling Salir");
  await page.fill("#f-title", "Trinity rental");
  const after = await (await page.request.get(BASE + "api/listings")).json();
  assert.ok(!after.some(p => p.id === "HE-R002"), "archived listing leaves the public site");
  await page.getByRole("button", {name: "Restore", exact: true}).click();
  await page.waitForSelector("text=Restored as a draft.");

  // Featured: the star in the table puts a listing in the home page's Featured section.
  await page.goto(BASE + "admin/#/listings");
  await page.click('tr:has-text("HE-R018") .star');
  await page.waitForSelector('tr:has-text("HE-R018") .star[aria-pressed=true]');
  const fresh = async () => { const c = await browser.newContext(); const p = await c.newPage(); await p.goto(BASE); await p.waitForSelector("#grid .card"); return [c, p]; };
  let [hc, home] = await fresh();
  assert.deepEqual(await home.$$eval(".feature h2", h => h.map(x => x.textContent)), ["Pathfield Road"], "only starred listings get a Featured block");
  await hc.close();

  // Table: the visibility switch publishes/hides and the star adds a Featured block, without opening the editor.
  await page.goto(BASE + "admin/#/listings");
  await page.getByRole("group", {name: "Status"}).getByRole("button", {name: /^All/}).click();
  await page.click('tr:has-text("HE-R003") .switch');
  await page.waitForSelector('tr:has-text("HE-R003") .switch[aria-checked=true]');
  await page.click('tr:has-text("HE-R003") .switch');
  await page.waitForSelector('tr:has-text("HE-R003") .switch[aria-checked=false]');
  await page.click('tr:has-text("HE-R001") .star');
  await page.waitForSelector('tr:has-text("HE-R001") .star[aria-pressed=true]');
  assert.equal(await page.textContent('tr:has-text("HE-R001") .star-no'), "2", "a new star goes last in the Featured section");
  [hc, home] = await fresh();
  assert.equal(await home.$$eval(".feature", f => f.length), 2, "two stars, two Featured blocks");
  await hc.close();
  await page.click('tr:has-text("HE-R001") .star');
  await page.waitForSelector('tr:has-text("HE-R001") .star[aria-pressed=false]');
  // Drag a row to the top of Published: the home page follows that order.
  await page.getByRole("group", {name: "Status"}).getByRole("button", {name: /^Published/}).click();
  await page.dragAndDrop('tr:has-text("HE-R018")', "tbody tr:first-child");
  await page.waitForSelector("text=Order saved.");
  assert.match(await page.textContent("tbody tr:first-child"), /HE-R018/);
  [hc, home] = await fresh();
  assert.equal(await home.getAttribute("#grid .card", "href"), "#/p/HE-R018", "home follows the panel order");
  assert.match(await home.textContent(".hero h1"), /Pathfield/, "and the carousel starts with it");
  await hc.close();
  await page.click('tr:has-text("HE-R018") [aria-label^="Move"][aria-label$="down"]');
  await page.waitForSelector("text=Order saved.");
  assert.doesNotMatch(await page.textContent("tbody tr:first-child"), /HE-R018/, "keyboard arrows move rows too");

  await page.goto(BASE + "admin/#/viewings");
  await page.waitForSelector("text=Tom Renouf");
  // Requests, oldest first: the seed's request (Tom Renouf) opens in the detail pane. Typed notes go with Confirm.
  await page.click('.inbox-list button:has-text("Tom Renouf")');
  await page.fill("#v-notes", "Called, prefers Saturday");
  await page.getByRole("button", {name: "Confirm", exact: true}).click();
  await page.waitForSelector("text=Confirmed. It's in Upcoming now.");
  await page.waitForFunction(() => !document.querySelector(".inbox-list")?.textContent.includes("Tom Renouf"));
  await page.getByRole("group", {name: "Viewings"}).getByRole("button", {name: /^Upcoming/}).click();
  await page.waitForSelector('.inbox-list >> text=Tom Renouf');
  await page.click('.inbox-list button:has-text("Tom Renouf")');
  assert.equal(await page.inputValue("#v-notes"), "Called, prefers Saturday", "notes are kept");
  assert.match(await page.textContent(".inbox-detail .badge"), /Confirmed/);
  await shot(page, "admin-inbox");
  // 3D tours: add one from a YouTube share link, hide the sample; the home page follows.
  await page.goto(BASE + "admin/#/tours");
  await page.waitForSelector("text=Sample 3D tour");
  await page.getByRole("button", {name: "Add tour", exact: true}).first().click();
  await page.fill("#tt-new", "Le Bernage walkthrough");
  await page.fill("#tu-new", "https://evil.example/x");
  await page.click("form.new button:has-text('Add tour')");
  await page.waitForSelector(".err:has-text(\"Link: paste\")");
  await page.fill("#tu-new", "https://youtu.be/dQw4w9WgXcQ");
  await page.click("form.new button:has-text('Add tour')");
  await page.waitForSelector("text=Tour added.");
  await page.click('[role=switch][aria-label="Visible on the website: Sample 3D tour"]');
  await page.waitForSelector("text=Tour hidden.");
  await shot(page, "admin-tours");
  [hc, home] = await fresh();
  await home.waitForSelector("#tour3d");
  await home.$eval("#tour3d", el => el.scrollIntoView({block: "center"}));
  await home.waitForSelector("#tour3d iframe");
  assert.match(await home.getAttribute("#tour3d iframe", "src"), /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1&mute=1/, "home shows only the visible tour");
  await hc.close();
  // F7-A Insights. The seed's website opens are a day and forty days old and this run's are today's, so 30 days holds
  // the first and the last, 90 days all of them (the -20 days bound keeps clear of the UTC/Jersey date edge).
  const views = where => JSON.parse(d1(`SELECT COALESCE(SUM(n), 0) AS n FROM daily_stats WHERE metric = 'view'${where}`))[0].results[0].n;
  const recent = " AND day >= date('now','-20 day')", views30 = views(recent), views90 = views("");
  const r001 = views(`${recent} AND listing_id = 'HE-R001'`);
  assert.ok(r001 > 12 && views90 > views30, "this run's views are on top of the seed's");
  const figure = label => page.$$eval(".figures div", (ds, l) => ds.find(d => d.querySelector("dt").textContent === l)?.querySelector("dd").textContent, label);
  const rows = within => within.locator("tbody tr").evaluateAll(rs => rs.map(r => [...r.cells].map(c => c.textContent)));
  const table = name => page.getByRole("table", {name, exact: true}), byListing = page.getByRole("region", {name: "Views by listing"});
  await page.goto(BASE + "admin/#/insights");
  await page.waitForSelector(".figures");
  await page.evaluate(() => document.fonts.ready);
  const bar = await page.$$eval("header.bar > :not(.who), header.bar nav a", es => es.map(e => [e.textContent, Math.round(e.getBoundingClientRect().top + e.offsetHeight / 2)]));
  assert.ok(bar.findIndex(([t]) => t === "Insights") === bar.findIndex(([t]) => t === "Viewings") + 1, "Insights comes after Viewings");
  assert.ok(Math.max(...bar.map(([, y]) => y)) - Math.min(...bar.map(([, y]) => y)) < 8, "the bar stays on one line at 1280px");
  assert.equal(await page.textContent(".seg button[aria-pressed=true]"), "30 days", "30 days by default");
  assert.equal(await figure("Listing views"), views30.toLocaleString("en-GB"));
  for (const l of ["Viewing requests", "New applicants", "Viewings completed"]) assert.match(await figure(l), /^\d[\d,]*$/, l);
  // Unmet demand: Sarah and Claire both want St Helier to rent; Tom wants St Brelade to buy.
  assert.equal((await rows(table("Rent"))).find(r => r[0] === "St Helier")?.[1], "2");
  assert.equal((await rows(table("Buy"))).find(r => r[0] === "St Brelade")?.[1], "1");
  // Most viewed: Le Bernage with the seed's views and those opened earlier in this run.
  const viewed = await rows(byListing);
  assert.equal(viewed.find(r => r[0].includes("HE-R001"))?.[1], String(r001));
  assert.equal(await byListing.locator('a[href="#/p/HE-R001"]').count(), 1, "the listing links to its editor");
  await shot(page, "admin-insights");
  await page.getByRole("button", {name: "90 days", exact: true}).click();
  await page.waitForFunction(n => [...document.querySelectorAll(".figures div")].find(d => d.querySelector("dt").textContent === "Listing views")
    ?.querySelector("dd").textContent === n, views90.toLocaleString("en-GB"));
  assert.equal(await page.textContent(".seg button[aria-pressed=true]"), "90 days");
  await page.goto(BASE + "admin/#/users");
  await page.waitForSelector("text=andres.san1404@gmail.com");
  await shot(page, "admin-users");
  assert.deepEqual(page.errors, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME});
  try { await publicSite(browser); await admin(browser); console.log("e2e OK"); }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });

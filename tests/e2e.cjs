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
  assert.deepEqual([...hrefs].sort(), ["#/p/HE-C001", "#/p/HE-R001", "#/p/HE-R002", "#/p/HE-R018", "#/p/HE-R050"]);
  assert.match(await page.textContent('#grid .card[href="#/p/HE-R002"] .price'), /£1,900 pcm/);
  assert.equal(await page.$("#quick"), null, "no search form with few listings");
  assert.equal(await page.$("#tabs-region"), null, "no filter tabs with few listings");
  assert.match(await page.textContent(".hero h1"), /Le Bernage/);
  assert.equal(await page.$$eval(".dots button", d => d.length), 5, "one dot per listing in the hero carousel");
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
  const {jerseyToday} = await import("../server/viewings.js");
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
  assert.match(await page.textContent(".seg"), /Published5[\s\S]*Drafts5/);
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
  // The bar at its widest: two-digit counts on Inbox, Sales and Rentals (stubbed), still on one line at 1280px.
  const COUNTS = /\/api\/admin\/notifications\/counts$/;
  await page.route(COUNTS, r => r.fulfill({contentType: "application/json",
    body: JSON.stringify({action: 88, new_applicant: 0, viewing: 0, matched: 0, sales: 88, rentals: 88})}));
  await page.goto(BASE + "admin/#/insights");
  await page.reload();
  await page.waitForSelector(".figures");
  await page.waitForSelector('header.bar a[href="#/rentals"] .count');
  await page.evaluate(() => document.fonts.ready);
  const bar = await page.$$eval("header.bar > :not(.who), header.bar nav > a, header.bar nav button", es => es.map(e => [e.textContent, Math.round(e.getBoundingClientRect().top + e.offsetHeight / 2)]));
  const at = t => bar.findIndex(([x]) => x.startsWith(t));
  assert.ok(at("Sales") === at("Viewings") + 1 && at("Rentals") === at("Sales") + 1 && at("Insights") === at("Rentals") + 1,
    "Rentals comes between Sales and Insights");
  assert.ok(at("Settings") === at("Insights") + 1, "Settings ends the sections");
  assert.ok(Math.max(...bar.map(([, y]) => y)) - Math.min(...bar.map(([, y]) => y)) < 8, "the bar stays on one line at 1280px");
  await page.unroute(COUNTS);
  await page.reload();
  await page.waitForSelector(".figures");
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

  // F3-C Sales, on the flow's own listing (HE-R050) and buyer (Helen Picot). With no offers or sales yet, each block says so.
  const salesCount = () => page.$eval('header.bar a[href="#/sales"]', a => a.querySelector(".count")?.firstChild.textContent ?? null);
  const publicStatus = async () => {
    const c = await browser.newContext(), p = await c.newPage();
    await p.goto(BASE + "#/p/HE-R050");
    await p.waitForSelector(".summary h1");
    const t = await p.textContent(".summary .eyebrow");
    await c.close();
    return t;
  };
  // Phones: no page scroll sideways, with an offer and then a sale in progress; the tables scroll inside their box.
  const phone = await newPage(ctx, {width: 390, height: 844});
  const noSideScroll = async (url, sel) => {
    await phone.goto(url);
    await phone.waitForSelector(sel);
    await phone.reload();
    await phone.waitForSelector(sel);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `no horizontal scroll on ${url}`);
  };
  await page.goto(BASE + "admin/#/sales");
  await page.waitForSelector("#t-sales");
  await page.click(".closed summary"); // folded by default
  for (const t of ["No open offers", "No sales in progress", "No sales closed in the last 12 months"]) await page.waitForSelector(`text=${t}`);
  assert.equal(await figure("Fees completed this year"), "£0");
  await shot(page, "admin-sales-empty");
  const record = page.getByRole("button", {name: "Record offer", exact: true});
  await record.click();
  let dlg = page.getByRole("dialog", {name: "Record offer"});
  assert.ok(await dlg.evaluate(d => d.contains(document.activeElement)), "the focus moves into the dialog");
  await dlg.getByLabel("Listing").selectOption("HE-R050");
  await dlg.getByLabel("Buyer", {exact: true}).fill("picot");
  await dlg.getByRole("radio", {name: /Helen Picot/}).check();
  await dlg.getByLabel("Amount (£)").fill("820,000");
  await dlg.getByLabel("Conditions (optional)").fill("Subject to survey");
  await dlg.getByRole("button", {name: "Record offer", exact: true}).click();
  await page.waitForSelector("text=Offer recorded");
  assert.ok(await record.evaluate(b => b === document.activeElement), "the focus goes back to Record offer");
  await noSideScroll(BASE + "admin/#/sales", ".sales .offers");
  const offerRow = page.locator("tr", {hasText: "Helen Picot"});
  assert.match(await offerRow.textContent(), /£820,000[\s\S]*Subject to survey[\s\S]*Nothing to sell/);
  // Someone else closes the offer while the Counter dialog is open: the refusal stays in the dialog, the list behind is reloaded.
  await offerRow.locator("summary").click();
  await offerRow.getByRole("button", {name: "Counter"}).click();
  dlg = page.getByRole("dialog", {name: "Counter offer"});
  assert.equal(await dlg.getByLabel("Seller's counter (£)").inputValue(), "", "no counter yet");
  d1("UPDATE offers SET status = 'withdrawn' WHERE listing_id = 'HE-R050'");
  await dlg.getByLabel("Seller's counter (£)").fill("830000");
  await dlg.getByRole("button", {name: "Save counter"}).click();
  await dlg.getByText("This offer is no longer open").waitFor();
  await page.waitForSelector("text=No open offers");
  await dlg.getByRole("button", {name: "Cancel"}).click();
  d1("UPDATE offers SET status = 'pending' WHERE listing_id = 'HE-R050'");
  await page.reload();
  await offerRow.locator("summary").click();
  await offerRow.getByRole("button", {name: "Counter"}).click();
  dlg = page.getByRole("dialog", {name: "Counter offer"});
  await dlg.getByLabel("Seller's counter (£)").fill("835000");
  await dlg.getByRole("button", {name: "Save counter"}).click();
  await page.waitForSelector('tr:has-text("Helen Picot") >> text=Countered');
  await offerRow.getByRole("button", {name: /^Accept/}).click();
  await page.getByRole("dialog", {name: "Accept offer"}).getByRole("button", {name: "Accept offer"}).click();
  // Accepting opens the sale file; the website shows the listing under offer.
  await page.waitForSelector("#t-sale");
  const saleUrl = page.url();
  assert.equal(await page.inputValue("#s-price"), "835,000", "the price is the seller's counter");
  assert.match(await publicStatus(), /Under Offer/);
  // The listing's editor shows the sale in progress, linked to its file.
  await phone.goto(BASE + "admin/#/p/HE-R050");
  const inProgress = phone.getByRole("link", {name: "Sale in progress"});
  assert.equal(await inProgress.getAttribute("href"), saleUrl.slice(saleUrl.indexOf("#")));
  assert.equal(await phone.getByRole("link", {name: "0 open offers"}).getAttribute("href"), "#/sales");
  assert.match(await phone.locator("#s-offers tbody").textContent(), /Helen Picot£820,000Countered £835,000Accepted/);
  await page.fill("#s-buyer_lawyer_firm", "Ogier");
  await page.fill("#s-buyer_lawyer_name", "Anna Le Cornu");
  await page.fill("#s-fee", "16,000");
  await page.getByRole("button", {name: "Save", exact: true}).click();
  await page.waitForSelector("text=Changes saved.");
  const box = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return {top: r.top, left: r.left}; });
  assert.ok((await box(page, "#h-steps")).left > (await box(page, "#h-agreement")).left, "at 1280px the data is on the left, the steps on the right");
  await noSideScroll(BASE + "admin/#/sales", ".sales .figures");
  assert.equal(await phone.locator('.sales tbody a[href^="#/sales/"]').count(), 1, "the sale in progress is listed");
  await noSideScroll(saleUrl, "#t-sale");
  assert.ok((await box(phone, "#h-steps")).top < (await box(phone, "#h-agreement")).top, "on a phone the steps come before the sale's data");
  // A step planned for yesterday is overdue, here and in the bar's Sales count.
  const step = name => page.locator(".steps > li", {hasText: name});
  await step("Lawyers instructed").getByRole("button", {name: /^Update/}).click();
  await page.fill("#st-planned", new Date(Date.now() - 864e5).toISOString().slice(0, 10));
  await page.getByRole("button", {name: "Save step"}).click();
  await page.waitForSelector('.steps > li:has-text("Lawyers instructed") .step-state >> text=Overdue');
  await page.waitForFunction(() => document.querySelector('header.bar a[href="#/sales"] .count')?.firstChild.textContent === "1");
  await step("Passing contract (Royal Court)").getByRole("button", {name: /^Update/}).click();
  await page.getByRole("radio", {name: "Done"}).check();
  assert.equal(await page.getAttribute("#st-done", "max"), jerseyToday(), "a step is done today or earlier");
  await page.getByRole("button", {name: "Save step"}).click();
  await page.waitForSelector('.steps > li:has-text("Passing contract") .step-state >> text=Done');
  await shot(page, "admin-sale");
  page.once("dialog", d => d.accept());
  await page.getByRole("button", {name: "Mark completed", exact: true}).click();
  await page.waitForSelector("text=Sale completed.");
  await page.waitForFunction(() => document.activeElement?.id === "t-sale"); // the closing buttons are gone; the heading has the focus
  assert.match(await publicStatus(), /Sold/);
  await page.goto(BASE + "admin/#/sales");
  await page.waitForSelector(".sales .figures");
  assert.equal(await figure("Fees completed this year"), "£16,000");
  assert.equal(await salesCount(), null, "a completed sale's steps are not overdue");
  await shot(page, "admin-sales");
  await shot(phone, "admin-sale-mobile");
  // On the buyer's record: an Offers tab for To Buy searches only, with Helen's offer and her sale; Record offer opens in
  // Sales with her chosen, and the new offer shows in the tab, on the listing's editor and in her timeline.
  await page.goto(BASE + "admin/#/applicants/1/offers");
  await page.waitForSelector("#tab-requirements[aria-selected=true]"); // with no offers, its Offers hash falls back to Requirements
  assert.equal(await page.locator("#tab-offers").count(), 0, "a To Let search with no offers has no Offers tab");
  await page.goto(BASE + "admin/#/applicants/4/offers");
  const offersTab = page.locator("#panel-offers");
  await offersTab.locator('a[href^="#/sales/"]').waitFor();
  assert.equal(await offersTab.locator('a[href^="#/sales/"]').getAttribute("href"), saleUrl.slice(saleUrl.indexOf("#")));
  assert.match(await offersTab.textContent(), /Rozel Bay house[\s\S]*£820,000[\s\S]*£835,000[\s\S]*Accepted/);
  await offersTab.getByRole("link", {name: "Record offer"}).click();
  dlg = page.getByRole("dialog", {name: "Record offer"});
  await dlg.getByRole("radio", {name: /Helen Picot/, checked: true}).waitFor();
  assert.equal(new URL(page.url()).hash, "#/sales", "the buyer is used once: a reload starts with no one chosen");
  await dlg.getByLabel("Listing").selectOption("HE-R006");
  await dlg.getByLabel("Amount (£)").fill("640000");
  await dlg.getByRole("button", {name: "Record offer", exact: true}).click();
  await page.waitForSelector("text=Offer recorded: £640,000 from Helen Picot");
  await page.goto(BASE + "admin/#/applicants/4/offers");
  await page.waitForSelector('#panel-offers tr:has-text("St Aubin family house") >> text=Pending');
  await shot(page, "admin-applicant-offers");
  await noSideScroll(BASE + "admin/#/applicants/4/offers", "#panel-offers table");
  await shot(phone, "admin-applicant-offers-mobile");
  await page.getByRole("tab", {name: "Timeline"}).click();
  for (const t of ["Offer recorded: £640,000 on St Aubin family house", "Offer accepted", "Listing marked Under offer", "Sale completed",
    "Listing marked Sold", "Step updated: Passing contract or completion"]) await page.locator("#panel-timeline strong", {hasText: t}).first().waitFor();
  await page.goto(BASE + "admin/#/p/HE-R006");
  await page.getByRole("link", {name: "1 open offer", exact: true}).waitFor();
  assert.equal(await page.getByRole("link", {name: "Sale in progress"}).count(), 0);
  // V5 on the real engine (workerd's SQLite, not the tests' double): two buyers' offers on one listing, both accepted at
  // once. Its own unpublished listing and buyers, added last, so nothing above changes.
  d1(`INSERT INTO listings (id, use, title, property_type, operation, availability, country, location, sale_price, currency, price_text,
    specs, published, matchable, created_at, updated_at, updated_by) VALUES ('HE-R060','residential','Grouville cottage','Cottage','sale',
    'for_sale','Jersey','Grouville',700000,'GBP','£700,000','[]',0,0,'2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z','import')`);
  const post = (path, body) => page.evaluate(([path, body]) => fetch(`/api${path}`, {method: "POST", headers: {"content-type": "application/json"},
    body: JSON.stringify(body)}).then(async r => ({status: r.status, data: await r.json()})), [path, body]);
  const racers = [];
  for (const [name, amount] of [["Paul Racine", 700000], ["Rose Racine", 705000]]) {
    const a = await post("/admin/applicants", {name, email: `${name.split(" ")[0].toLowerCase()}@example.je`, source: "phone", operation: "buy", budget_max: 900000});
    assert.equal(a.status, 201, JSON.stringify(a.data));
    const o = await post("/admin/offers", {listing_id: "HE-R060", applicant_id: a.data.id, amount});
    assert.equal(o.status, 201, JSON.stringify(o.data));
    racers.push({applicant: a.data.id, offer: o.data.offer.id});
  }
  const accepts = await page.evaluate(ids => Promise.all(ids.map(id => fetch(`/api/admin/offers/${id}/accept`, {method: "POST",
    headers: {"content-type": "application/json"}, body: "{}"}).then(r => r.status))), racers.map(r => r.offer));
  assert.deepEqual([...accepts].sort(), [201, 409], "two accepts at once: one wins, the other is turned away");
  const race = () => JSON.parse(d1(`SELECT (SELECT COUNT(*) FROM sales WHERE listing_id = 'HE-R060') AS sales,
    (SELECT availability FROM listings WHERE id = 'HE-R060') AS availability,
    (SELECT group_concat(status, ',') FROM (SELECT status FROM offers WHERE listing_id = 'HE-R060' ORDER BY id)) AS offers`))[0].results[0];
  const loser = racers[accepts.indexOf(409)];
  assert.deepEqual(race(), {sales: 1, availability: "under_offer",
    offers: accepts.map(s => (s === 201 ? "accepted" : "pending")).join(",")}, "one sale, the listing under offer, the loser's offer untouched");
  // The turned-away buyer raises their offer: the new one replaces their open one, which the editor keeps in its history.
  assert.equal((await post("/admin/offers", {listing_id: "HE-R060", applicant_id: loser.applicant, amount: 720000})).status, 201);
  await page.goto(BASE + "admin/#/p/HE-R060");
  const history = page.locator("#s-offers tbody tr");
  await history.first().waitFor();
  assert.deepEqual(await history.evaluateAll(rs => rs.map(r => r.cells[2].textContent)),
    ["Pending", ...[...racers].reverse().map(r => (r === loser ? "WithdrawnSuperseded by a new offer" : "Accepted"))], "newest first");
  await page.locator("#s-offers").scrollIntoViewIfNeeded();
  if (SHOTS) await page.locator("#s-offers").screenshot({path: `${SHOTS}/admin-listing-offers.png`});
  await rentals(page, phone, noSideScroll);
  await property(page, phone, noSideScroll);
  await bankImport(page, phone, noSideScroll);
  assert.deepEqual(phone.errors, []);
  await phone.close();
  await page.goto(BASE + "admin/#/users");
  await page.waitForSelector("text=andres.san1404@gmail.com");
  await shot(page, "admin-users");
  assert.deepEqual(page.errors, []);
  await ctx.close();
}

// F5-A: the Settings menu, then Rentals on the seed (a tenant in arrears, an overdue gas check, a renewal and an
// unmatched deposit, so the bar's Rentals count starts at 4), and a new landlord with a new property.
async function rentals(page, phone, noSideScroll) {
  const settings = page.getByRole("button", {name: "Settings"}), menu = page.locator("#settings-menu");
  await page.goto(BASE + "admin/#/insights");
  await settings.focus();
  await page.keyboard.press("Enter");
  assert.equal(await settings.getAttribute("aria-expanded"), "true");
  assert.equal(await settings.getAttribute("aria-controls"), "settings-menu");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.textContent), "Availability", "Tab goes into the menu");
  await page.keyboard.press("Escape");
  assert.ok(await menu.isHidden(), "Escape closes the menu");
  assert.ok(await settings.evaluate(b => b === document.activeElement), "the focus goes back to Settings");
  await settings.click();
  await page.click("h1");
  assert.ok(await menu.isHidden(), "a click outside closes the menu");
  await settings.click();
  await menu.getByRole("link", {name: "Users"}).click();
  await page.waitForSelector("text=andres.san1404@gmail.com");
  assert.equal(await settings.getAttribute("aria-current"), "true", "Settings is marked while on a page inside it");
  assert.ok(await menu.isHidden());

  const count = () => page.$eval('header.bar a[href="#/rentals"]', a => a.querySelector(".count")?.firstChild.textContent ?? null);
  const waitCount = n => page.waitForFunction(n => document.querySelector('header.bar a[href="#/rentals"] .count')?.firstChild.textContent === n, n);
  const block = id => page.locator(`#${id}`).locator("..");
  await page.goto(BASE + "admin/#/rentals");
  await page.waitForSelector("#t-rentals");
  await waitCount("4");
  const arrears = block("h-arrears").locator("tr", {hasText: "James Vautier"});
  assert.match(await arrears.textContent(), /Rose Cottage[\s\S]*HE-T0001[\s\S]*£2,500\.00[\s\S]*\d+ days[\s\S]*Formal letter/);
  assert.match(await block("h-checks").locator("tr", {hasText: "Rose Cottage"}).textContent(), /Gas safety[\s\S]*Overdue/);
  assert.match(await block("h-renewals").textContent(), /Flat 2, 14 Bath Street[\s\S]*Sophie Martin[\s\S]*Renewal due/);
  assert.match(await block("h-repairs").textContent(), /No open repairs/);
  await shot(page, "admin-rentals");
  // Mark done: the step is recorded with its note, the tenancy leaves the block until the next step is due.
  await arrears.getByRole("button", {name: /^Mark done/}).click();
  let dlg = page.getByRole("dialog", {name: "Mark step done"});
  await dlg.getByLabel("Note (optional)").fill("Letter sent by post");
  await dlg.getByRole("button", {name: "Mark done"}).click();
  await page.waitForSelector("text=Formal letter marked done for James Vautier.");
  await block("h-arrears").getByText("No tenant needs an arrears step today.").waitFor();
  await waitCount("3");
  // Assign: the unmatched deposit goes to the let-only tenancy (rent can't, so its kind changes too).
  await block("h-unmatched").getByRole("button", {name: /^Assign/}).click();
  dlg = page.getByRole("dialog", {name: "Assign payment"});
  await dlg.getByLabel("Tenancy", {exact: true}).fill("martin");
  await dlg.getByRole("radio", {name: /Sophie Martin/}).check();
  assert.deepEqual(await dlg.getByLabel("Kind").locator("option").allTextContents(), ["Deposit", "Other"], "a let-only tenancy takes no rent");
  assert.equal(await dlg.getByLabel("Kind").inputValue(), "deposit");
  await dlg.getByRole("button", {name: "Assign payment"}).click();
  await page.waitForSelector("text=£1,900.00 assigned to Sophie Martin as a deposit.");
  await block("h-unmatched").getByText("Every payment is matched.").waitFor();
  await waitCount("2");
  // The list: search (after typing stops) and filters.
  const rows = page.locator("#rentals-list tbody tr");
  assert.equal(await rows.count(), 2);
  await page.getByLabel("Search").fill("he-t0002");
  await page.waitForFunction(() => document.querySelectorAll("#rentals-list tbody tr").length === 1);
  assert.match(await rows.textContent(), /Flat 2, 14 Bath Street[\s\S]*Peter Gallienne[\s\S]*Let only[\s\S]*Sophie Martin/);
  await page.getByLabel("Search").fill("");
  await page.waitForFunction(() => document.querySelectorAll("#rentals-list tbody tr").length === 2);
  await page.getByLabel("Show").selectOption("compliance");
  await page.waitForFunction(() => document.querySelectorAll("#rentals-list tbody tr").length === 1);
  assert.match(await rows.textContent(), /Rose Cottage[\s\S]*£2,500\.00[\s\S]*Checks due/);
  await page.getByLabel("Show").selectOption("");
  await noSideScroll(BASE + "admin/#/rentals", "#rentals-list");
  await shot(phone, "admin-rentals-mobile");

  // A new landlord, then a property for them: it joins the list with its checks not recorded yet (4 more in the count).
  await page.getByRole("button", {name: "New landlord"}).click();
  dlg = page.getByRole("dialog", {name: "New landlord"});
  await dlg.getByRole("button", {name: "Add landlord"}).click();
  await dlg.getByText("Enter a name").waitFor();
  await dlg.getByLabel("Name").fill("Clare Le Gresley");
  await dlg.getByLabel("Email").fill("clare.legresley@example.je");
  await dlg.getByLabel("Approval limit (£, optional)").fill("750");
  await dlg.getByRole("button", {name: "Add landlord"}).click();
  await page.waitForSelector("text=Landlord added: Clare Le Gresley.");
  await page.getByRole("link", {name: "Add a property for Clare Le Gresley"}).click();
  await page.waitForSelector("#t-new-rental");
  // The landlords load after the page: the new one is chosen once they're in.
  await page.waitForFunction(() => document.querySelector("#r-landlord option:checked")?.textContent === "Clare Le Gresley");
  await page.getByLabel("Address").fill("La Hougue Farm, La Rue de la Hougue");
  await page.getByLabel("Parish").selectOption("St Peter");
  await page.getByRole("radio", {name: "Full management"}).check();
  await page.getByRole("button", {name: "Add property"}).click();
  await page.getByText("Enter the management fee").waitFor();
  await page.getByLabel("Management fee (%)").fill("12.5");
  await noSideScroll(BASE + "admin/#/rentals/new", "#t-new-rental");
  await shot(phone, "admin-new-rental-mobile");
  await page.getByRole("button", {name: "Add property"}).click();
  await page.waitForSelector("text=Property added: La Hougue Farm, La Rue de la Hougue.");
  const added = rows.filter({hasText: "La Hougue Farm"});
  assert.match(await added.textContent(), /Clare Le Gresley[\s\S]*Full management[\s\S]*No tenancy[\s\S]*Checks due/);
  await waitCount("6");
  // The landlord's page: their details with the Save bar, and their properties.
  await added.getByRole("link", {name: "Clare Le Gresley"}).click();
  await page.waitForSelector("#t-landlord");
  await page.getByLabel("Phone").fill("07797 123456");
  await page.waitForSelector("text=Unsaved changes");
  await page.getByRole("button", {name: "Save", exact: true}).click();
  await page.waitForSelector("text=Changes saved.");
  assert.match(await page.locator("#landlord-rentals").textContent(), /La Hougue Farm[\s\S]*St Peter[\s\S]*Full management/);
  await shot(page, "admin-landlord");
  await noSideScroll(page.url(), "#t-landlord");
  // On a phone the Settings menu opens inside the screen.
  await phone.getByRole("button", {name: "Settings"}).click();
  const box = await phone.locator("#settings-menu").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390, "the menu fits a phone's width");
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await shot(phone, "admin-settings-mobile");
  assert.equal(await count(), "6");
}

// F5-A property page, on the seed after rentals(): James Vautier owes two months (the oldest one's Formal letter is done),
// Margaret Le Brun approves repairs above £500, and La Hougue Farm has no tenancy.
async function property(page, phone, noSideScroll) {
  const {addMonths} = await import("../server/rentals.js");
  const {jerseyToday} = await import("../server/viewings.js");
  const today = jerseyToday();
  const waitCount = n => page.waitForFunction(n => document.querySelector('header.bar a[href="#/rentals"] .count')?.firstChild.textContent === n, n);
  await page.goto(BASE + "admin/#/rentals");
  await page.locator("#rentals-list").getByRole("link", {name: "Rose Cottage, La Rue du Moulin"}).click();
  await page.waitForSelector("#t-rental");
  const t = page.locator("#tenancy-1"), late = t.locator(".late");
  await t.locator(".balance").waitFor();
  assert.match(await t.locator(".ref").textContent(), /HE-T0001/);
  assert.match(await t.locator(".balance").textContent(), /£2,500\.00/);
  assert.match(await late.textContent(), /\d+ days late[\s\S]*Formal letter done/);
  const daysLate = async () => Number((await late.textContent()).match(/(\d+) days late/)[1]);
  const before = await daysLate();
  await shot(page, "admin-rental");

  // A partial payment covers the oldest month: the balance goes down and the days late count from the next charge.
  await t.getByRole("button", {name: "Record payment"}).click();
  let dlg = page.getByRole("dialog", {name: "Record payment"});
  await dlg.getByLabel("Amount (£)").fill("1,250.00");
  await dlg.getByRole("button", {name: "Record payment"}).click();
  await page.waitForSelector("text=Payment of £1,250.00 recorded.");
  await t.locator(".balance", {hasText: "£1,250.00"}).waitFor();
  const after = await daysLate();
  assert.ok(after > 0 && after < before, `days late move to the next charge (${before} → ${after})`);
  assert.match(await late.textContent(), /Next step/);
  assert.match(await t.locator("#payments-1").textContent(), /£1,250\.00[\s\S]*Rent/);
  await waitCount("7"); // the next charge's step is due

  // Change rent with the assistant: the RPI is entered inside it, then the maximum rent and earliest date apply.
  await t.getByRole("button", {name: "Change rent"}).click();
  dlg = page.getByRole("dialog", {name: "Change rent"});
  await dlg.getByText("Enter Jersey's RPI to work out the maximum rent.").waitFor();
  await dlg.getByLabel("Jersey RPI (%)").fill("3.2");
  await dlg.getByLabel("As of").fill(today);
  await dlg.getByRole("button", {name: "Save RPI"}).click();
  await dlg.locator(".assistant", {hasText: "£1,290 pcm"}).waitFor();
  assert.match(await dlg.locator(".assistant").textContent(), /Jersey RPI: 3\.2% as of[\s\S]*Maximum rent£1,290 pcm[\s\S]*Earliest date/);
  await dlg.getByRole("button", {name: /^Use £1,290 pcm from/}).click();
  await dlg.getByRole("button", {name: "Change rent"}).click();
  await page.waitForSelector("text=/Rent changes to £1,290 pcm from/");
  const start = JSON.parse(d1("SELECT start_on FROM tenancies WHERE id = 1"))[0].results[0].start_on;
  assert.deepEqual(JSON.parse(d1("SELECT effective_on, rent FROM rent_changes WHERE tenancy_id = 1 ORDER BY effective_on DESC LIMIT 1"))[0].results,
    [{effective_on: addMonths(start, 12), rent: 1290}], "the change starts on the earliest date the assistant gave");
  assert.match(await t.locator(".rent").textContent(), /^£1,250 pcm, rises to £1,290 from \w{3} \d{1,2} \w+ \d{4}Due on day/,
    "today's rent, then the rise and its date");

  // A repair quoted above the landlord's limit waits for their approval, then is done.
  await page.getByRole("button", {name: "New repair"}).click();
  dlg = page.getByRole("dialog", {name: "New repair"});
  await dlg.getByLabel("Title").fill("Replace the boiler");
  await dlg.getByRole("radio", {name: "Urgent"}).check();
  await dlg.getByLabel("Contractor (optional)").fill("Island Heating");
  await dlg.getByLabel("Quote (£, optional)").fill("800");
  await dlg.getByText("Above Margaret Le Brun's approval limit of £500").waitFor();
  await dlg.getByRole("button", {name: "Add repair"}).click();
  await page.waitForSelector("text=Repair added: Replace the boiler.");
  const repair = page.locator("#repairs li", {hasText: "Replace the boiler"});
  assert.match(await repair.textContent(), /Reported[\s\S]*Needs the landlord's approval/);
  const update = async (status, done) => {
    await repair.getByRole("button", {name: /^Update/}).click();
    dlg = page.getByRole("dialog", {name: "Update repair"});
    await dlg.getByLabel("Status").selectOption(status);
    if (done) await done(dlg);
    await dlg.getByRole("button", {name: "Save repair"}).click();
  };
  await update("approved");
  await dlg.getByText(/mark it Awaiting approval first/).waitFor();
  await dlg.getByRole("button", {name: "Cancel"}).click();
  await update("awaiting_approval");
  await repair.locator(".badge", {hasText: "Awaiting approval"}).waitFor();
  await update("approved");
  await repair.getByText(/The landlord approved it/).waitFor();
  await update("done", d => d.getByLabel("Final cost (£)").fill("780"));
  await repair.locator(".badge", {hasText: "Done"}).waitFor();
  assert.match(await repair.textContent(), /Island Heating[\s\S]*£780/);
  await noSideScroll(BASE + "admin/#/rentals/1", "#tenancy-1 .balance");
  const y = sel => phone.locator(sel).first().evaluate(e => e.getBoundingClientRect().top);
  assert.ok(await y("#tenancy-1") < await y("#h-details"), "on a phone the tenancy comes before the property's details");
  await shot(phone, "admin-rental-mobile");

  // A tenancy already running, entered today and collected from this month: nothing late.
  await page.goto(BASE + "admin/#/rentals/3");
  await page.waitForSelector("#t-rental");
  await page.getByRole("button", {name: "New tenancy"}).click();
  const form = page.locator("#new-tenancy");
  await form.getByText("For tenancies already running, collect from the next rent day and enter what is owed today.").waitFor();
  await form.getByLabel("Tenant's name").fill("Helen Le Cornu");
  await form.getByRole("radio", {name: "Periodic"}).check();
  await form.getByRole("radio", {name: "2011 law"}).check();
  await form.getByLabel("Start date").fill(addMonths(today, -24));
  await form.getByLabel("Rent (£ pcm)").fill("2,100");
  await form.getByLabel("Collect rent from").fill(today);
  await form.getByLabel("Check-in report done on").fill(addMonths(today, -24));
  await form.getByRole("button", {name: "Add tenancy"}).click();
  await page.waitForSelector("text=Tenancy added for Helen Le Cornu. Payment reference HE-T0003.");
  const t3 = page.locator("#tenancy-3");
  await t3.locator(".balance").waitFor();
  assert.doesNotMatch(await t3.locator(".late").textContent(), /days late/);
  await page.goto(BASE + "admin/#/rentals");
  await page.waitForSelector("#h-arrears");
  assert.doesNotMatch(await page.locator("#h-arrears").locator("..").textContent(), /Helen Le Cornu/, "no arrears for the new tenancy");
  await waitCount("7");
}

// F5-A bank import and statement, after property(): tests/fixtures/bank.csv (BOM, CRLF, quotes, a line break inside
// quotes) dated today: Rose Cottage's rent by its reference, a payer with no reference, a charge (money out), the same
// cash payment twice (two payments, n = 1 and 2) and a description starting with "=". Then Margaret Le Brun's statement
// for this month: the £1,250 paid by hand and the £1,000 imported, the 10% fee and the £780 boiler repair.
async function bankImport(page, phone, noSideScroll) {
  const {jerseyToday} = await import("../server/viewings.js");
  const today = jerseyToday(), [y, m, d] = today.split("-");
  const csv = {name: "bank.csv", mimeType: "text/csv",
    buffer: Buffer.from(readFileSync("tests/fixtures/bank.csv", "utf8").replaceAll("{today}", `${d}/${m}/${y}`))};
  const imported = () => JSON.parse(d1("SELECT COUNT(*) AS n FROM payments WHERE source = 'import'"))[0].results[0].n;
  const waitCount = n => page.waitForFunction(n => document.querySelector('header.bar a[href="#/rentals"] .count')?.firstChild.textContent === n, n);
  const check = async p => {
    await p.getByLabel("Bank statement (CSV)").setInputFiles(csv);
    await p.getByRole("button", {name: "Check rows"}).click();
    await p.waitForFunction(() => document.activeElement?.id === "h-summary");
    return p.locator("#import-counts").textContent();
  };
  await page.goto(BASE + "admin/#/rentals");
  await page.waitForSelector("#t-rentals");
  await page.getByRole("link", {name: "Import bank CSV"}).click();
  await page.waitForSelector("#t-import");
  // A file over 1 MB is refused before it is read.
  await page.getByLabel("Bank statement (CSV)").setInputFiles({name: "big.csv", mimeType: "text/csv", buffer: Buffer.alloc(1024 * 1024 + 1, 97)});
  await page.getByText("This file is over 1 MB").waitFor();
  // The columns are guessed from the header and can be chosen; the sample shows the first 5 rows as they will be read.
  await page.getByLabel("Bank statement (CSV)").setInputFiles(csv);
  await page.locator("#import-sample").waitFor();
  assert.equal(await page.getByLabel("Date", {exact: true}).inputValue(), "0");
  assert.equal(await page.getByLabel("Date format").inputValue(), "DMY");
  await page.getByLabel("Amount (money in)").selectOption({label: "Amount"});
  await page.getByLabel("Description").selectOption({label: "Description"});
  assert.equal(await page.locator("#import-sample tbody tr").count(), 5);
  assert.match(await page.locator("#import-sample").textContent(), /J VAUTIER RENT HE-T0001£1,000\.00[\s\S]*J SMITH RENT OCT£450\.00[\s\S]*-£85\.40/);
  await shot(page, "admin-import-columns");
  // The dry run: one row matched, four unmatched (the same cash payment twice counts as two), the charge ignored.
  assert.match(await check(page), /Matched to a tenancy1[\s\S]*Unmatched4[\s\S]*Already imported0[\s\S]*Already recorded by hand0[\s\S]*Ignored1/);
  const rows = page.locator("#import-rows tbody tr");
  assert.equal(await rows.count(), 6);
  assert.match(await rows.nth(0).textContent(), /J VAUTIER RENT HE-T0001[\s\S]*Matched[\s\S]*HE-T0001/);
  assert.match(await rows.nth(2).textContent(), /JERSEY ELECTRICITY[\s\S]*Ignored[\s\S]*money in/);
  assert.equal(await rows.nth(5).locator("td").nth(1).textContent(), '=HYPERLINK("https://example.com","Pay")', "a cell starting with = is text");
  assert.equal(await page.locator("#import-rows a").count(), 0);
  assert.equal(imported(), 1, "a dry run writes nothing");
  await shot(page, "admin-import-summary");
  // Import writes them; the bar's count gains the four unmatched payments and Rose Cottage's balance goes down.
  await page.getByRole("button", {name: "Import 5 payments"}).click();
  await page.waitForSelector("text=Imported 5 payments: 1 matched, 4 unmatched.");
  assert.equal(imported(), 6);
  await waitCount("11");
  assert.match(JSON.parse(d1("SELECT key FROM app_settings WHERE key LIKE 'csv_map:%'"))[0].results[0].key, /^csv_map:[0-9a-f]{64}$/,
    "the columns are remembered for this bank's header");
  await page.getByRole("link", {name: "Assign the unmatched payments in Rentals"}).click();
  await page.locator("#h-unmatched").locator("..").getByText("J SMITH RENT OCT").waitFor();
  await page.goto(BASE + "admin/#/rentals/1");
  await page.locator("#tenancy-1 .balance", {hasText: "£250.00"}).waitFor();
  // The same file again adds nothing.
  await page.goto(BASE + "admin/#/rentals/import");
  await page.waitForSelector("#t-import");
  assert.match(await check(page), /Matched to a tenancy0[\s\S]*Unmatched0[\s\S]*Already imported5[\s\S]*Ignored1/);
  await page.getByText("Nothing new to import.").waitFor();
  assert.equal(await page.getByRole("button", {name: /^Import \d/}).count(), 0);
  assert.equal(imported(), 6);
  await noSideScroll(BASE + "admin/#/rentals/import", "#t-import");
  await check(phone);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, "no horizontal scroll on the summary");
  await shot(phone, "admin-import-mobile");

  // The statement: the previous month by default; this month for Margaret Le Brun shows the rent, the fee and the repair.
  await page.goto(BASE + "admin/#/rentals");
  await page.getByRole("link", {name: "Statements"}).click();
  await page.waitForSelector("#t-statement");
  const {addMonths} = await import("../server/rentals.js");
  assert.equal(await page.getByLabel("Month").inputValue(), addMonths(`${y}-${m}-01`, -1).slice(0, 7));
  await page.getByLabel("Landlord").selectOption({label: "Margaret Le Brun"});
  await page.getByLabel("Month").selectOption(`${y}-${m}`);
  await page.waitForFunction(m => location.hash === `#/rentals/statements?landlord=1&month=${m}`, `${y}-${m}`);
  const st = page.locator("#statement");
  await st.getByText("Replace the boiler").waitFor();
  assert.match(await st.textContent(), /Rose Cottage, La Rue du Moulin[\s\S]*Rent received£2,250\.00[\s\S]*Management fee \(10%\)-£225\.00[\s\S]*Replace the boiler[\s\S]*-£780\.00/);
  assert.match(await page.locator("#statement-totals").textContent(), /Rent received£2,250\.00[\s\S]*Fees-£225\.00[\s\S]*Repairs-£780\.00[\s\S]*Net to landlord£1,245\.00/);
  assert.doesNotMatch(await st.textContent(), /GST/, "no GST line while gst_percent is 0");
  await shot(page, "admin-statement");
  // Printing leaves out the bar, the buttons and the selectors.
  await page.emulateMedia({media: "print"});
  for (const sel of ["header.bar", "#statement-form", "button:has-text('Print')"]) assert.ok(await page.locator(sel).isHidden(), `${sel} is not printed`);
  assert.ok(await st.isVisible());
  await shot(page, "admin-statement-print");
  await page.emulateMedia({media: "screen"});
  await noSideScroll(page.url().replace(/^.*?#/, BASE + "admin/#"), "#statement");
  await phone.locator("#statement").getByText("Replace the boiler").waitFor();
  await shot(phone, "admin-statement-mobile");
}

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME});
  try { await publicSite(browser); await admin(browser); console.log("e2e OK"); }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });

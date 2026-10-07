// End-to-end check against `wrangler pages dev` with the fixture database (see Task 13 of the plan):
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
  await page.click("#hero-book");
  assert.equal(await page.inputValue("#book-slot select[name=prop]"), "HE-R001", "hero booking preselects the property");

  await page.goto(BASE + "#/p/HE-R001");
  await page.waitForSelector(".summary h1");
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
  await page.goto(BASE + "#/p/HE-R003");
  await page.waitForFunction(() => location.hash === "#/");

  // Booking: real request, Turnstile test key passes automatically.
  await page.goto(BASE + "#/p/HE-R002");
  await page.waitForSelector("#detail-slot form");
  await page.waitForFunction(() => document.querySelector('#detail-slot [name="cf-turnstile-response"]')?.value, null, {timeout: 20000});
  await page.fill("#detail-slot input[name=name]", "Jane Le Brocq");
  await page.fill("#detail-slot input[name=email]", "jane@example.je");
  await page.click("#detail-slot button[type=submit]");
  await page.waitForSelector("#detail-slot .confirm");
  assert.match(await page.textContent("#detail-slot .confirm"), /Request received[\s\S]*Trinity rental/);
  assert.match(d1("SELECT name, listing_id FROM viewing_requests"), /Jane Le Brocq[\s\S]*HE-R002/);
  assert.deepEqual(page.errors, []);

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
  await page.waitForSelector("text=Listings");
  assert.equal(await page.getAttribute("header.bar a.home", "href"), "/", "panel header links back to the public site");
  assert.match(await page.textContent(".seg"), /Published4[\s\S]*Drafts1/);
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
  // Field save → photo save → field save on the same listing: each must carry the fresh updated_at (no false 409).
  await page.locator(".media-grid li").nth(1).getByLabel("Visible on the website").uncheck();
  await page.getByRole("button", {name: "Save photos"}).click();
  await page.waitForSelector("text=Photos saved.");
  await page.fill("#f-title", "Le Bernage");
  await page.getByRole("button", {name: "Save", exact: true}).click();
  await page.waitForSelector("text=Changes saved.");

  // Review focus 1: a published listing with no public photo warns.
  await page.goto(BASE + "admin/#/p/HE-C001");
  await page.waitForSelector("#f-title");
  await page.uncheck(".media-grid li >> text=Visible on the website");
  await page.getByRole("button", {name: "Save photos"}).click();
  await page.waitForSelector("text=Photos saved.");
  await page.reload();
  await page.waitForSelector("text=no public photo");
  // M1: publishing it says it will NOT show, and the table marks it.
  await page.getByRole("button", {name: "Unpublish", exact: true}).click();
  await page.waitForSelector("text=Unpublished");
  await page.getByRole("button", {name: "Publish", exact: true}).click();
  await page.waitForSelector("text=won't appear on the website");
  await page.goto(BASE + "admin/#/");
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

  // Featured: set in the panel, shown first and in the hero on the public site.
  await page.goto(BASE + "admin/#/p/HE-R018");
  await page.waitForSelector("#f-featured_rank");
  await page.fill("#f-featured_rank", "1");
  await page.getByRole("button", {name: "Save", exact: true}).click();
  await page.waitForSelector("text=Changes saved.");
  await page.goto(BASE + "admin/#/");
  await page.waitForSelector('tr:has-text("HE-R018") >> text=Featured #1');
  const home = await ctx.newPage();
  await home.goto(BASE);
  await home.waitForSelector("#grid .card");
  assert.equal(await home.getAttribute("#grid .card", "href"), "#/p/HE-R018", "featured listing comes first");
  assert.match(await home.textContent(".hero h1"), /Pathfield/, "featured listing leads the hero");
  await home.close();

  await page.goto(BASE + "admin/#/viewings");
  await page.waitForSelector("text=Jane Le Brocq");
  // Inbox: the first request opens in the detail pane; notes and status are one click each.
  await page.fill("#v-notes", "Called, prefers Saturday");
  await page.getByRole("button", {name: "Save notes", exact: true}).click();
  await page.waitForSelector("text=Notes saved.");
  await page.getByRole("button", {name: "Mark contacted", exact: true}).click();
  await page.waitForSelector("text=You're all caught up");
  await page.getByRole("button", {name: /^Contacted/}).click();
  assert.equal(await page.inputValue("#v-notes"), "Called, prefers Saturday", "notes are kept");
  await shot(page, "admin-inbox");
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

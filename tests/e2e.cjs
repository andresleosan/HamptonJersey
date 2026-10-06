// Browser smoke test for the demo flows. Needs playwright-core and a Chrome/Chromium binary:
//   (cd site && python3 -m http.server 8765 --bind 127.0.0.1) &
//   PW=<path to playwright-core> CHROME=/opt/google/chrome/chrome node tests/e2e.cjs [screenshot-dir]
// Matterport is never contacted: its requests are aborted, so the test only checks our side of the embed.
const {chromium} = require(process.env.PW || "playwright-core");
const assert = require("node:assert/strict");
const BASE = process.env.BASE || "http://127.0.0.1:8765/";
const SHOTS = process.argv[2];
const MAGNOLIA = "9c0f9d02", TRINITY = "d5967950", PATHFIELD = "91c754ff", SOLD = "b1b43893", NOPRICE = "8eb8ffab";

async function newPage(browser, viewport, opts = {}) {
  const page = await browser.newPage({viewport});
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.route(/matterport\.com/, r => r.abort());
  if (opts.route) await opts.route(page);
  if (opts.init) await page.addInitScript(opts.init);
  page.errors = errors;
  return page;
}
const shot = (page, name) => SHOTS && page.screenshot({path: `${SHOTS}/${name}.png`});
const fill = async (scope, page) => {
  await page.fill(`${scope} input[name=name]`, "Jane Le Brocq");
  await page.fill(`${scope} input[name=email]`, "jane@example.je");
};

async function desktop(browser) {
  const page = await newPage(browser, {width: 1280, height: 800});
  await page.goto(BASE);
  await page.waitForSelector("#grid .card");
  await shot(page, "d-home");

  // Geography is its own dimension: London only under UK.
  await page.click("#tabs-region [data-region=uk]");
  assert.deepEqual(await page.$$eval("#grid .card", cs => cs.map(c => c.getAttribute("href"))), [`#/p/${PATHFIELD}`]);
  await page.click("#tabs-region [data-region=jersey]");
  assert.equal(await page.$(`#grid [href="#/p/${PATHFIELD}"]`), null);
  assert.equal(await page.inputValue("#q-region"), "jersey", "hero search follows the tabs");

  // Hero search: rentals with a monthly limit return rentals only.
  await page.selectOption("#q-region", "jersey");
  await page.selectOption("#q-op", "rent");
  await page.selectOption("#q-max", "2500");
  await page.click("#quick button[type=submit]");
  assert.deepEqual(await page.$$eval("#grid .card", cs => cs.map(c => c.getAttribute("href"))), [`#/p/${TRINITY}`]);
  assert.match(await page.textContent("#grid .price"), /pcm/);
  await page.click("#clear");

  // General enquiry (empty property option) submits; then book again, cancel, and switch agent from the team section.
  await fill("#book-slot", page);
  await page.click("#book-slot button[type=submit]");
  await page.waitForSelector("#book-slot .confirm");
  assert.match(await page.textContent("#book-slot .confirm"), /General enquiry/);
  await page.click("#team [data-agent='1']");
  assert.ok(await page.isChecked("#book-slot input[name=agent][value='1']"), "team button re-opens the form after a confirmation");
  await fill("#book-slot", page);
  await page.selectOption("#book-slot select[name=prop]", TRINITY);
  await page.click("#book-slot button[type=submit]");
  assert.match(await page.textContent("#book-slot .confirm"), /Trinity rental[\s\S]*Joshua/);
  await page.click("#book-slot [data-cancel]");
  assert.match(await page.textContent("#book-slot .cancelled"), /cancelled/);
  assert.equal(await page.inputValue("#book-slot select[name=prop]"), TRINITY);
  await page.click("#team [data-agent='0']");
  assert.ok(await page.isChecked("#book-slot input[name=agent][value='0']"));

  // Detail: first screen holds photo, price, key facts and the booking call.
  await page.goto(`${BASE}#/p/${MAGNOLIA}`);
  await page.waitForSelector(".summary");
  assert.equal(await page.evaluate(() => scrollY), 0, "new page starts at the top");
  for (const sel of ["#stage img", ".summary .price", ".summary .keys", ".summary .btns .btn"]) {
    const b = await page.locator(sel).first().boundingBox();
    assert.ok(b && b.y >= 0 && b.y + b.height <= 800, `${sel} visible without scrolling`);
  }
  await shot(page, "d-detail");

  // One click on the 3D button loads the viewer itself (no intermediate poster).
  await page.click("[data-go=tour]");
  assert.match(await page.getAttribute("#stage iframe", "src"), /matterport\.com\/show\/\?m=JGPnGQ6hosj.*ts=\d/);
  assert.match(await page.textContent("#stage-note"), /not this property/);

  // Aerial: no animation, and photo + outlines share the same box at any size.
  await page.click("#tab-drone");
  const aligned = () => page.evaluate(() => {
    const img = document.querySelector(".drone img"), svg = document.querySelector(".drone svg");
    const a = img.getBoundingClientRect(), b = svg.getBoundingClientRect();
    return {same: ["x", "y", "width", "height"].every(k => Math.abs(a[k] - b[k]) < 0.5),
      anim: getComputedStyle(img).animationName + getComputedStyle(svg).animationName, transform: getComputedStyle(img).transform};
  });
  assert.deepEqual(await aligned(), {same: true, anim: "nonenone", transform: "none"});
  await shot(page, "d-aerial");
  await page.setViewportSize({width: 700, height: 900});
  assert.equal((await aligned()).same, true);
  await page.setViewportSize({width: 1280, height: 800});
  assert.match(await page.textContent("#stage-note"), /Illustrative/);

  // Keyboard on media tabs.
  await page.focus("#tab-drone");
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getAttribute("#tab-photo", "aria-selected"), "true");

  // Calculator and comparables.
  await page.fill("#c-price", "500000");
  assert.match(await page.textContent("#r-month"), /^£[\d,]+$/);
  const cmp = await page.$$eval(".block .grid .card", cs => cs.map(c => c.getAttribute("href")));
  assert.ok(!cmp.includes(`#/p/${TRINITY}`) && !cmp.includes("#/p/8c37b8d1"), "no rentals or hotels next to a house for sale");

  // Detail booking: "Book a viewing" keeps the route, then switch property from the form.
  await page.click(".summary [data-scroll=detail-book]");
  assert.equal(new URL(page.url()).hash, `#/p/${MAGNOLIA}`);
  await fill("#detail-slot", page);
  await page.selectOption("#detail-slot select[name=prop]", "38b1444c");
  await page.click("#detail-slot button[type=submit]");
  assert.match(await page.textContent("#detail-slot .confirm"), /Victoria Street/);
  await page.click("#detail-slot [data-again]");
  assert.equal(await page.inputValue("#detail-slot select[name=prop]"), "38b1444c");

  // Sold: no booking. Unknown price: no calculator, no "similar price".
  await page.goto(`${BASE}#/p/${SOLD}`);
  await page.waitForSelector(".summary");
  assert.equal(await page.$("#detail-book"), null);
  await page.goto(`${BASE}#/p/${NOPRICE}`);
  await page.waitForSelector(".summary");
  assert.equal(await page.$("#calc"), null);
  assert.match(await page.textContent(".summary .price"), /Price not published/);
  // Hidden duplicate is not reachable publicly.
  await page.goto(`${BASE}#/p/f2eb59e7`);
  await page.waitForSelector("#portfolio");

  assert.deepEqual(page.errors, []);
  await page.close();
}

async function mobile(browser) {
  const page = await newPage(browser, {width: 390, height: 844});
  await page.goto(BASE);
  await page.waitForSelector("#grid .card");
  assert.ok(await page.isVisible(".menu-btn") && !(await page.isVisible("#main-nav")));
  await shot(page, "m-home");
  await page.click(".menu-btn");
  assert.equal(await page.getAttribute(".menu-btn", "aria-expanded"), "true");
  await shot(page, "m-menu");
  await page.keyboard.press("Escape");
  assert.ok(!(await page.isVisible("#main-nav")));
  assert.ok(await page.evaluate(() => document.activeElement.classList.contains("menu-btn")), "focus returns to the button");
  await page.click(".menu-btn");
  await page.click("#main-nav a[href='#team']");
  assert.ok(!(await page.isVisible("#main-nav")));
  await page.waitForFunction(() => Math.abs(document.querySelector("#team").getBoundingClientRect().top) < 120);

  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.equal(await overflow(), 0, "no horizontal scroll on home");
  await page.goto(`${BASE}#/p/${MAGNOLIA}`);
  await page.waitForSelector(".summary");
  await shot(page, "m-detail");
  const price = await page.locator(".summary .price").boundingBox();
  assert.ok(price.y >= 0 && price.y < 844, "price on the first mobile screen");
  const cta = await page.locator(".summary .btns .btn").first().boundingBox();
  assert.ok(cta.y + cta.height <= 844, "booking button on the first mobile screen");
  await page.click("#tab-drone");
  await shot(page, "m-aerial");
  assert.equal(await overflow(), 0, "no horizontal scroll on detail");
  await page.click("#tab-tour");
  assert.ok(await page.$("#stage iframe"));
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await shot(page, "m-detail-bottom");
  assert.deepEqual(page.errors, []);
  await page.close();
}

async function failures(browser) {
  // No WebGL → clear message and a link, no iframe.
  let page = await newPage(browser, {width: 1280, height: 800}, {init: () => {
    const g = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); };
  }});
  await page.goto(`${BASE}#/p/${MAGNOLIA}`);
  await page.click("[data-go=tour]");
  assert.match(await page.textContent("#stage .stage-msg"), /WebGL/);
  assert.equal(await page.$("#stage iframe"), null);
  assert.ok(await page.$("#stage .stage-msg a[href*='matterport.com']"));
  await page.close();

  // Offline: the listing photo fails, then the tour fallback must still be readable (not under "Photo unavailable").
  page = await newPage(browser, {width: 1280, height: 800}, {route: p => p.route(/wixstatic\.com/, r => r.abort())});
  await page.goto(`${BASE}#/p/${MAGNOLIA}`);
  await page.waitForSelector("#stage.noimg");
  await page.context().setOffline(true);
  await page.click("[data-go=tour]");
  assert.ok(await page.isVisible("#stage .stage-msg"));
  assert.ok(!(await page.$eval("#stage", s => s.classList.contains("noimg"))), "photo overlay cleared");
  await page.context().setOffline(false);
  await page.close();

  // Listings JSON fails → error state with retry.
  page = await newPage(browser, {width: 1280, height: 800}, {route: p => p.route("**/data/properties.json", r => r.fulfill({status: 500}))});
  await page.goto(BASE);
  await page.waitForSelector("#app [role=alert]");
  await page.close();

  // Team JSON and listing images fail → page still works, booking assigns "first available".
  page = await newPage(browser, {width: 1280, height: 800}, {route: async p => {
    await p.route("**/data/team.json", r => r.fulfill({status: 404}));
    await p.route(/wixstatic\.com/, r => r.abort());
  }});
  await page.goto(BASE);
  await page.waitForSelector("#grid .card");
  await page.waitForSelector("#grid .ph.noimg");
  assert.match(await page.textContent("#book-slot"), /Team details are unavailable/);
  await fill("#book-slot", page);
  await page.click("#book-slot button[type=submit]");
  assert.match(await page.textContent("#book-slot .confirm"), /First available/);
  await shot(page, "f-noimg");
  assert.deepEqual(page.errors, []);
  await page.close();
}

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME, args: ["--no-sandbox"]});
  try {
    for (const t of [desktop, mobile, failures]) { await t(browser); console.log("ok", t.name); }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });

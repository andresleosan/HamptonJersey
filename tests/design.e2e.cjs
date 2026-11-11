// Public design regressions, isolated API fixtures; run with PW/CHROME/BASE as in e2e.cjs.
const { chromium, webkit } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const BASE = process.env.BASE || 'http://localhost:8788/';
const SHOTS = process.argv[2];
const cases = (process.env.DESIGN_CASES || 'home,navigation,catalog,detail,aux').split(',');
const photos = Array.from({length: 17}, (_, i) => ({src: `/media/DESIGN${i}`, thumb: `/media/DESIGN${i}?thumb`, alt: `Room ${i + 1}`}));
const listing = (i = 0) => ({id: `HE-R${String(i + 1).padStart(3, '0')}`, title: i ? `Jersey home ${i + 1}` : '2 bedroom flat - Bottom of Wellington Road',
  region: 'jersey', place: 'St Saviour', operation: 'sale', use: 'residential', status: 'For Sale', beds: 2, baths: 1,
  type: 'Two-bedroom flat', salePrice: 779000, currency: 'GBP', image: photos[0].src, thumb: photos[0].thumb,
  photos, summary: ['Parking and garden'], description: ['A quiet home in St Saviour.'], specs: [{group: 'Accommodation', label: 'Heating', value: 'Electric'}],
  floorplans: [], featured: i + 1});
const fixture = Array.from({length: 5}, (_, i) => listing(i));
const image = fs.readFileSync('tests/fixtures/photo.jpg');
async function open(browser, width, data = fixture, path = '') {
  const ctx = await browser.newContext({viewport: {width, height: 844}, reducedMotion: 'reduce', ...(width === 390 ? {isMobile: true, hasTouch: true} : {})});
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|turnstile|challenges/i.test(m.text())) page.errors.push(m.text()); });
  await page.route('**/api/listings', r => r.fulfill({json: data}));
  await page.route('**/media/DESIGN*', r => /DESIGN1(?:\?|$)/.test(r.request().url())
    ? r.fulfill({body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#876"/></svg>', contentType: 'image/svg+xml'})
    : r.fulfill({body: image, contentType: 'image/jpeg'}));
  await page.route(/matterport\.com|challenges\.cloudflare\.com/, r => r.abort());
  await page.goto(BASE + path);
  await page.waitForSelector('#app > *');
  return {ctx, page};
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
async function shot(page, name, width) {
  if (SHOTS) { fs.mkdirSync(SHOTS, {recursive: true}); await page.screenshot({path: `${SHOTS}/${name}-${width}.png`, fullPage: true}); }
}
(async () => {
  const engine = process.env.DESIGN_BROWSER === 'webkit' ? webkit : chromium;
  const browser = await engine.launch(process.env.DESIGN_BROWSER === 'webkit' ? {} : {executablePath: process.env.CHROME});
  try {
    for (const width of (process.env.DESIGN_WIDTHS || '1280,390').split(',').map(Number)) {
      if (cases.includes('home')) {
        const {ctx, page} = await open(browser, width);
        await page.waitForSelector('.hero .slide');
        assert.equal(await page.locator('.hero .slide').count(), 5);
        assert.equal(await page.textContent('#hero-count'), '1 of 5');
        assert.equal(await page.locator('.hero-bars span').count(), 5);
        assert.equal(await page.locator('.hero-bars .is-current').count(), 1);
        assert.ok(await page.locator('.hero-nav').evaluate(el => { const n=el.getBoundingClientRect(), h=el.closest('.hero').querySelector('.hero-track').getBoundingClientRect(); return n.top >= h.top && n.bottom <= h.bottom; }), 'controls overlay the photo');
        assert.ok(await page.locator('.hero-arrow[data-dir="-1"]').isDisabled());
        await page.evaluate(() => { window.heroSettled = new Promise(done => document.querySelector('.hero-track').addEventListener('scrollend', () => done(true), {once: true})); });
        if (width === 1280) {
          await page.mouse.move(400, 300); await page.mouse.wheel(1000, 0);
          await page.waitForFunction(() => document.querySelector('#hero-count').textContent === '2 of 5');
        } else if (engine === chromium) {
          const touch = await ctx.newCDPSession(page);
          await touch.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: 320, y: 300}]});
          for (let x = 280; x >= 40; x -= 40) await touch.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: 300}]});
          await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
          await page.waitForFunction(() => document.querySelector('#hero-count').textContent === '2 of 5');
          await touch.detach();
        }
        if (width === 1280 || engine === chromium) await page.evaluate(() => window.heroSettled);
        await page.$eval('.hero-track', t => { t.scrollLeft = 0; });
        await page.waitForFunction(() => document.querySelector('#hero-count').textContent === '1 of 5');

        await page.click('.hero-arrow[data-dir="1"]');
        await page.waitForFunction(() => document.querySelector('#hero-count').textContent === '2 of 5');
        await page.focus('.hero-track'); await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('#hero-count').textContent === '3 of 5').catch(async e => { console.log('Hero state:', await page.evaluate(() => ({count: document.querySelector('#hero-count').textContent, left: document.querySelector('.hero-track').scrollLeft, width: document.querySelector('.hero-track').clientWidth, active: document.activeElement.className, viewport: innerWidth}))); throw e; });
        await page.$eval('.hero-track', t => { t.scrollLeft = t.clientWidth * 4; });
        await page.waitForFunction(() => document.querySelector('#hero-count').textContent === '5 of 5');
        assert.ok(await page.locator('.hero-bars span').last().evaluate(el => el.classList.contains('is-current')));
        assert.ok(await page.locator('.hero-arrow[data-dir="1"]').isDisabled());
        assert.equal(await page.$eval('.hero-track', t => getComputedStyle(t).overscrollBehaviorX), 'contain');
        assert.equal(await page.$eval('.hero-track', t => getComputedStyle(t).scrollBehavior), 'auto', 'reduced motion');
        await page.$eval('.hero-track', t => { t.scrollLeft = 0; });
        await page.waitForFunction(() => document.querySelector('#hero-count').textContent === '1 of 5');
        if (width === 1280) {
          assert.ok(await page.$eval('.slide h2', el => el.clientHeight / parseFloat(getComputedStyle(el).lineHeight) <= 2.1), 'headline fits two lines');
          await page.mouse.move(400, 300); await page.mouse.wheel(0, 600);
          await page.waitForFunction(() => scrollY > 0);
        } else {
          assert.equal(await page.$eval('.slide', el => Math.round(el.getBoundingClientRect().width)), width);
          if (engine === chromium) {
            const touch = await ctx.newCDPSession(page);
            await page.evaluate(() => { window.pageSettled = new Promise(done => document.addEventListener('scrollend', () => done(true), {once: true})); });
            await touch.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: 200, y: 450}]});
            for (let y = 410; y >= 130; y -= 40) await touch.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: 200, y}]});
            await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
            await page.waitForFunction(() => scrollY > 0); await page.evaluate(() => window.pageSettled); await touch.detach();
          }

        }
        await page.click('.slide:first-child [data-book]');
        assert.equal(await page.inputValue('#book-slot select[name=prop]'), 'HE-R001');
        assert.equal(await page.locator('.facts, .feature').count(), 0, 'no stats strip or repeated feature blocks');
        assert.ok(await noOverflow(page));
        await page.evaluate(() => scrollTo({top: 0, behavior: 'instant'}));
        await shot(page, 'home', width);
        assert.deepEqual(page.errors, []);
        await ctx.close();
        for (const [name, data] of [['one', [listing()]], ['broken', [{...listing(), image: '/media/BROKEN'}]], ['empty', []], ['no-photo', [{...listing(), image: null}]]]) {
          const {ctx, page} = await open(browser, width, data);
          if (data.length && data[0].image) {
            await page.waitForSelector('.hero .slide');
            assert.equal(await page.locator('.hero-arrow, #hero-count').count(), 0);
            assert.ok(await page.$eval('.slide', el => el.getBoundingClientRect().height >= 500));
            if (name === 'broken') await page.waitForSelector('.slide.noimg');
            await page.click('.slide [data-book]');
            assert.equal(await page.inputValue('#book-slot select[name=prop]'), 'HE-R001');
          } else { await page.waitForSelector('#app [role=alert]'); assert.equal(await page.locator('.hero-track').count(), 0); }
          assert.ok(await noOverflow(page)); assert.deepEqual(page.errors, []); await ctx.close();
        }
        const {ctx: manyCtx, page: many} = await open(browser, width, [...fixture, listing(5)]);
        await many.waitForSelector('#quick');
        assert.equal(await many.locator('.feature').count(), 2, 'two featured blocks at most with six listings');
        assert.ok(await noOverflow(many)); assert.deepEqual(many.errors, []); await shot(many, 'home-many', width); await manyCtx.close();
      }
      if (cases.includes('navigation')) {
        const {ctx, page} = await open(browser, width);
        await page.waitForSelector('.hero-track');
        let release, requested;
        const gate = new Promise(done => { release = done; }), hit = new Promise(done => { requested = done; });
        await page.route('**/apply.js', async route => { requested(); await gate; await route.continue(); });
        const loaded = page.waitForResponse('**/apply.js');
        try {
          if (width === 390) await page.click('.menu-btn');
          await page.click('#main-nav a[href="#/apply"]'); await hit;
          await page.click('header .logo');
          await page.$eval('.hero-track', t => { t.scrollLeft = t.clientWidth; });
          await page.waitForFunction(() => document.querySelector('#hero-count').textContent === '2 of 5', undefined, {timeout: 3000});
          assert.ok(!(await page.locator('.hero-arrow[data-dir="-1"]').isDisabled()), 'observer survives a cancelled side page');
        } finally { release(); await loaded; }
        assert.deepEqual(page.errors, []); await ctx.close();
      }
      if (cases.includes('catalog')) {
        const {ctx, page} = await open(browser, width, [listing(), {...listing(1), operation:'business', use:'commercial'}, {...listing(2), region:'international'}, {...listing(3), region:'international', operation:'rent'}], 'properties');
        await page.waitForSelector('.op-buttons button');
        assert.deepEqual(await page.locator('.op-buttons b').allTextContents(), ['Rent','Buy','Commercial','International']);
        await page.click('.op-buttons [data-op=international]');
        await page.waitForFunction(() => document.querySelector('#count').textContent === '2 properties');
        assert.ok(new URL(page.url()).searchParams.get('region') === 'international');
        await page.reload(); await page.waitForSelector('.op-buttons [data-op=international][aria-pressed=true]');
        assert.equal(await page.textContent('#count'), '2 properties');
        await page.click('.op-buttons [data-op=business]');
        assert.equal(await page.textContent('#count'), '1 property');
        assert.equal(new URL(page.url()).searchParams.has('region'), false);
        await page.click('.op-buttons [data-op=international]');
        assert.equal(await page.textContent('#count'), '2 properties');
        await page.click('.op-buttons [data-op=international]');
        assert.equal(await page.textContent('#count'), '4 properties');
        if (width === 1280) {
          await page.emulateMedia({reducedMotion: 'no-preference'});
          const button = page.locator('.op-buttons button').first();
          const before = (await button.boundingBox()).width; await button.hover(); await page.waitForTimeout(750);
          assert.ok((await button.boundingBox()).width > before + 20, 'hover widens the property type');
          assert.equal(await page.$eval('#grid', el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2, 'four cards form two columns');
        }
        for (const category of await page.locator('.op-buttons button').all()) {
          if (width > 1100) { await category.hover(); await page.waitForTimeout(650); }
          assert.ok(await category.evaluate(el => { const text=el.querySelector('b'), r=text.getBoundingClientRect(), range=document.createRange(); range.selectNodeContents(text); return range.getBoundingClientRect().width <= r.width + 1; }), 'category label fits, including while neighbours expand');
        }
        await page.emulateMedia({reducedMotion:'reduce'});
        if (width > 1100) {
          await page.mouse.move(0,0); const first=page.locator('.op-buttons button').first(), before=(await first.boundingBox()).width;
          await first.focus(); assert.ok(Math.abs((await first.boundingBox()).width-before)<1, 'reduced motion keeps card sizes stable');
        }
        assert.equal(await page.$eval('.op-txt small', el => getComputedStyle(el, '::after').content), 'none');
        assert.ok(await noOverflow(page), `${width}px: catalogue overflow: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== 'absolute').slice(0,8).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right}))))}`); assert.deepEqual(page.errors, []); await shot(page, 'properties', width); await ctx.close();
        for (const total of [4,6]) {
          const {ctx: emptyCtx,page: emptyPage}=await open(browser,width,Array.from({length:total},(_,i)=>listing(i)),'properties?region=international');
          await emptyPage.waitForSelector('.op-buttons [data-op=international][aria-pressed=true]');
          assert.equal(await emptyPage.textContent('#count'),'0 properties');
          assert.ok(await emptyPage.locator('#grid .empty').isVisible());
          await emptyPage.click('#show-all'); assert.equal(await emptyPage.locator('#grid .card').count(),total);
          assert.ok(await noOverflow(emptyPage)); assert.deepEqual(emptyPage.errors,[]);await emptyCtx.close();
        }
      }
      if (cases.includes('detail')) {
        const {ctx, page} = await open(browser, width, fixture, 'p/HE-R001');
        await page.waitForSelector('.summary h1');
        assert.equal(await page.locator('.summary .eyebrow').count(), 0);
        assert.equal(await page.textContent('.summary .place'), 'For sale in St Saviour');
        assert.ok(!(await page.locator('.facts-list dt').allTextContents()).includes('Operation'));
        assert.equal(await page.locator('.stage-track > *').count(), 17);
        await page.waitForFunction(() => document.querySelector('.stage-frame img').naturalWidth > 0);
        const landscapeHeight = await page.$eval('#stage', el => el.getBoundingClientRect().height);
        await page.evaluate(() => document.querySelector('#stage').scrollIntoView({block: 'center', behavior: 'instant'}));
        await page.click('.stage-nav.next');
        await page.waitForFunction(() => document.querySelector('#stage-note').textContent.includes('Photo 2 of 17') && document.querySelectorAll('.stage-frame img')[1].naturalWidth > 0);
        assert.equal(await page.$eval('.stage-frame img', el => getComputedStyle(el).objectFit), 'contain', 'photos are not cropped');
        assert.ok(await page.$eval('#stage', (el, h) => el.getBoundingClientRect().height > h, landscapeHeight), 'portrait expands the viewer');
        await page.click('.stage-nav.prev');
        await page.waitForFunction(() => document.querySelector('#stage-note').textContent.includes('Photo 1 of 17'));
        assert.ok(await page.$eval('#stage', (el, h) => Math.abs(el.getBoundingClientRect().height - h) < 2, landscapeHeight), 'viewer returns to landscape height');
        assert.equal(await page.$eval('#stage', el => getComputedStyle(el).transitionDuration), '0s', 'reduced motion disables height transition');
        await page.emulateMedia({reducedMotion: 'no-preference'});
        assert.equal(await page.$eval('#stage', el => getComputedStyle(el).transitionDuration), '0.35s', 'height change is animated');
        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.$eval('.stage-track', t => { t.scrollLeft = t.clientWidth * 2; });
        await page.waitForFunction(() => document.querySelector('#stage-note').textContent.includes('Photo 3 of 17'));
        await page.click('#thumbs [data-i="4"]');
        await page.waitForFunction(() => document.querySelector('#stage-note').textContent.includes('Photo 5 of 17'));
        await page.click('[data-all]'); assert.equal(await page.textContent('#lb-count'), '5 / 17');
        assert.equal(await page.$eval('#lb-img', el => getComputedStyle(el).objectFit), 'contain');
        await shot(page, 'lightbox', width);
        await page.evaluate(() => { window.galleryClosed = new Promise(done => document.querySelector('#lightbox').addEventListener('close', () => done(true), {once: true})); });
        await page.keyboard.press('Escape'); await page.evaluate(() => window.galleryClosed);
        await page.focus('.stage-track');
        const focused = await page.locator('#stage').screenshot();
        const ring = await page.evaluate(async src => {
          const photo = new Image(); photo.src = src; await photo.decode();
          const canvas = document.createElement('canvas'); canvas.width = photo.width; canvas.height = photo.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(photo, 0, 0);
          const pixels = ctx.getImageData(40, 2, 1, 8).data;
          return Array.from({length: 8}, (_, i) => [...pixels.slice(i * 4, i * 4 + 3)]);
        }, `data:image/png;base64,${focused.toString('base64')}`);
        assert.ok(ring.some(rgb => rgb[0] === 165 && rgb[1] === 107 && rgb[2] === 61), 'keyboard focus is painted above the photo');
        await page.keyboard.press('ArrowLeft');
        await page.waitForFunction(() => document.querySelector('#stage-note').textContent.includes('Photo 4 of 17'));
        assert.ok(await noOverflow(page)); assert.deepEqual(page.errors, []); await shot(page, 'listing', width); await ctx.close();
        const broken = {...listing(), photos: [{src: '/media/BROKEN', thumb: '/media/BROKEN?thumb', alt: 'Front'}, photos[1]], image: '/media/BROKEN'};
        const {ctx: brokenCtx, page: brokenPage} = await open(browser, width, [broken], 'p/HE-R001');
        await brokenPage.waitForSelector('.stage-frame.noimg');
        assert.ok(await brokenPage.$eval('.stage', el => el.getBoundingClientRect().height >= 240));
        await brokenPage.click('.stage-nav.next');
        await brokenPage.waitForFunction(() => document.querySelector('#stage-note').textContent.includes('Photo 2 of 2'));
        assert.deepEqual(brokenPage.errors, []); await brokenCtx.close();

      }
      if (cases.includes('aux')) {
        const {ctx: regCtx, page: reg} = await open(browser, width, fixture, '#/apply');
        await reg.waitForSelector('.apply form');
        for (let step = 0; step < 7; step++) {
          await reg.waitForFunction(n => document.querySelector('.apply-progress p').textContent.includes(`${n + 1} of 7`), step);
          assert.equal(await reg.locator('fieldset.step:visible').count(), 1);
          assert.ok(await noOverflow(reg)); await shot(reg, `register-${step + 1}`, width);
          if (step === 0) { await reg.locator('label:has(input[name=search_category][value=residential])').click(); await reg.locator('label:has(input[name=operation][value=rent])').click(); }
          if (step === 2) await reg.locator('label:has(input[name=bedrooms_min][value="2"])').click();
          if (step === 4) await reg.fill('[name=budget_max]', '2000');
          if (step < 6) await reg.click('.apply-actions button[type=submit]');
        }
        assert.deepEqual(reg.errors, []); await regCtx.close();

        for (const [name, path, sel] of [['privacy', '#/privacy', '.legal h1'], ['not-found', 'p/HE-R999', '#app .empty']]) {
          const {ctx, page} = await open(browser, width, fixture, path); await page.waitForSelector(sel);
          assert.ok(await noOverflow(page)); assert.deepEqual(page.errors, []); await shot(page, name, width); await ctx.close();
        }
      }
    }
    console.log(`design e2e OK (${cases.join(', ')}, widths ${process.env.DESIGN_WIDTHS || '1280,390'}, ${process.env.DESIGN_BROWSER || 'chromium'})`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });

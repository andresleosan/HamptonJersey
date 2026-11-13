// Local synthetic fixture only. Run exclusively through test:e2e:isolated.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PW || 'playwright-core');
const BASE = process.env.BASE;

(async () => {
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated fixture required');
  const browser = await chromium.launch({executablePath:process.env.CHROME});
  try {
    for (const width of [1280,390,320]) {
      const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
      const page = await context.newPage(), errors=[];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(BASE+'#/apply'); await page.locator('.apply form').waitFor();
      const header=page.locator('header.top'), menu=header.getByRole('button',{name:'Menu',exact:true});
      const nav=header.getByRole('navigation',{name:'Main'}), logo=header.locator('a.logo');
      assert.equal(await logo.getAttribute('href'),'/');
      if (width===1280) {
        assert.equal(await nav.isVisible(),true); assert.equal(await menu.isVisible(),false);
      } else {
        assert.equal(await menu.isVisible(),true); assert.equal(await nav.isVisible(),false);
        await menu.focus(); await page.keyboard.press('Space');
        assert.equal(await menu.getAttribute('aria-expanded'),'true');
        assert.equal(await nav.getByRole('link',{name:'Home',exact:true}).evaluate(el=>el===document.activeElement),true);
        await page.keyboard.press('Escape'); assert.equal(await menu.getAttribute('aria-expanded'),'false');
        assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
      }
      if (width===390) {
        await page.evaluate(()=>document.documentElement.style.zoom='2');
        const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
          elements:[...document.querySelectorAll('header.top .logo,header.top .menu-btn,footer .wrap,footer p')]
            .map(el=>({tag:el.tagName,cls:el.className,left:Math.round(el.getBoundingClientRect().left),right:Math.round(el.getBoundingClientRect().right)}))}));
        assert.ok(geometry.elements.every(el=>el.left>=-1 && el.right<=geometry.width+1),JSON.stringify(geometry));
        await menu.focus(); await page.keyboard.press('Enter');
        assert.equal(await menu.getAttribute('aria-expanded'),'true');
        assert.equal(await nav.getByRole('link',{name:'Home',exact:true}).evaluate(el=>el===document.activeElement),true);
        await page.keyboard.press('Escape'); assert.equal(await menu.getAttribute('aria-expanded'),'false');
        assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
      }
      assert.deepEqual(errors,[]); await context.close();
    }
    console.log('Public header: desktop, mobile, 200% reflow and keyboard navigation passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

// Readonly route coverage. Caller owns authentication and a fully intercepted browser context.
const ORIGIN = 'https://hamptonjersey-qa.pages.dev';
const CASES = [
  ['public-home', '/', '#app h1', '#portfolio .card'],
  ['public-properties', '/properties', '#app h1', '#grid .card'],
  ['public-property', '/p/HE-Q001', '#app .summary h1', '#stage img'],
  ['public-apply', '/#/apply', '#app h1', '#app .apply form'],
  ['public-privacy', '/#/privacy', '#app h1', '#app .legal h2'],
  ['admin-inbox', '/admin/#/', '#t-inbox'],
  ['admin-messages', '/admin/#/messages', '#t-msg'],
  ['admin-email', '/admin/#/email', '#email-title'],
  ['admin-applicants', '/admin/#/applicants', '#t-applicants'],
  ['admin-new-applicant', '/admin/#/applicants/new', '#t-new-app'],
  ['admin-applicant', '/admin/#/applicants/1', '#t-applicant'],
  ['admin-applicant-matches', '/admin/#/applicants/1/matches', '#t-applicant'],
  ['admin-review', '/admin/#/review', '#t-review'],
  ['admin-advertisers', '/admin/#/advertisers', '#advertisers-title'],
  ['admin-listings', '/admin/#/listings', '#t-props'],
  ['admin-listing-editor', '/admin/#/p/HE-Q001', 'main h1', '#h-history'],
  ['admin-owner-report', '/admin/#/listings/HE-Q001/report', '#t-report', '#owner-report'],
  ['admin-queue', '/admin/#/queue', '#t-queue'],
  ['admin-viewings', '/admin/#/viewings', '#t-views'],
  ['admin-sales', '/admin/#/sales', '#t-sales'],
  ['admin-sale-detail', '/admin/#/sales/1', '#t-sale'],
  ['admin-rentals', '/admin/#/rentals', '#t-rentals'],
  ['admin-rental-detail', '/admin/#/rentals/1', '#t-rental'],
  ['admin-new-rental', '/admin/#/rentals/new', '#t-new-rental'],
  ['admin-rent-import', '/admin/#/rentals/import', '#t-import'],
  ['admin-statement', '/admin/#/rentals/statements?landlord=1', '#t-statement', '#statement'],
  ['admin-landlord', '/admin/#/rentals/landlords/1', '#t-landlord'],
  ['admin-insights', '/admin/#/insights', '#t-insights'],
  ['admin-weekly-insights', '/admin/#/insights/weekly/', '#weekly-insights-title', '.report[aria-busy="false"]'],
  ['admin-availability', '/admin/#/availability', '#t-avail'],
  ['admin-tours', '/admin/#/tours', '#t-tours'],
  ['admin-users', '/admin/#/users', '#t-users'],
  ['admin-automations', '/admin/#/automations', '#t-auto'],
];

function previousSavedWeek() {
  const now = new Date();
  const day = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Jersey'}).format(now);
  const time = new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Jersey', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(now);
  const date = new Date(day + 'T12:00:00Z');
  const weekday = (date.getUTCDay() + 6) % 7;
  // The saved week changes only after Monday's 08:00 Jersey reporting cutoff.
  date.setUTCDate(date.getUTCDate() - weekday - 7 - (weekday === 0 && time < '08:00' ? 7 : 0));
  return date.toISOString().slice(0, 10);
}

export async function runUiSmoke(context, {widths = [1280, 390]} = {}) {
  if (!Array.isArray(widths) || !widths.length || widths.some(n => !Number.isInteger(n) || n < 320 || n > 2560)) {
    throw new Error('Invalid QA viewport widths');
  }
  const checks = [];
  let consoleErrors = 0;
  for (const width of widths) {
    const page = await context.newPage();
    let errors = 0;
    page.on('console', message => { if (message.type() === 'error') errors++; });
    page.on('pageerror', () => { errors++; });
    try {
      await page.setViewportSize({width, height: 900});
      for (const [id, path, selector, ready = selector] of CASES) {
        const check = {case: `${id}-${width}`, passed: false, mode: 'readonly-ui'};
        const before = errors;
        let stage = 'navigation';
        try {
          const route = id === 'admin-weekly-insights' ? path + previousSavedWeek() : path;
          await page.goto(ORIGIN + route, {waitUntil: 'domcontentloaded', timeout: 20000});
          stage = 'content';
          await page.locator(selector).first().waitFor({state: 'visible', timeout: 12000});
          await page.locator(ready).first().waitFor({state: 'visible', timeout: 12000});
          const heading = await page.locator(selector).first().innerText();
          if (heading.trim().length < 2) throw new Error('Empty route heading');
          await page.waitForFunction(() => {
            const main = document.querySelector('main');
            return main && !/\bLoading(?:[ .…]|$)/i.test(main.innerText);
          }, null, {timeout: 12000});
          await page.waitForFunction(() => [...document.images].every(image => {
            const r = image.getBoundingClientRect();
            return !r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight || image.complete;
          }), null, {timeout: 8000});
          stage = 'layout';
          const result = await page.evaluate(() => {
            const root = document.querySelector('main');
            const visible = element => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
            };
            return {
              empty: !root || root.textContent.trim().length < 12,
              alerts: root ? root.querySelectorAll('[role="alert"].err').length : 0,
              overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
              brokenImages: [...document.images].filter(image => visible(image) && image.complete && image.naturalWidth === 0).length,
              invalidLinks: [...document.querySelectorAll('a[href]')].filter(a => {
                try {const u = new URL(a.href, location.href);return u.protocol !== 'https:' || u.origin !== location.origin;}
                catch {return true;}
              }).length,
            };
          });
          if (result.empty || result.alerts || result.overflow || result.brokenImages || result.invalidLinks) {
            check.failure = 'layout-or-isolation';
            check.layout = {empty: !!result.empty, overflow: !!result.overflow,
              brokenImages: Number(result.brokenImages), invalidLinks: Number(result.invalidLinks), alerts: Number(result.alerts || 0)};
          } else if (errors > before) check.failure = 'browser-error';
          else check.passed = true;
        } catch {
          check.failure = `route-${stage}-failed`;
        }
        check.consoleErrors = errors - before;
        checks.push(check);
      }
    } finally {
      consoleErrors += errors;
      await page.close();
    }
  }
  return {origin: ORIGIN, checks, consoleErrors, widths: [...widths],
    scope: 'Readonly route rendering and layout; provider and delivery integrations are not exercised.'};
}

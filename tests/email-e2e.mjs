// Build first. PW=/path/to/playwright-core CHROME=/path/to/chrome node tests/email-e2e.mjs [screenshot-dir]
// Real API + SQLite in memory + native binding fixture. No Cloudflare/Turnstile/email/DNS services are contacted.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { emailFixture } from "./email-browser.mjs";
const require=createRequire(import.meta.url), {chromium}=require(process.env.PW||"playwright-core");
const fixture=await emailFixture();
const browser=await chromium.launch({executablePath:process.env.CHROME,args:["--no-sandbox"]});
const shots=process.argv[2];if(shots)mkdirSync(shots,{recursive:true});
const errors=[];
try {
  const ctx=await browser.newContext({viewport:{width:1280,height:900}}), page=await ctx.newPage();
  page.on("pageerror",e=>errors.push(e.message));
  await page.route(/fonts\.googleapis|fonts\.gstatic|firebase|google\.com/,r=>r.abort());
  await page.goto(fixture.base+"/__test/sign-in");
  const card=page.locator("#email-settings");await card.waitFor();
  await card.getByText("Email service setup is not confirmed.",{exact:false}).waitFor();
  assert.equal(await card.getByLabel("Enable email sending").isDisabled(),true);
  assert.equal(fixture.sent.length,0);
  await card.getByLabel("Team email addresses").fill("team@example.test");
  await card.getByRole("button",{name:"Save email preferences"}).click();
  await card.getByText("Email preferences saved.",{exact:true}).waitFor();
  fixture.env.EMAIL_SERVICE_READY="true";await fixture.tick();
  await card.getByRole("button",{name:"Reload email preferences"}).click();
  await card.getByText("Email preferences reloaded.",{exact:true}).waitFor({timeout:2000});
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute("role")),"status","reloading preferences preserves keyboard focus");
  await card.getByLabel("Enable email sending").check();
  await card.getByLabel("Daily team summary at 08:00 Jersey time").check();
  assert.equal(await card.getByRole("button",{name:"Save email preferences"}).isDisabled(),true);
  await card.getByRole("button",{name:"Show sample summary"}).click();
  await card.locator(".email-sample pre").getByText("Hampton summary",{exact:false}).waitFor();
  await card.getByLabel("I authorize this summary to be sent daily to these team addresses.").check();
  await card.getByRole("button",{name:"Save email preferences"}).click();
  await card.getByText("Email preferences saved.",{exact:true}).waitFor();
  assert.match(await card.locator('[role="status"]').textContent(),/saved/);
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute("role")),"status","result receives focus");
  await fixture.tick();await fixture.tick();assert.equal(fixture.sent.length,1,"one summary despite duplicate ticks");
  await card.getByRole("button",{name:"Reload email preferences"}).click();
  await card.getByText("1 accepted by Cloudflare today",{exact:false}).waitFor();
  await fixture.receive();
  await page.getByRole("link",{name:"Email",exact:true}).click();
  await page.getByRole("heading",{name:"Email",exact:true}).waitFor();
  await page.getByRole("button",{name:/Reply <img/}).click();
  await page.locator(".email-body").getByText("<script>window.emailAttack=true</script>",{exact:false}).waitFor();
  assert.equal(await page.locator(".email-body script, .email-body img").count(),0);
  assert.equal(await page.evaluate(()=>window.emailAttack),undefined);
  page.once("dialog",d=>d.accept());
  await page.getByRole("button",{name:"Stop sending to this address"}).click();
  await page.getByText("Address suppressed. Pending sending to it is cancelled.",{exact:true}).waitFor();
  page.once("dialog",d=>d.accept());
  await page.getByRole("button",{name:"Delete email"}).click();
  await page.getByText("No received emails yet.",{exact:true}).waitFor();
  await fixture.receive();assert.equal(fixture.env.DB.raw.prepare("SELECT COUNT(*) n FROM email_inbound").get().n,0,"deletion tombstone");
  await page.getByRole("button",{name:"Outgoing",exact:true}).click();
  await page.getByRole("button",{name:/Hampton summary/}).click();
  await page.getByText("Accepted by Cloudflare",{exact:true}).waitFor();
  await page.getByText("Acceptance does not confirm delivery to the recipient's inbox.",{exact:true}).waitFor();
  if(shots)await page.screenshot({path:`${shots}/email-outgoing-desktop.png`,fullPage:true});
  // Long hostile content, pagination and tablet/mobile/zoom layout all use the same real API.
  for(let i=0;i<27;i++)await fixture.receive(`Local message ${i} ${"longword".repeat(70)}`,`Local reply ${i}`);
  await page.getByRole("button",{name:"Received",exact:true}).click();
  await page.getByRole("button",{name:"Older emails"}).click();
  await page.waitForFunction(()=>document.querySelectorAll(".email-list li button").length===2);
  assert.equal(await page.locator(".email-list li button").count(),2);
  await page.getByRole("button",{name:"Newest emails"}).click();
  await page.waitForFunction(()=>document.querySelectorAll(".email-list li button").length===25);
  const emailListUrl=page.url();
  // A failed detail read and retry recover; no browser-side fixture of the API's success response.
  let failOnce=true;
  await page.route("**/api/admin/email/inbound/*",async r=>{
    if(failOnce){failOnce=false;await r.fulfill({status:503,contentType:"application/json",body:'{"error":"Local read unavailable. Try again."}'});}
    else await r.continue();
  });
  await page.locator(".email-list li button").first().click();
  await page.getByRole("button",{name:"Retry loading email"}).click();
  await page.locator(".email-body").waitFor();
  await page.unroute("**/api/admin/email/inbound/*");
  for(const width of [390,1280]) {
    await page.setViewportSize({width,height:900});await page.goto(emailListUrl);await page.locator(".email-list li button").first().click();
    await page.locator(".email-body").waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no overflow ${width}`);
    if(shots)await page.screenshot({path:`${shots}/email-received-${width}.png`,fullPage:true});
    await page.evaluate(()=>document.documentElement.style.zoom="2");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no overflow at 200% ${width}`);
    await page.evaluate(()=>document.documentElement.style.zoom="");
    await page.goto(fixture.base+"/admin/#/automations");await card.waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`settings no overflow ${width}`);
    if(shots)await page.screenshot({path:`${shots}/email-settings-${width}.png`,fullPage:true});
    await card.getByRole("button",{name:"Show sample summary"}).focus();await page.keyboard.press("Enter");await card.locator(".email-sample").waitFor();
  }
  // Save error preserves the user's recipients; optimistic concurrency cannot silently overwrite a colleague.
  await card.getByLabel("Team email addresses").fill("other@example.test");
  await card.getByRole("button",{name:"Show sample summary"}).click();
  await card.getByLabel("I authorize this summary to be sent daily to these team addresses.").check();
  fixture.env.DB.raw.prepare("UPDATE app_settings SET value=json_set(value,'$.revision',99) WHERE key='email'").run();
  await card.getByRole("button",{name:"Save email preferences"}).click();
  await card.getByRole("alert").filter({hasText:"another tab"}).waitFor();
  assert.equal(await card.getByLabel("Team email addresses").inputValue(),"other@example.test");
  assert.deepEqual(errors,[]);assert.deepEqual(fixture.errors,[]);
  console.log("Email browser checks OK: configuration, recurrence, dedupe, MIME text, suppression, deletion, pagination, read/save recovery, 390/1280 and 200% zoom.");
} finally {await browser.close();await fixture.close();}

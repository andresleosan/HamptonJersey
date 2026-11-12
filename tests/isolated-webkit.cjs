// Existing Playwright journeys can use WebKit inside the disposable isolated test container.
const {webkit, chromium} = require('../playwright-core');
const {browsers} = require('../playwright-core/browsers.json');
const revision = browsers.find(browser=>browser.name === 'webkit')?.revision;
if (!revision) throw new Error('The Playwright Core WebKit revision is unavailable');
exports.chromium = { launch: async () => {
  const base=new URL(process.env.BASE);
  if (base.protocol !== 'https:' || !['127.0.0.1','localhost','[::1]'].includes(base.hostname))
    throw new Error('The isolated browser only connects to the local test fixture');
  // Chromium's own sandbox is disabled only for this disposable, networkless test container.
  // The container still drops capabilities and privileges and never mounts production data.
  const browser = process.env.HAMPTON_E2E_BROWSER === 'chromium'
    ? await chromium.launch({headless:true, executablePath:'/ms-playwright/chromium-1243/chrome-linux64/chrome', args:['--no-sandbox']})
    : await webkit.launch({headless:false,executablePath:`/work/webkit-${revision}/pw_run.sh`,
      env:{...process.env,WEBKIT_FORCE_SANDBOX:'1'}});
  const newContext=browser.newContext.bind(browser);
  browser.newContext=async options=>{
    // Miniflare's certificate is self-signed; the network namespace contains only this loopback fixture.
    const clipboard=options?.permissions?.some(permission=>permission.startsWith('clipboard-'));
    const permissions=options?.permissions?.filter(permission=>!permission.startsWith('clipboard-'));
    const context=await newContext({...options,...(permissions ? {permissions} : {}),ignoreHTTPSErrors:true});
    if(clipboard)await context.addInitScript(()=>{
      let text='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
        writeText:async value=>{text=value;},readText:async()=>text,
      }});
    });
    await context.route('https://challenges.cloudflare.com/turnstile/v0/api.js*',route=>route.fulfill({
      contentType:'text/javascript',body:`window.turnstile={render(el){const input=document.createElement('input');
        input.type='hidden';input.name='cf-turnstile-response';input.value='offline-test';el.append(input);return 'fixture';},
        reset(){},remove(){}};const ready=()=>window.onTurnstile?.();
        if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();`,
    }));
    return context;
  };
  return browser;
} };

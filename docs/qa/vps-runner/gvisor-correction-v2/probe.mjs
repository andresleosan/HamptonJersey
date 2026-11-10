// Offline compatibility gate only. No QA identity or published application requests.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export async function awaitGate(stream){
  let token='';
  for await(const chunk of stream.iterator({destroyOnReturn:false})){
    token+=chunk.toString('utf8');if(token.length>3)throw Error('gate-input');
    if(token==='GO\n')break; // Docker need not close the container's persistent stdin.
  }
  if(token!=='GO\n')throw Error('gate-input');
}

export function sandboxChecks(rows){
  const expected={'Layer 1 Sandbox':['namespace_sandbox','Namespace'],'PID namespaces':['pid_namespace','Yes'],'Network namespaces':['network_namespace','Yes'],'Seccomp-BPF sandbox':['seccomp_bpf','Yes'],'Seccomp-BPF sandbox supports TSYNC':['seccomp_tsync','Yes']};
  const checks=Object.fromEntries(Object.values(expected).map(([key])=>[key,false]));const seen=new Set();
  for(const row of rows){
    if(!Array.isArray(row)||row.length!==2||row.some(x=>typeof x!=='string'))throw Error('sandbox-row');
    const [label,value]=row.map(x=>x.trim());if(!Object.hasOwn(expected,label))continue;
    if(seen.has(label))throw Error('sandbox-duplicate');seen.add(label);
    const [key,wanted]=expected[label];checks[key]=value===wanted;
  }
  return checks;
}

export async function probe(chromium,readStatus=()=>fs.readFile('/proc/self/status','utf8'),uid=()=>process.getuid(),gid=()=>process.getgid()){
  const checks={};let browser,context,teardown=true,offNetwork=0,phase='process-boundary',failurePhase=null;
  try{
    const status=await readStatus();checks.non_root=uid()===1000&&gid()===1000;
    checks.no_caps=/^CapEff:\s+0+$/m.test(status);checks.no_new_privileges=/^NoNewPrivs:\s+1$/m.test(status);
    checks.oci_seccomp=/^Seccomp:\s+2$/m.test(status);
    if(!Object.values(checks).every(Boolean))throw Error('process-boundary');
    phase='browser-launch';browser=await chromium.launch({headless:true,chromiumSandbox:true,timeout:45000,args:['--disable-quic','--disable-background-networking']});
    phase='browser-context';
    context=await browser.newContext({serviceWorkers:'block',offline:true});
    await context.route('**/*',route=>{
      if(/^(?:data:|blob:|about:|chrome:)/.test(route.request().url()))return route.continue();
      offNetwork++;return route.abort();
    });
    phase='sandbox-page';const page=await context.newPage();await page.goto('chrome://sandbox/',{timeout:15000});
    await page.waitForFunction(()=>document.querySelectorAll('tr').length>=5,{},{timeout:5000});
    const rows=await page.evaluate(()=>Array.from(document.querySelectorAll('tr')).map(tr=>Array.from(tr.querySelectorAll('th,td')).map(td=>td.textContent.trim())).filter(r=>r.length===2));
    Object.assign(checks,sandboxChecks(rows));
    phase='renderer';await page.goto('data:text/html,<title>QA offline sandbox probe</title>',{timeout:15000});
    checks.renderer=(await page.title())==='QA offline sandbox probe';
    phase='worker';checks.worker=await page.evaluate(()=>new Promise(resolve=>{
      const url=URL.createObjectURL(new Blob(['postMessage(42)'],{type:'text/javascript'}));const worker=new Worker(url);
      let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);resolve(value);};
      const timer=setTimeout(()=>finish(false),5000);worker.onmessage=e=>finish(e.data===42);worker.onerror=()=>finish(false);
    }));
  }catch{checks.diagnostic_completed=false;failurePhase=phase;}
  finally{
    try{if(context)await context.close();}catch{teardown=false;}
    try{if(browser)await browser.close();}catch{teardown=false;}
    if(!teardown)failurePhase='teardown';checks.browser_closed=teardown;checks.no_network_requests=offNetwork===0;
  }
  const required=['non_root','no_caps','no_new_privileges','oci_seccomp','namespace_sandbox','pid_namespace','network_namespace','seccomp_bpf','seccomp_tsync','renderer','worker','browser_closed','no_network_requests'];
  return {kind:'offline-gvisor-Chromium-sandbox-probe-v2',checks,passed:required.every(k=>checks[k]===true)&&!Object.hasOwn(checks,'diagnostic_completed'),credentials_loaded:false,published_requests:0,failure_phase:failurePhase};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const watchdog=setTimeout(()=>process.exit(2),120000);
  let result,phase='gate';
  try{
    await awaitGate(process.stdin);
    phase='sdk-import';const {chromium}=await import('/work/node_modules/playwright-core/index.mjs');result=await probe(chromium);
  }
  catch{result={kind:'offline-gvisor-Chromium-sandbox-probe-v2',checks:{diagnostic_completed:false},passed:false,credentials_loaded:false,published_requests:0,failure_phase:phase};}
  process.stdout.write(JSON.stringify(result)+'\n',()=>{clearTimeout(watchdog);process.exit(result.passed?0:1);});
}

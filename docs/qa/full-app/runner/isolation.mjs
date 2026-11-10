// Proposed E checks only; never inject identity or run application workflows here.
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const checks = {};
async function cannotConnect(host, port) {
  return new Promise(resolve => {
    const socket = net.connect({ host, port });
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    for (const event of ['error', 'timeout']) socket.once(event, () => { socket.destroy(); resolve(true); });
  });
}
async function proxyDenied(authority) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '172.30.230.2', port: 3128 });
    let response = '';
    socket.setTimeout(2500);
    socket.once('connect', () => socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`));
    socket.on('data', data => {
      response += data.toString('ascii');
      if (response.includes('\r\n')) { socket.destroy(); resolve(/^HTTP\/1\.[01] 403 /.test(response)); }
    });
    for (const event of ['error', 'timeout', 'end']) socket.once(event, () => { socket.destroy(); resolve(false); });
  });
}
async function deniedWrite(path) {
  try { await fs.writeFile(path, 'QA isolation check', { flag: 'wx' }); return false; }
  catch (e) { return ['EROFS', 'EACCES', 'EPERM'].includes(e.code); }
}
async function tlsProxyCheck(sni, host = null, allowHandshakeDenial = false) {
  let socket;
  try {
    socket = await new Promise((resolve, reject) => {
      const tunnel = net.connect({ host: '172.30.230.2', port: 3128 });
      let response = '';
      tunnel.setTimeout(3000);
      tunnel.once('connect', () => tunnel.write('CONNECT hamptonjersey-qa.pages.dev:443 HTTP/1.1\r\nHost: hamptonjersey-qa.pages.dev:443\r\n\r\n'));
      tunnel.on('data', data => {
        response += data.toString('ascii');
        if (response.includes('\r\n\r\n')) {
          tunnel.removeAllListeners('data');
          if (/^HTTP\/1\.[01] 200 /.test(response)) resolve(tunnel);
          else { tunnel.destroy(); reject(new Error('CONNECT failed')); }
        }
      });
      for (const event of ['error', 'timeout', 'end']) tunnel.once(event, () => { tunnel.destroy(); reject(new Error('Tunnel failed')); });
    });
    return await new Promise(resolve => {
      let secured = false, response = '';
      const secure = tls.connect({ socket, servername: sni, rejectUnauthorized: false });
      secure.setTimeout(3000);
      secure.once('secureConnect', () => {
        secured = true;
        if (host === null) { secure.destroy(); resolve(true); }
        else secure.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
      });
      secure.on('data', data => {
        response += data.toString('ascii');
        if (response.includes('\r\n')) { secure.destroy(); resolve(/^HTTP\/1\.[01] 403 /.test(response)); }
      });
      for (const event of ['error', 'timeout', 'end', 'close']) secure.once(event, () => {
        secure.destroy(); resolve(allowHandshakeDenial && !secured && event !== 'timeout');
      });
    });
  } catch { socket?.destroy(); return false; }
}
try {
  checks.non_root = process.getuid() === 1000 && process.getgid() === 1000;
  const status = await fs.readFile('/proc/self/status', 'utf8');
  checks.no_caps = /^CapEff:\s+0+$/m.test(status);
  checks.no_new_privileges = /^NoNewPrivs:\s+1$/m.test(status);
  const mounts = await fs.readFile('/proc/self/mountinfo', 'utf8');
  const readonlyMount = target => mounts.split('\n').some(line => {
    const fields = line.split(' '); return fields[4] === target && fields[5].split(',').includes('ro');
  });
  checks.root_readonly = readonlyMount('/') && await deniedWrite('/qa-isolation-root-probe');
  checks.code_readonly = readonlyMount('/work') && await deniedWrite('/work/qa-isolation-code-probe');
  checks.no_profile_or_docker_socket = !mounts.match(/docker\.sock|\/host_mnt\/c\/Users|\.codex|\.wrangler|\.ssh|\/\.git/);
  const routes = await fs.readFile('/proc/net/route', 'utf8');
  checks.no_default_route = !routes.split('\n').slice(1).some(line => line.split(/\s+/)[1] === '00000000');
  checks.no_direct_internet = await cannotConnect('1.1.1.1', 443);
  checks.no_metadata = await cannotConnect('169.254.169.254', 80);
  checks.no_host_gateway = await cannotConnect('172.30.230.1', 80);
  checks.no_host_special_name = await cannotConnect('host.docker.internal', 80);
  checks.no_direct_lan = await cannotConnect('192.168.0.1', 80);
  checks.no_proxy_external_nic = await cannotConnect('172.30.231.2', 3128);
  const resolver = new dns.Resolver({ timeout: 1000, tries: 1 });
  try { await resolver.resolve4('example.com'); checks.no_external_dns = false; }
  catch { checks.no_external_dns = true; }
  checks.proxy_denies_arbitrary_host = await proxyDenied('forbidden.example.test:443');
  checks.proxy_denies_private_ip = await proxyDenied('169.254.169.254:443');
  checks.proxy_denies_other_port = await proxyDenied('hamptonjersey-qa.pages.dev:444');
  checks.proxy_local_tls_handshake = await tlsProxyCheck('hamptonjersey-qa.pages.dev');
  checks.proxy_denies_tls_host_switch = await tlsProxyCheck('hamptonjersey-qa.pages.dev', 'forbidden.example.test');
  checks.proxy_denies_tls_sni_switch = await tlsProxyCheck('challenges.cloudflare.com', 'challenges.cloudflare.com', true);
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    proxy: { server: 'http://172.30.230.2:3128' },
    args: ['--disable-quic', '--disable-background-networking', '--proxy-bypass-list=<-loopback>'] });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.goto('data:text/html,<title>QA isolation only</title>');
    checks.chromium_sandbox_launch = (await page.title()) === 'QA isolation only';
    try { await page.goto('https://forbidden.example.test/', { timeout: 4000 }); checks.browser_forbidden_host = false; }
    catch { checks.browser_forbidden_host = true; }
    await context.close();
  } finally { await browser.close(); }
} catch { checks.diagnostic_completed = false; }
const pass = Object.values(checks).every(value => value === true) && Object.keys(checks).length >= 22;
const result = { kind: 'E-isolation-only', checks, passed: pass, credentials_loaded: false, application_smoke_run: false };
await fs.writeFile('/results/isolation.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
process.stdout.write(JSON.stringify({ passed: pass, checks: Object.keys(checks).length }) + '\n');
process.exitCode = pass ? 0 : 1;

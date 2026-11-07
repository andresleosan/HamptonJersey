const { spawn } = require('node:child_process');
function run(command, args, { env = process.env, signal } = {}) {
  if (signal?.aborted) return Promise.reject(Error('E2E command cancelled'));
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    let cancelled = false;
    const abort = () => { cancelled = true; child.kill('SIGTERM'); };
    const detach = () => signal?.removeEventListener('abort', abort);
    child.once('error', error => { detach(); reject(error); });
    child.once('close', (code, terminated) => {
      detach();
      if (cancelled) reject(Error('E2E command cancelled'));
      else if (code === 0) resolve();
      else reject(Error(`${command} failed (${terminated || code})`));
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
module.exports = { run };

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { run } = require('./e2e-process.cjs');

test('cancelled E2E commands finish before their fixture can be removed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-process-'));
  const ready = join(dir, 'ready'), closed = join(dir, 'closed');
  const controller = new AbortController();
  const script = `const fs=require('node:fs');
    process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync(process.argv[2],'closed');process.exit(0)},100));
    fs.writeFileSync(process.argv[1],'ready');setInterval(()=>{},1000);`;
  const result = run(process.execPath, ['-e', script, ready, closed], { signal: controller.signal });
  const rejected = assert.rejects(result);
  try {
    for (let i = 0; i < 300 && !existsSync(ready); i++) await delay(10);
    assert.ok(existsSync(ready), 'child started');
    controller.abort();
    await rejected;
    assert.ok(existsSync(closed), 'abort waits for the child to finish before fixture cleanup');
  } finally {
    controller.abort();
    for (let i = 0; i < 100 && !existsSync(closed); i++) await delay(10);
    rmSync(dir, { recursive: true });
  }
});

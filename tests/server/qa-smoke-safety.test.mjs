import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const script=join(repo,'scripts/smoke-qa-history.cjs');
function run(file,cwd){
  return spawnSync(process.execPath,[script],{cwd,encoding:'utf8',env:{...process.env,
    QA_LOCAL:'1',BASE:'http://127.0.0.1:9/',QA_HISTORY_KEY_FILE:file,PW:'/missing-playwright'}});
}
test('QA key inside the actual repository is rejected even when launched elsewhere',()=>{
  const within=mkdtempSync(join(repo,'.qa-safety-'));
  const outside=mkdtempSync(join(tmpdir(),'hampton-qa-outside-'));
  try{
    const file=join(within,'synthetic.key');
    writeFileSync(file,'local-fixture-qa-key-not-for-production-012345\n',{mode:0o600});
    const result=run(file,outside);
    assert.equal(result.status,1);
    assert.match(result.stderr,/cannot be in the repository/);
  }finally{rmSync(within,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});}
});
test('local QA mode refuses an arbitrary bearer key before any browser or network call',()=>{
  const outside=mkdtempSync(join(tmpdir(),'hampton-qa-outside-'));
  try{
    const file=join(outside,'wrong.key');
    writeFileSync(file,'not-a-production-key-just-a-different-local-test\n',{mode:0o600});
    const result=run(file,outside);
    assert.equal(result.status,1);
    assert.match(result.stderr,/requires the synthetic fixture identity/);
  }finally{rmSync(outside,{recursive:true,force:true});}
});

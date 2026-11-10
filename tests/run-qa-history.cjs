// Isolated two-D1 fixture for the QA smoke; no production credentials or DB.
const {mkdtempSync,writeFileSync,chmodSync,rmSync,readFileSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {tmpdir}=require('node:os');
const {randomBytes}=require('node:crypto');
const {parseEnv}=require('node:util');
const {startFixture,QA_TEST_DB_ID}=require('./serve-e2e.cjs');
const {run}=require('./e2e-process.cjs');
const key='local-fixture-qa-key-not-for-production-012345';
(async()=>{
  const dir=mkdtempSync(join(tmpdir(),'hampton-qa-history-'));chmodSync(dir,0o700);
  let fixture;
  try{
    const example=parseEnv(readFileSync('.dev.vars.example','utf8'));
    const varsFile=join(dir,'fixture.vars'),keyFile=join(dir,'qa.key'),persist=join(dir,'state');
    writeFileSync(varsFile,[`SESSION_SECRET=${randomBytes(32).toString('hex')}`,
      `QA_HISTORY_KEY=${key}`,'QA_HISTORY_ACTIVE=true',`TURNSTILE_SITE_KEY=${example.TURNSTILE_SITE_KEY}`,
      `TURNSTILE_SECRET=${example.TURNSTILE_SECRET}`].join('\n')+'\n',{mode:0o600});
    writeFileSync(keyFile,key+'\n',{mode:0o600});
    const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
    const vite=join(dirname(require.resolve('vite/package.json')),'bin','vite.js');
    await run(process.execPath,['scripts/check-release.mjs']);
    await run(process.execPath,[vite,'build','--config','admin/vite.config.mjs']);
    await run(process.execPath,[wrangler,'d1','migrations','apply','hampton','--local','--persist-to',persist]);
    await run(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',persist,
      '--file','tests/fixtures/seed.sql']);
    const config=join(dir,'qa.toml');
    writeFileSync(config,`name = "hampton-qa-fixture"\ncompatibility_date = "2025-10-01"\n`+
      `[[d1_databases]]\nbinding = "QA_DB"\ndatabase_name = "hampton-qa-fixture"\n`+
      `database_id = "${QA_TEST_DB_ID}"\nmigrations_dir = "${join(process.cwd(),'migrations')}"\n`,{mode:0o600});
    await run(process.execPath,[wrangler,'d1','migrations','apply','hampton-qa-fixture','--local',
      '--persist-to',persist,'--config',config]);
    await run(process.execPath,[wrangler,'d1','execute','hampton-qa-fixture','--local',
      '--persist-to',persist,'--config',config,'--file','tests/fixtures/qa-history.sql']);
    fixture=await startFixture({persist,varsFile,port:0,qaDb:true});
    await run(process.execPath,['scripts/smoke-qa-history.cjs'],{env:{...process.env,QA_LOCAL:'1',
      BASE:fixture.url.href,QA_HISTORY_KEY_FILE:keyFile}});
  }finally{
    if(fixture)await fixture.close();
    rmSync(dir,{recursive:true,force:true});
  }
})().catch(e=>{console.error('Isolated QA fixture failed:',e.message);process.exitCode=1});

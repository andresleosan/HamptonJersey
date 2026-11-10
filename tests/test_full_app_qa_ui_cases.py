"""Contracts for the readonly UI case runner; browser execution belongs to main."""
from pathlib import Path
import subprocess
import unittest


MODULE = Path(__file__).resolve().parents[1] / 'docs/qa/full-app/publish/runner/ui-cases.mjs'


class UiCaseRunnerTests(unittest.TestCase):
    def test_runner_visits_both_sizes_and_returns_only_sanitized_failures(self):
        self.assertTrue(MODULE.is_file(), 'Readonly route runner is not implemented')
        script = r'''
const assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
(async()=>{
  const {runUiSmoke}=await import(pathToFileURL(process.argv[1]));
  const RealDate=Date;let now='2026-11-10T12:00:00.000Z';
  global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}};
  const visits=[],sizes=[],pages=[],weeklyReadiness=[];
  const context={async newPage(){
    const handlers={};let current='';const page={
      on:(name,fn)=>handlers[name]=fn,
      setViewportSize:async value=>sizes.push(value.width),
      goto:async url=>{current=url;visits.push(url);if(url.endsWith('/properties'))throw Error('private@example.test confidential-url');},
      locator:selector=>({first(){return this},waitFor:async()=>{if(current.includes('/insights/weekly'))weeklyReadiness.push(selector);},innerText:async()=>'Meaningful fictional QA page content',count:async()=>1}),
      evaluate:async()=>({overflow:false,brokenImages:0,invalidLinks:0,empty:false}),
      waitForFunction:async()=>{},
      close:async()=>{page.closed=true},
    };pages.push(page);return page;
  }};
  const result=await runUiSmoke(context);
  assert.deepEqual([...new Set(sizes)],[1280,390]);
  assert.equal(result.checks.filter(c=>c.case==='public-properties-1280'&&!c.passed).length,1);
  assert.equal(result.checks.filter(c=>c.case==='admin-listings-390'&&c.passed).length,1);
  assert.equal(result.checks.filter(c=>c.mode==='readonly-ui').length,result.checks.length);
  assert.ok(visits.every(u=>u.startsWith('https://hamptonjersey-qa.pages.dev/')));
  assert.ok(pages.every(p=>p.closed));
  const serialized=JSON.stringify(result);
  assert.ok(!serialized.includes('private@example.test'));
  assert.ok(!serialized.includes('confidential-url'));
  assert.ok(result.checks.length>=60);
  assert.ok(visits.includes('https://hamptonjersey-qa.pages.dev/admin/#/insights/weekly/2026-11-02'),'Weekly report route requires a real Monday');
  assert.ok(weeklyReadiness.includes('.report[aria-busy="false"]'),'An empty loaded snapshot is a valid report');
  now='2026-11-09T07:59:00.000Z';
  await runUiSmoke(context,{widths:[390]});
  assert.ok(visits.includes('https://hamptonjersey-qa.pages.dev/admin/#/insights/weekly/2026-10-26'),'Monday before the reporting cutoff uses the preceding saved week');
})().catch(e=>{console.error(e);process.exitCode=1});
'''
        result = subprocess.run(['node', '-e', script, str(MODULE)], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()

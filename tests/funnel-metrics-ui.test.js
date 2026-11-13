const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
let vite, MilestonesReport;

test.before(async () => {
  const {createServer} = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  vite = await createServer({configFile:false,plugins:[react()],server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  ({MilestonesReport} = await vite.ssrLoadModule('/admin/src/SearchMilestones.jsx'));
});
test.after(async () => { if (vite) await vite.close(); });

const fixture = () => ({
  cohort:{unit:'search_record',count:2,from:'2026-10-19',to:'2026-10-25',operation:'transfer',category:'commercial'},
  observed_stages:[{stage:'new',count:0},{stage:'searching',count:0},{stage:'viewing',count:0},
    {stage:'offer',count:0},{stage:'agreed',count:1},{stage:'completed',count:0},{stage:'paused',count:0},{stage:'lost',count:0}],
  verified_business:Object.fromEntries(['viewing_completed','offer','agreed','completed'].map(key =>
    [key,{count:null,source:null,coverage:'not_integrated'}])),
  coverage:{measured_from:null,observed_until:'2026-10-26T00:00:00.000Z',excluded_invalid:1,
    missing_producers:['viewing_completed','offer','agreed','completed'],deleted_history_unknown:true},
});
function render(data) {
  return new JSDOM(renderToStaticMarkup(React.createElement(MilestonesReport,{data}))).window.document;
}
function rows(table) { return [...table.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(c => c.textContent.trim())); }

test('explicit search stages are independent and use search records as the denominator', () => {
  const doc=render(fixture()), text=doc.body.textContent;
  assert.match(text,/2 search records/);
  assert.match(text,/one contact.*more than one search/i);
  assert.match(text,/not.*sequence/i);
  assert.match(text,/19 Oct 2026.*25 Oct 2026/s);
  assert.match(text,/Transfer.*Commercial/s);
  const table=doc.querySelector('table[aria-label="Recorded search stages"]');
  assert.ok(table);
  assert.deepEqual(rows(table).find(row=>row[0]==='Viewing'),['Viewing','0']);
  assert.deepEqual(rows(table).find(row=>row[0]==='Agreed'),['Agreed','1']);
  assert.equal(doc.querySelectorAll('a').length,0);
});

test('a zero recorded stage remains distinct from an unintegrated verified milestone', () => {
  const doc=render(fixture());
  const observed=rows(doc.querySelector('table[aria-label="Recorded search stages"]'));
  const verified=rows(doc.querySelector('table[aria-label="Verified milestones"]'));
  assert.deepEqual(observed.find(row=>row[0]==='Viewing'),['Viewing','0']);
  assert.deepEqual(verified.find(row=>row[0]==='Viewing completed'),['Viewing completed','Not integrated']);
  assert.match(doc.body.textContent,/recorded.*viewing.*not.*completed/i);
  assert.match(doc.body.textContent,/deleted.*history.*unknown/i);
  assert.match(doc.body.textContent,/1 invalid event/i);
  assert.doesNotMatch(doc.body.textContent,/conversion.*web/i);
});

test('a genuine integrated zero is shown as zero and not as missing', () => {
  const data=fixture(); data.verified_business.offer={count:0,source:'approved_source',coverage:'integrated'};
  const verified=rows(render(data).querySelector('table[aria-label="Verified milestones"]'));
  assert.deepEqual(verified.find(row=>row[0]==='Offer'),['Offer','0']);
});

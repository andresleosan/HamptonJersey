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
  verified_business:{viewing_completed:{count:null,source:null,latest_at:null,coverage:'not_recorded'},
    offer:{count:2,source:'offers',latest_at:'2026-10-25T10:00:00.000Z',coverage:'recorded'},
    agreed:{count:1,source:'sales',latest_at:'2026-10-25T09:30:00.000Z',coverage:'recorded'},
    completed:{count:0,source:'sales',latest_at:null,coverage:'recorded'},
    search_closed:{count:1,source:'search_state',latest_at:'2026-10-25T12:00:00.000Z',coverage:'recorded'}},
  coverage:{measured_from:null,observed_until:'2026-10-26T00:00:00.000Z',excluded_invalid:1,
    missing_producers:['viewing_completed'],deleted_history_unknown:true},
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

test('a zero recorded stage remains distinct from a milestone with no source', () => {
  const doc=render(fixture());
  const observed=rows(doc.querySelector('table[aria-label="Recorded search stages"]'));
  const verified=rows(doc.querySelector('table[aria-label="Verified milestones"]'));
  assert.deepEqual(observed.find(row=>row[0]==='Viewing'),['Viewing','0']);
  assert.deepEqual(verified.find(row=>row[0]==='Viewing completed'),['Viewing completed','Not recorded','—','—']);
  assert.match(doc.body.textContent,/viewings are not linked to a search/i);
  assert.match(doc.body.textContent,/recorded.*viewing.*not.*completed/i);
  assert.match(doc.body.textContent,/deleted.*history.*unknown/i);
  assert.match(doc.body.textContent,/1 invalid event/i);
  assert.doesNotMatch(doc.body.textContent,/conversion.*web/i);
});

test('each verified milestone shows its count, its source and its last date; a real zero stays zero', () => {
  const verified=rows(render(fixture()).querySelector('table[aria-label="Verified milestones"]'));
  const [offer,agreed,completed,closed]=['Offer','Agreed','Completed','Search closed'].map(m=>verified.find(row=>row[0]===m));
  assert.deepEqual(offer.slice(0,3),['Offer','2','Offers']);
  assert.match(offer[3],/25 Oct 2026/);
  assert.deepEqual(agreed.slice(0,3),['Agreed','1','Sales']);
  assert.deepEqual(completed,['Completed','0','Sales','—']);
  assert.deepEqual(closed.slice(0,3),['Search closed','1','Search state']);
  assert.deepEqual([...render(fixture()).querySelectorAll('table[aria-label="Verified milestones"] thead th')].map(th=>th.textContent),
    ['Measure','Search records','Source','Last recorded']);
});

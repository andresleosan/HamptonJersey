import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const Module = require('node:module');
const filename = fileURLToPath(new URL('../../admin/src/RegistrationEssentials.jsx', import.meta.url));
const bundle = await build({ entryPoints:[filename], bundle:true, platform:'node', format:'cjs', jsx:'automatic',
  external:['react','react/jsx-runtime'], write:false, logLevel:'silent' });
const compiled = new Module(filename);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(bundle.outputFiles[0].text, filename);
const Panel = compiled.exports.default;
const render = applicant => renderToStaticMarkup(React.createElement(Panel, {applicant,formRef:{current:null}}));
const base = {search_category:'residential',operation:'rent',search_state:'active',archived_at:null,
  pets:[], near:'SYNTHETIC PRIVATE MARKER', requirement_priorities:{version:1,values:{pets:'must',near:'unknown'},unknown:['pets']}};

test('saved missing answers and priority review are visible without private values or matching claims', () => {
  const html = render(base);
  assert.match(html, /Details to confirm/);
  assert.match(html, /Confirm Pets/);
  assert.match(html, /Review Near somewhere must-have priority/);
  assert.match(html, /Based on the saved residential search/);
  assert.match(html, /does not show matching progress/);
  assert.doesNotMatch(html, /SYNTHETIC PRIVATE MARKER/);
  assert.doesNotMatch(html, /matches found|check completed/i);
});

test('does not present a projection for resolved, archived or review-pending searches', () => {
  for (const override of [{search_state:'resolved'}, {search_state:'needs_review'}, {archived_at:'2026-11-01'}])
    for (const search_category of ['residential', 'commercial']) assert.equal(render({...base,...override,search_category}), '');
  assert.equal(render(null), '');
});

test('REG-12: an active commercial search shows the details its matching still needs, without residential wording', () => {
  const html = render({...base, search_category:'commercial', commercial_kind:'property', area_answer:'any',
    commercial_use:null, commercial_rent:null});
  assert.match(html, /Details to confirm/);
  assert.match(html, /Based on the saved commercial search/);
  assert.match(html, /Matches are not checked against details that were not given/);
  assert.deepEqual([...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(m => m[1]), ['Confirm Intended use', 'Confirm Maximum rent']);
  assert.doesNotMatch(html, /residential|must-have|Pets|SYNTHETIC PRIVATE MARKER|matches found|check completed/i);
  assert.equal(render({...base, search_category:'commercial', commercial_kind:'property', area_answer:'any',
    commercial_use:'Cafe', commercial_rent:1200, commercial_rent_period:'month'}), '');
});

test('missing priorities get one review action; no issues gives no all-clear message', () => {
  assert.match(render({...base,requirement_priorities:null}), /Review must-have priorities/);
  assert.equal(render({...base,requirement_priorities:{version:1,values:{},unknown:[]}}), '');
});

test('contradictory answer and priority show distinct review actions without naming either optional', () => {
  const html=render({...base,pets:[{kind:'none'}],requirement_priorities:{version:1,values:{pets:'unknown'},unknown:['pets']}});
  assert.match(html,/Confirm Pets/);
  assert.match(html,/Review Pets must-have priority/);
  assert.doesNotMatch(html,/optional|preferred/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { focusSearchEssential } from '../../admin/src/registration-essentials.js';
const require=createRequire(import.meta.url), {build}=require('esbuild'), React=require('react');
const {renderToStaticMarkup}=require('react-dom/server'), Module=require('node:module');
const filename=fileURLToPath(new URL('../../admin/src/RequirementSwitch.jsx',import.meta.url));
const bundle=await build({entryPoints:[filename],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],loader:{'.css':'empty'},write:false,logLevel:'silent'});
const compiled=new Module(filename); compiled.filename=filename; compiled.paths=Module._nodeModulePaths(path.dirname(filename)); compiled._compile(bundle.outputFiles[0].text,filename);
const Control=compiled.exports.default;
const render=priority=>new JSDOM(renderToStaticMarkup(React.createElement(Control,{criterion:'near',priority,onChange:()=>{}}))).window.document;

test('unknown and missing priorities are explicitly unconfirmed, with two choices and no false switch',()=>{
  for(const priority of ['unknown',undefined,'unrecognised']) {
    const doc=render(priority);
    assert.match(doc.body.textContent,/Priority to confirm/);
    assert.equal(doc.querySelector('[role=switch]'),null);
    assert.equal(doc.querySelectorAll('button').length,2);
    assert.match(doc.body.textContent,/Must-have/);
    assert.match(doc.body.textContent,/Preferred/);
    assert.doesNotMatch(doc.body.textContent,/\bOff\b/);
  }
});

test('known priorities retain binary switch and focus review reaches unknown choice',()=>{
  assert.equal(render('must').querySelector('[role=switch]').getAttribute('aria-checked'),'true');
  assert.equal(render('preferred').querySelector('[role=switch]').getAttribute('aria-checked'),'false');
  const doc=render('unknown'), form=doc.createElement('form'); form.append(...doc.body.childNodes); doc.body.append(form);
  focusSearchEssential(form,{key:'near',label:'Near somewhere',reason:'priority_missing'});
  assert.equal(doc.activeElement.getAttribute('data-priority-review'),'near');
});

test('validation marks each unknown choice and links the error message',()=>{
  const doc=new JSDOM(renderToStaticMarkup(React.createElement(Control,{criterion:'near',priority:'unknown',invalid:true,onChange:()=>{}}))).window.document;
  for (const button of doc.querySelectorAll('button')) {
    assert.equal(button.getAttribute('aria-invalid'),'true');
    assert.equal(button.getAttribute('aria-describedby'),'ae-requirement_priorities');
  }
});

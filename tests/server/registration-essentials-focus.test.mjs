import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { focusSearchEssential } from '../../admin/src/registration-essentials.js';

function setup() {
  const dom = new JSDOM(`<form><input name="a-area_answer"><input name="a-property_types">
    <input id="a-bedrooms_min"><input id="a-outdoor-garden"><fieldset id="a-pets"><input></fieldset>
    <button type="button" role="switch" aria-label="Bedrooms must-have"></button>
    <button type="button" role="switch" aria-label="Garden must-have" disabled></button></form>`);
  return { doc: dom.window.document, form: dom.window.document.querySelector('form') };
}

test('missing answers focus the corresponding control', () => {
  const {doc, form} = setup();
  for (const [key, selector] of [['area','[name="a-area_answer"]'],['type','[name="a-property_types"]'],
    ['bedrooms','#a-bedrooms_min'],['garden','#a-outdoor-garden'],['pets','#a-pets input']]) {
    focusSearchEssential(form, {key,reason:'answer_missing'});
    assert.equal(doc.activeElement, form.querySelector(selector));
  }
});

test('priority review focuses its switch, with a safe field fallback if disabled', () => {
  const {doc,form} = setup();
  focusSearchEssential(form, {key:'bedrooms',label:'Bedrooms',reason:'priority_missing'});
  assert.equal(doc.activeElement.getAttribute('aria-label'),'Bedrooms must-have');
  focusSearchEssential(form, {key:'garden',label:'Garden',reason:'priority_missing'});
  assert.equal(doc.activeElement.id,'a-outdoor-garden');
  focusSearchEssential(form, {key:'requirement_priorities',reason:'priority_missing'});
  assert.equal(doc.activeElement.getAttribute('aria-label'),'Bedrooms must-have');
  assert.doesNotThrow(() => focusSearchEssential(null, {key:'area',reason:'answer_missing'}));
  assert.doesNotThrow(() => focusSearchEssential(form, {key:'unsupported',reason:'answer_missing'}));
  assert.doesNotThrow(() => focusSearchEssential(form, {key:'toString',reason:'answer_missing'}));
});

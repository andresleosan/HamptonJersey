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

test('REG-12: a pending commercial detail focuses its control', () => {
  const dom = new JSDOM(`<form><input type="radio" name="a-commercial_kind"><input name="a-area_answer">
    <input id="a-commercial_use"><select id="a-area_unit"></select><input id="a-commercial_purchase"><input id="a-commercial_rent">
    <select id="a-commercial_rent_period"></select><input id="a-commercial_premium"></form>`);
  const doc = dom.window.document, form = doc.querySelector('form');
  for (const [key, selector] of [['commercial_kind','[name="a-commercial_kind"]'],['area','[name="a-area_answer"]'],
    ['commercial_use','#a-commercial_use'],['area_unit','#a-area_unit'],['commercial_purchase','#a-commercial_purchase'],
    ['commercial_rent','#a-commercial_rent'],['commercial_rent_period','#a-commercial_rent_period'],['commercial_premium','#a-commercial_premium']]) {
    focusSearchEssential(form, {key,reason:'answer_missing'});
    assert.equal(doc.activeElement, form.querySelector(selector), key);
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

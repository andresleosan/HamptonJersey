import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateInput} from '../docs/qa/full-app/publish/runner/input.mjs';
const sample=()=>({runId:'run-unit',buildId:'0'.repeat(64),accessClientId:'unit-placeholder-identifier',
  accessClientSecret:'unit-placeholder-value',sessionSecret:'1'.repeat(64)});
test('input fixes run/build structure and rejects extra destinations/identity/code',()=>{
  assert.doesNotThrow(()=>validateInput(sample()));
  for(const extra of [{origin:'https://outside.example.test'}, {email:'someone@example.test'}, {script:'anything'}])
    assert.throws(()=>validateInput({...sample(),...extra}));
  for(const field of ['runId','buildId','accessClientId','accessClientSecret','sessionSecret']){
    const bad=sample();delete bad[field];assert.throws(()=>validateInput(bad));
  }
});
test('credential/header controls reject newlines and invalid secret shape without value in error',()=>{
  const bad=sample();bad.accessClientSecret='bad\r\nheader-sensitive';
  assert.throws(()=>validateInput(bad),error=>!error.message.includes('sensitive'));
  const other=sample();other.sessionSecret='invalid';assert.throws(()=>validateInput(other));
});

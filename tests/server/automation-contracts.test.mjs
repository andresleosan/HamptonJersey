import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let contracts;
try { contracts = await import('../../server/automation-contracts.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const need = () => assert.ok(contracts, 'AUT-09 registry has not been implemented');
const hard = ['match_approval','unknown_required_consultation','search_resolution','presentation_review'];

test('closed registry rejects unknown and prototype IDs', () => {
  need();
  assert.throws(() => contracts.getAutomationDefinition('unknown'), /unknown/i);
  assert.throws(() => contracts.getAutomationDefinition('__proto__'), /unknown/i);
  assert.deepEqual(contracts.validateDefinition({id:'unknown'}).valid, false);
});

test('purposes are distinct, versioned and keep mandatory human decisions', () => {
  need();
  const ids=['listing_text','market_ambiguity_v1','hampton_intent_v1'];
  const definitions=contracts.listAutomationDefinitions();
  assert.deepEqual(definitions.map(d=>d.id), ids);
  assert.equal(new Set(definitions.map(d=>`${d.id}:${d.version}`)).size, ids.length);
  assert.deepEqual(definitions.map(d=>d.purpose),ids);
  for (const definition of definitions) {
    assert.equal(contracts.validateDefinition(definition).valid,true,definition.id);
    assert.ok(definition.operations.length>0);
    assert.equal(new Set(definition.operations).size,definition.operations.length);
    for (const gate of hard) assert.ok(definition.hard_human_decisions.includes(gate),`${definition.id}:${gate}`);
    assert.ok(definition.required_gates.includes('human_review'));
    assert.equal(definition.input_classes.includes('C3'),false);
  }
});

test('returned definitions cannot mutate the authority used by future consumers', () => {
  need();
  const original=contracts.getAutomationDefinition('listing_text');
  const modified=contracts.getAutomationDefinition('listing_text');
  modified.operations.push('publish'); modified.required_gates.splice(0);
  assert.deepEqual(contracts.getAutomationDefinition('listing_text'),original);
  assert.equal(contracts.validateDefinition(modified).valid,false);
});

test('wrong purpose, version, duplicate operations and missing human gates are rejected', () => {
  need();
  for (const mutate of [
    d=>{d.purpose='hampton_intent_v1';}, d=>{d.version++;},
    d=>{d.operations.push(d.operations[0]);}, d=>{d.required_gates=d.required_gates.filter(x=>x!=='human_review');},
    d=>{d.hard_human_decisions=d.hard_human_decisions.filter(x=>x!=='match_approval');},
    d=>{d.input_classes.push('C3');},
  ]) {
    const definition=contracts.getAutomationDefinition('market_ambiguity_v1'); mutate(definition);
    const result=contracts.validateDefinition(definition);
    assert.equal(result.valid,false); assert.ok(result.issues.length>0);
  }
});

test('arbitrary scripts, account details and forged evidence cannot become registry authority', () => {
  need();
  for (const mutate of [
    d=>{d.script='run arbitrary input';}, d=>{d.provider_ref='example-provider';},
    d=>{d.limits.monthly_cost_minor=0;}, d=>{d.acceptance.status='verified';},
    d=>{d.acceptance.cases=['synthetic-only'];},
    d=>{d.acceptance.evidence_ref='fixture-evidence';},
  ]) {
    const definition=contracts.getAutomationDefinition('listing_text'); mutate(definition);
    assert.equal(contracts.validateDefinition(definition).valid,false);
  }
});

test('no artificial cases, unknown cost or definition is treated as activation evidence', () => {
  need();
  const manifest=JSON.parse(readFileSync(new URL('../../docs/automations/acceptance.json',import.meta.url),'utf8'));
  const definitions=contracts.listAutomationDefinitions();
  assert.equal(manifest.schema_version,1);
  assert.deepEqual(manifest.automations.map(a=>a.id),definitions.map(d=>d.id));
  for (const definition of definitions) {
    const acceptance=manifest.automations.find(a=>a.id===definition.id);
    assert.equal(definition.limits.monthly_cost_minor,null);
    assert.equal(definition.limits.currency,null);
    assert.equal(definition.limits.on_limit,'draft');
    assert.equal(definition.limits.on_unknown_cost,'block_and_review');
    assert.equal(definition.acceptance.status,'pending');
    assert.deepEqual(definition.acceptance.cases,[]);
    assert.equal(definition.acceptance.required_passes,null);
    assert.equal(definition.acceptance.evidence_ref,null);
    assert.deepEqual(acceptance,{id:definition.id,version:definition.version,purpose:definition.purpose,...definition.acceptance});
    assert.equal(Object.hasOwn(definition,'activation_ready'),false);
  }
});

test('validation never executes accessor properties or accepts hidden array payloads', () => {
  need();
  let executed=false;
  const root=contracts.getAutomationDefinition('listing_text');
  Object.defineProperty(root,'purpose',{enumerable:true,get(){executed=true;return 'listing_text';}});
  assert.equal(contracts.validateDefinition(root).valid,false);
  const nested=contracts.getAutomationDefinition('listing_text');
  Object.defineProperty(nested.operations,'0',{enumerable:true,get(){executed=true;return 'prepare_draft';}});
  assert.equal(contracts.validateDefinition(nested).valid,false);
  assert.equal(executed,false);
  const extra=contracts.getAutomationDefinition('listing_text');
  extra.operations.callback='untrusted';
  assert.equal(contracts.validateDefinition(extra).valid,false);
});

test('each purpose has a dossier and references existing source contracts', async () => {
  need();
  const {access}=await import('node:fs/promises');
  for (const definition of contracts.listAutomationDefinitions()) {
    await access(new URL(`../../docs/automations/${definition.id}.md`,import.meta.url));
    for (const source of definition.source_contracts) await access(new URL(`../../${source}`,import.meta.url));
  }
});

test('hidden gates and uninspectable inputs fail closed', () => {
  need();
  const definition=contracts.getAutomationDefinition('listing_text');
  Object.defineProperty(definition,'required_gates',{value:definition.required_gates,enumerable:false});
  assert.equal(contracts.validateDefinition(definition).valid,false);
  const hiddenIndex=contracts.getAutomationDefinition('listing_text');
  Object.defineProperty(hiddenIndex.operations,'0',{value:'prepare_draft',enumerable:false});
  assert.equal(contracts.validateDefinition(hiddenIndex).valid,false);
  const uninspectable=new Proxy({}, {getPrototypeOf(){throw new Error('fixture');}});
  assert.deepEqual(contracts.validateDefinition(uninspectable),{valid:false,issues:['definition']});
});

// AUT-09: every automation card follows docs/automations/TEMPLATE.md, names an owner task that exists and only cites
// files that exist. A card is documentation: passing this test activates nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { listAutomationDefinitions } from '../../server/automation-contracts.js';

const root = new URL('../../', import.meta.url);
const dir = new URL('docs/automations/', root);
const read = url => readFileSync(url, 'utf8');
const exists = path => existsSync(new URL(path, root));

const FIELDS = ['Id', 'Estado', 'Tarea dueña', 'Propósito', 'Disparador', 'Entradas y clase de datos',
  'Salidas y efectos', 'Guardas humanas y modo', 'Interruptor', 'Coste y límite', 'Código',
  'Pruebas que la cubren', 'Criterio de hecho'];
const STATES = ['activa', 'apagada', 'prevista'];
const REPO_PATH = /^(?:server|tests|migrations|jobs|hermes|functions|admin|docs|site|scripts)\/[\w./-]+$/;

function parseCard(text) {
  const fields = new Map();
  for (const line of text.split('\n')) {
    const m = /^- \*\*([^*]+):\*\* (.*)$/.exec(line);
    if (m) fields.set(m[1], m[2].trim());
  }
  return fields;
}
const ticked = value => [...value.matchAll(/`([^`]+)`/g)].map(m => m[1].replace(/:\d+(?:-\d+)?$/, ''));

const cardFiles = readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'index.md' && f !== 'TEMPLATE.md');
const cards = cardFiles.map(file => ({ file, id: file.slice(0, -3), fields: parseCard(read(new URL(file, dir))) }));

test('the template lists exactly the required fields', () => {
  assert.deepEqual([...parseCard(read(new URL('TEMPLATE.md', dir))).keys()], FIELDS);
});

test('every card has every field, non-empty, in template order', () => {
  assert.ok(cards.length > 0);
  for (const { file, fields } of cards) {
    assert.deepEqual([...fields.keys()], FIELDS, file);
    for (const [name, value] of fields) assert.ok(value.length > 0, `${file}: ${name}`);
  }
});

test('id matches the file, state is known and the owner task exists', () => {
  for (const { file, id, fields } of cards) {
    assert.equal(fields.get('Id'), `\`${id}\``, file);
    assert.ok(STATES.includes(fields.get('Estado').split(/[\s,.;—-]/)[0]), `${file}: estado`);
    const owner = /^([A-Z]{2,4}-\d{2})\b/.exec(fields.get('Tarea dueña'));
    assert.ok(owner, `${file}: tarea dueña`);
    assert.ok(exists(`docs/roadmap/tasks/${owner[1]}.json`), `${file}: ${owner[1]}`);
  }
});

test('tests cited by a card exist; only a planned automation may have none', () => {
  for (const { file, fields } of cards) {
    const value = fields.get('Pruebas que la cubren'), paths = ticked(value);
    if (paths.length === 0) {
      assert.match(value, /^ninguna\b/, `${file}: pruebas`);
      assert.ok(fields.get('Estado').startsWith('prevista'), `${file}: only a planned card may have no tests`);
    }
    for (const path of paths) {
      assert.match(path, /^tests\//, `${file}: ${path}`);
      assert.ok(exists(path), `${file}: missing test ${path}`);
    }
  }
});

test('every repository path cited anywhere in a card exists', () => {
  for (const { file, fields } of cards) {
    for (const value of fields.values()) {
      for (const path of ticked(value).filter(p => REPO_PATH.test(p))) assert.ok(exists(path), `${file}: ${path}`);
    }
  }
});

test('the index lists every card once, with the same state and owner', () => {
  const rows = read(new URL('index.md', dir)).split('\n')
    .map(line => /^\| \[`([^`]+)`\]\(([^)]+)\.md\) \| ([^|]+) \| ([^|]+) \|/.exec(line)).filter(Boolean);
  assert.deepEqual(rows.map(r => r[1]).sort(), cards.map(c => c.id).sort());
  for (const [, id, link, state, owner] of rows) {
    const card = cards.find(c => c.id === id);
    assert.equal(link, id);
    assert.equal(state.trim(), card.fields.get('Estado').split(/[\s,.;—-]/)[0], id);
    assert.ok(card.fields.get('Tarea dueña').startsWith(owner.trim()), id);
  }
});

test('every registered AI purpose has a card', () => {
  for (const { id } of listAutomationDefinitions()) assert.ok(cardFiles.includes(`${id}.md`), id);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePilot } from '../../scripts/compare-market-pilot.mjs';

const agencies = [
  ['src-gaudin-co', 'gaudin.je'],
  ['src-keys-properties', 'keys.je'],
  ['src-finders-keepers', 'finderskeepers.je'],
];
function pilot() {
  return ['2026-11-30', '2026-12-01'].map(date => ({
    date,
    sources: Object.fromEntries(agencies.map(([source, host]) => {
      const urls = Array.from({ length: 20 }, (_, i) => `https://www.${host}/property/example-${i}`);
      return [source, { reference: { complete: true, urls }, hermes: { complete: true, urls: [...urls] } }];
    })),
  }));
}

test('matches canonical URLs, deduplicates observations and accepts exactly 95% per source and day', () => {
  const days = pilot();
  const keys = days[0].sources['src-keys-properties'];
  keys.hermes.urls.pop();
  keys.hermes.urls[0] = 'https://keys.je/property/example-0/?ref=yes#details';
  keys.hermes.urls.push(keys.hermes.urls[0]);
  days.reverse();
  const result = comparePilot(days);
  assert.equal(result.passed, true);
  assert.equal(result.checks.length, 6);
  const check = result.checks.find(r => r.date === '2026-11-30' && r.source === 'src-keys-properties');
  assert.equal(check.matched, 19);
  assert.deepEqual(check.missing, ['https://keys.je/property/example-19']);
});

test('one uncorroborated identity fails a day even if the count and coverage meet the target', () => {
  const days = pilot();
  days[1].sources['src-gaudin-co'].hermes.urls[19] = 'https://gaudin.je/property/unconfirmed';
  const result = comparePilot(days);
  assert.equal(result.passed, false);
  const failed = result.checks.filter(row => !row.passed);
  assert.equal(failed.length, 1);
  assert.deepEqual(failed[0].unexpected, ['https://gaudin.je/property/unconfirmed']);
});

test('two missed listings cannot be offset by another date or agency', () => {
  const days = pilot();
  days[0].sources['src-keys-properties'].hermes.urls.splice(0, 2);
  assert.equal(comparePilot(days).passed, false);
});

test('incomplete runs and an empty reference do not demonstrate coverage', () => {
  for (const kind of ['reference', 'hermes']) {
    const days = pilot();
    days[0].sources['src-finders-keepers'][kind].complete = false;
    assert.equal(comparePilot(days).passed, false);
  }
  const days = pilot();
  for (const kind of ['reference', 'hermes']) days[0].sources['src-keys-properties'][kind].urls = [];
  assert.equal(comparePilot(days).passed, false);
});

test('requires all three agencies and two valid consecutive Jersey dates', () => {
  for (const date of ['2026-11-30', '2026-12-02', '2026-11-31', 'November 29, 2026']) {
    const days = pilot();
    days[1].date = date;
    assert.throws(() => comparePilot(days));
  }
  assert.throws(() => comparePilot(pilot().slice(0, 1)));
  const days = pilot();
  delete days[0].sources['src-gaudin-co'];
  assert.throws(() => comparePilot(days));
});

test('rejects malformed evidence and URLs from another agency', () => {
  const days = pilot();
  const source = days[0].sources['src-keys-properties'];
  source.reference.urls[0] = 'https://gaudin.je/property/example-0';
  assert.throws(() => comparePilot(days));
  source.reference.urls = [null];
  assert.throws(() => comparePilot(days));
  source.reference = { complete: 'yes', urls: [] };
  assert.throws(() => comparePilot(days));
});

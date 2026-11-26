import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { normaliseUrl } from '../server/market-hermes.js';

const sources = {
  'src-gaudin-co': 'gaudin.je',
  'src-keys-properties': 'keys.je',
  'src-finders-keepers': 'finderskeepers.je',
};

function dayNumber(date) {
  const ms = Date.parse(date);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new Error('Each date must be a valid Jersey calendar day (YYYY-MM-DD).');
  }
  return ms / 86_400_000;
}

function identities(read, host, label) {
  if (typeof read?.complete !== 'boolean' || !Array.isArray(read.urls)) {
    throw new Error(`${label} needs a complete flag and an array of listing URLs.`);
  }
  const urls = new Set();
  for (const value of read.urls) {
    const url = typeof value === 'string' && normaliseUrl(value);
    if (!url || !url.startsWith(`https://${host}/`)) {
      throw new Error(`${label} contains an invalid listing URL for ${host}.`);
    }
    urls.add(url);
  }
  return urls;
}

export function comparePilot(days) {
  if (!Array.isArray(days) || days.length !== 2) throw new Error('Provide exactly two pilot days.');
  if (Math.abs(dayNumber(days[0]?.date) - dayNumber(days[1]?.date)) !== 1) {
    throw new Error('The pilot requires two consecutive Jersey calendar days.');
  }
  const checks = [];
  for (const { date, sources: reads } of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const [source, host] of Object.entries(sources)) {
      const read = reads?.[source];
      const reference = identities(read?.reference, host, `${date} ${source} reference`);
      const hermes = identities(read?.hermes, host, `${date} ${source} Hermes`);
      const missing = [...reference].filter(url => !hermes.has(url)).sort();
      const unexpected = [...hermes].filter(url => !reference.has(url)).sort();
      const matched = reference.size - missing.length;
      const complete = read.reference.complete && read.hermes.complete;
      const passed = complete && reference.size > 0 && matched * 100 >= 95 * reference.size && unexpected.length === 0;
      checks.push({ date, source, complete, reference: reference.size, hermes: hermes.size, matched, missing, unexpected, passed });
    }
  }
  return { passed: checks.every(check => check.passed), checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/compare-market-pilot.mjs pilot.json');
    const days = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const report = comparePilot(days);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.passed ? 0 : 1;
  } catch (error) {
    console.error(error instanceof SyntaxError ? 'Invalid JSON in pilot input.' : error.message);
    process.exitCode = 2;
  }
}

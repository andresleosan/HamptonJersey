// A listing's parish and features read from its own text when it is saved (spec B3, B10), so matching never
// reads descriptions. Pure ESM; it runs inside the Worker's 10 ms budget, so every pattern is compiled once, here.
// Unknown is always null: a feature the text does not mention is never "no".
import { OPTIONS } from "./applicants.js";

const EVIDENCE_MAX = 120;

// ---- Parish -------------------------------------------------------------------------------------------------
// Places that are not parishes but sit in one (B3).
const LOCALITIES = { "St Aubin": "St Brelade", "Red Houses": "St Brelade", "Les Quennevais": "St Brelade",
  "First Tower": "St Helier", "Havre des Pas": "St Helier", Millbrook: "St Lawrence", "Bel Royal": "St Lawrence",
  "Five Oaks": "St Saviour" };
// "St" may be written "St.", "St" or "Saint"; "St Brelade's" is still St Brelade; "St Saviours Road" is a street.
const STREET = String.raw`(?!(?:['’]?s)?\s+(?:road|rd|street|st|hill|lane|avenue|close)\b)`;
const placePattern = name => new RegExp(String.raw`\b${name.replace(/^St /, String.raw`(?:saint\s+|st\.?\s+|st\.)`)
  .replace(/ /g, String.raw`\s+`)}(?:['’]?s)?\b${STREET}`, "i");
const PLACES = [...OPTIONS.parishes.map(([p]) => [placePattern(p), p]),
  ...Object.entries(LOCALITIES).map(([place, p]) => [placePattern(place), p])];

function parishesIn(text) {
  const found = new Set();
  if (text) for (const [re, parish] of PLACES) if (re.test(text)) found.add(parish);
  return found;
}
const onlyOne = parishes => (parishes.size === 1 ? [...parishes][0] : null);

// The one parish a text names, or null when it names none or two different ones.
export const parseParish = text => onlyOne(parishesIn(text));

// ---- Features -----------------------------------------------------------------------------------------------
const PETS_NO = /\bno pets\b(?!\s+restrictions?)|\bpets? (?:are |is )?not (?:permitted|allowed|accepted)\b/i;
// Not after "no": "no pets allowed" is a refusal, not a mixed signal.
const PETS_YES = new RegExp(String.raw`(?<!\bno )\bpets? (?:are |may be )?(?:considered|allowed|welcome|permitted`
  + String.raw`|accepted|negotiable|by arrangement|by negotiation)\b|\bpet[- ]friendly\b`, "i");

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const N = String.raw`(\d+|${Object.keys(NUMBER_WORDS).join("|")})`;
const SPACE_KIND = String.raw`(?: (?:allocated|designated|private|secure|secured|undercover|underground|covered`
  + String.raw`|gated|dedicated|reserved|off-road|basement|car))*`;
// [pattern, spaces] — spaces null means "the number the pattern captured". The most spaces said wins.
const PARKING_COUNTS = [
  [new RegExp(String.raw`\b(?:parking|garag(?:es?|ing)) for (?:up to )?${N}\b`, "gi"), null],
  [new RegExp(String.raw`\b${N}${SPACE_KIND} parking(?: spaces?)?\b`, "gi"), null],
  [new RegExp(String.raw`\bparking(?: spaces?)?: ?${N}\b`, "gi"), null], // a specs row, "Parking Spaces: 2"
  [new RegExp(String.raw`\b${N}[- ]car garag(?:es?|ing)\b`, "gi"), null],
  [/\bdouble garage\b/gi, 2],
  [/\btriple garage\b/gi, 3],
];
const NO_PARKING = /\bno (?:on-site |off-road |allocated |private )?parking\b/i;
// Visitors' parking and parking to rent nearby are not the listing's own.
const SOME_PARKING = new RegExp(String.raw`\b(?<!(?:visitors?['’]?|residents['’]?|nearby|rented|paid|paycard`
  + String.raw`|public|on-street|permit) )(?:garages?|parking)\b`
  + String.raw`(?!(?: spaces?)? (?:is |are )?(?:available )?(?:nearby|close by))`, "i");

const FURNISHED = /\b(?:(un|non[- ])|(part(?:ly|ially)?[- ]|semi[- ]))?furnished\b/gi;

// In OPTIONS.outdoor order; a patio counts as a terrace; an end-terrace house and a Juliet balcony do not count.
const OUTDOOR = [
  ["garden", /\bgardens?\b/i],
  ["terrace", /\b(?<!(?:end|mid)[- ](?:of[- ])?)(?:terraces?|patios?)\b/i],
  ["balcony", /\b(?<!juliet(?:te)? )balcon(?:y|ies)\b/i],
];

// A specs row naming a feature with a plain yes or no value ("Pets Allowed: No"): [key, label, no, yes].
// Pets only when the label states permission: "Pet Deposit: 0" or "Pet Restrictions: None" is not a refusal.
const SPEC_ROWS = [["pets", /^\s*pets?(?:\s+(?:allowed|permitted|accepted|considered))?\s*$/i, "no", "yes"],
  ["furnished", /\bfurnish/i, "no", "yes"], ["parking", /\b(?:parking|garag(?:es?|ing))\b/i, 0, 1]];
const ROW_NO = /^(?:no|none|0)$/i;
const ROW_YES = /^(?:yes|allowed)$/i;

const TYPE = new RegExp(String.raw`\b(?:(apartments?|flats?|maisonettes?|penthouses?)`
  + String.raw`|(houses?|bungalows?|villas?|townhouses?|farmhouses?|ch[aâ]teaux?)|(cottages?)|(studios?))\b`, "i");
const TYPES = ["flat", "house", "cottage", "studio"];

// The phrase around a match: its line or sentence, at most EVIDENCE_MAX characters.
function phrase(text, m) {
  const stop = i => "\n•;!?.".includes(text[i]);
  let start = m.index, end = m.index + m[0].length;
  while (start > 0 && m.index - start < 40 && !stop(start - 1)) start--;
  if (start > 0 && !stop(start - 1)) start = Math.min(text.indexOf(" ", start) + 1 || m.index, m.index); // whole words
  while (end < text.length && end - start < EVIDENCE_MAX && !stop(end)) end++;
  return text.slice(start, end).trim();
}
const hit = (value, text, m) => ({ value, evidence: phrase(text, m) });

// A yes and a no together say neither; the no phrase is kept as evidence.
function pets(text) {
  const no = PETS_NO.exec(text), yes = PETS_YES.exec(text);
  if (no) return hit(yes ? null : "no", text, no);
  return yes ? hit("yes", text, yes) : null;
}

function parking(text) {
  let best = null;
  for (const [re, spaces] of PARKING_COUNTS)
    for (const m of text.matchAll(re)) {
      const n = spaces ?? NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1]);
      if (!best || n > best.value) best = hit(n, text, m);
    }
  if (best) return best;
  let m = NO_PARKING.exec(text);
  if (m) return hit(0, text, m);
  m = SOME_PARKING.exec(text);
  return m ? hit(1, text, m) : null;
}

// "unfurnished or furnished" and "part furnished" say neither yes nor no.
function furnished(text) {
  let no = null, yes = null;
  for (const m of text.matchAll(FURNISHED)) {
    if (m[2]) return null;
    if (m[1]) no ??= m;
    else yes ??= m;
  }
  if (no && yes) return null;
  return no ? hit("no", text, no) : yes ? hit("yes", text, yes) : null;
}

function outdoor(text) {
  const hits = OUTDOOR.map(([kind, re]) => [kind, re.exec(text)]).filter(([, m]) => m);
  return hits.length ? { value: JSON.stringify(hits.map(([kind]) => kind)),
    evidence: [...new Set(hits.map(([, m]) => phrase(text, m)))].join(" · ").slice(0, EVIDENCE_MAX) } : null;
}

// From the property type, else the title; only what the title names before "with" ("Home with Guest Apartment").
function type(...sources) {
  for (const s of sources) {
    const m = s && TYPE.exec(s.split(/\bwith\b/i)[0]);
    if (m) return { value: TYPES[m.slice(1).findIndex(Boolean)], evidence: s.trim().slice(0, EVIDENCE_MAX) };
  }
  return null;
}

const keyedRow = (value, label, v) => ({ value, evidence: `${label}: ${v}`.slice(0, EVIDENCE_MAX) });
// The reading with the most parking spaces, so a "Garage: No" row never hides "Parking for 2 cars".
const most = (a, b) => (!a || (b && b.value > a.value) ? b : a);

// Splits the specs into the yes/no rows read as key and value ({pets, furnished, parking}) and the prose rest.
function readSpecs(specs) {
  const keyed = {}, prose = [];
  for (const { label, value } of specs) {
    const v = String(value).trim(), no = ROW_NO.test(v);
    const row = (no || ROW_YES.test(v)) && SPEC_ROWS.find(([, re]) => re.test(label));
    if (!row) { prose.push(`${label}: ${value}`); continue; }
    const [key, , ifNo, ifYes] = row, read = keyedRow(no ? ifNo : ifYes, label, v);
    keyed[key] = key === "parking" ? most(keyed.parking, read) : keyed[key] ?? read;
  }
  return { keyed, prose };
}

// listing: a listings row (specs as JSON text). Returns the columns of migrations/0009_matches.sql.
export function extractFeatures(listing) {
  let parishes = parishesIn(listing.location);
  if (!parishes.size) parishes = parishesIn(listing.road_name);
  const { keyed, prose } = readSpecs(JSON.parse(listing.specs || "[]"));
  const text = [...prose, listing.summary, listing.description].filter(Boolean).join("\n");

  const out = { parish: onlyOne(parishes) };
  const evidence = {};
  for (const [key, result] of [["pets", keyed.pets ?? pets(text)], ["parking", most(keyed.parking, parking(text))],
    ["furnished", keyed.furnished ?? furnished(text)],
    ["outdoor", outdoor(text)], ["type", type(listing.property_type, listing.title)]]) {
    out[`feat_${key}`] = result?.value ?? null;
    if (result) evidence[key] = result.evidence;
  }
  out.feat_evidence = Object.keys(evidence).length ? JSON.stringify(evidence) : null;
  return out;
}

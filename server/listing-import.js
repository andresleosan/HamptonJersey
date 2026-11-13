import { priceOperation, priceField } from "./listing-pricing.js";
// PUB-01 (spec 2026-11-03): «Add new property» from a folder. Pure, so the panel shares it (like applicants.js) and node
// tests it: no DOM, env or network. The server still validates the draft as for one typed by hand.
import { validateListing, ENUMS } from "./listing.js";

// The template's fields (admin/public/property.txt) and their columns. Nothing else can be set from the file.
const FIELDS = { Title: "title", Type: "property_type", Use: "use", Operation: "operation", Availability: "availability",
  Country: "country", Parish: "parish", Location: "location", Road: "road_name", Bedrooms: "bedrooms", Bathrooms: "bathrooms",
  Tenure: "tenure_type", "Housing category": "housing_category", Restriction: "restriction", Price: "price",
  "Rent period": "rent_period", Currency: "currency", "Tour URL": "tour_url", Summary: "summary", Description: "description" };
const key = s => s.toLowerCase().replace(/[^a-z]/g, "");
// Lookups by text read from the file use own keys only: «constructor» is not a field (security review).
const BY_KEY = new Map(Object.keys(FIELDS).map(l => [key(l), l]));
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);
const fold = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const clip = s => (s.length > 60 ? `${s.slice(0, 57)}…` : s);
// The panel's restriction labels (ListingEditor.jsx); the other labels fold to their stored values.
const ALIASES = { restriction: { first_time_buyers_only: "first_time_buyer", over_55s_only: "over_55", none: null } };
const COUNTRIES = { jersey: "Jersey", united_kingdom: "United Kingdom", uk: "United Kingdom" };
const PERIODS = { month: ["per_month", "month", "monthly", "pcm", "pm", "a_month"],
  year: ["per_year", "year", "yearly", "annual", "annually", "pa", "p_a", "per_annum", "a_year"] };
const SUFFIXES = [[/\s*(pcm|pm|per\s+month|a\s+month|\/\s*month|monthly)\.?$/i, "month"],
  [/\s*(p\.?\s?a\.?|per\s+annum|per\s+year|a\s+year|\/\s*year|yearly|annually)$/i, "year"]];
const CODES = { "£": "GBP", "€": "EUR", gbp: "GBP", eur: "EUR" };
// Text that becomes public once the listing is published: an owner's email or phone number must not slip in.
const PUBLIC_TEXT = ["title", "location", "road_name", "summary", "description"];
const contact = s => /\S+@\S+\.\S+/.test(s) || (s.match(/\+?[\d(][\d\s()+-]{8,}\d/g) ?? []).some(x => x.replace(/\D/g, "").length >= 10);

// UTF-8 (the decoder drops a BOM); a file that isn't valid UTF-8 is old Notepad's Windows-1252, where £ is one byte.
export function decodeText(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
}

function listValue(col, v) {
  const f = fold(v), alias = ALIASES[col] ?? {};
  if (Object.hasOwn(alias, f)) return alias[f];
  if (col === "parish") {
    const p = fold(v.replace(/\./g, "").replace(/^\s*saint\s+/i, "st "));
    return ENUMS.parish.find(x => fold(x) === p);
  }
  if (col === "rent_period") return Object.keys(PERIODS).find(p => PERIODS[p].includes(f));
  if (col === "currency") return own(CODES, v.trim().toLowerCase());
  return ENUMS[col].find(x => x === f);
}

// An amount like 850000, £850,000, 1 250 000 GBP, 1.25m or £2,500 pcm; words ("Offers over £850,000") are text to show.
function parsePrice(raw) {
  let s = raw.trim(), currency, suffix;
  const p = SUFFIXES.find(([re]) => re.test(s));
  if (p) { s = s.replace(p[0], ""); suffix = p[1]; }
  s = s.replace(/^(£|€|gbp|eur)\s*/i, (_, c) => { currency = CODES[c.toLowerCase()]; return ""; })
    .replace(/\s*(£|€|gbp|eur)$/i, (_, c) => { currency ??= CODES[c.toLowerCase()]; return ""; });
  const m = /^(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.(\d+))?([km])?$/i.exec(s);
  if (m && (m[2] ?? "").length <= (m[3] ? 3 : 2)) {
    const n = Number(`${m[1].replace(/[,\s]/g, "")}.${m[2] ?? 0}`) * ({ k: 1e3, m: 1e6 }[m[3]?.toLowerCase()] ?? 1);
    return { amount: Math.round(n * 100) / 100, currency, suffix };
  }
  return /[a-z]/i.test(s) ? { text: raw.trim() } : { bad: true };
}

// The fields of a property.txt, keyed by listing column and already valid, the notes on what wasn't imported and the
// warnings on what was (a repeated line, contact details in public text), each in line order. The amount stays apart (price: { amount, suffix? }) until draftBody knows the operation; Currency and Rent period
// come from their own lines, else from the amount's symbol and suffix. An amount with doubts is left out (spec §3.2).
export function readPropertyText(text) {
  const notes = [], warnings = [], note = (line, msg) => notes.push([line, msg]), warn = (line, msg) => warnings.push([line, msg]);
  const raw = {}, at = {}, blocks = {};
  let block = null;
  text.replace(/^﻿/, "").split(/\r?\n/).forEach((l, i) => {
    const t = l.trim(), m = /^([^:]{1,40}):(.*)$/.exec(t), label = m && BY_KEY.get(key(m[1]));
    if (!t || t.startsWith("#")) return;
    // Summary runs to the Description line and Description to the end, so «Location: …» in the prose stays prose.
    if (block === "Description" || (block === "Summary" && label !== "Description")) return blocks[block].push(t);
    if (!label) return note(i + 1, `Line ${i + 1}: "${clip(t)}" isn't a field of the template.`);
    if (label === "Summary" || label === "Description") {
      block = label; at[label] = i + 1; blocks[label] = m[2].trim() ? [m[2].trim()] : [];
      return;
    }
    if (label in raw) warn(i + 1, `${label} appears more than once: line ${i + 1} is used.`);
    raw[label] = m[2].trim(); at[label] = i + 1;
  });
  if (blocks.Summary) raw.Summary = blocks.Summary.map(x => x.replace(/^[-•*]\s+/, "")).filter(Boolean).join("\n");
  if (blocks.Description) raw.Description = blocks.Description.join("\n");

  const fields = {};
  let price, badCurrency = false;
  for (const [label, v] of Object.entries(raw)) {
    const col = FIELDS[label], line = at[label];
    if (!v) continue; // blank = not known
    if (col === "price") { price = [v, line]; continue; }
    let value = v;
    if (col in ENUMS) {
      value = listValue(col, v);
      if (value === null) continue; // Restriction: None
      if (value === undefined) {
        note(line, `${label}: "${clip(v)}" isn't one of the accepted values.`);
        if (col === "currency") badCurrency = true;
        continue;
      }
      if(col==='availability'&&['let_agreed','let'].includes(value)){
        note(line,`${label}: "${clip(v)}" is an observation. Confirm the rental marketing state with recorded evidence in the editor.`);
        continue;
      }
    } else if (col === "country") value = own(COUNTRIES, fold(v)) ?? v;
    else if (col === "bedrooms" || col === "bathrooms") value = /^(\d+)(\s+[a-z][a-z\s]*)?$/i.test(v) ? parseInt(v, 10) : v;
    const r = validateListing({ [col]: value }, { partial: true });
    if (r.errors) { note(line, `${label}: ${r.errors[col]}`); continue; }
    fields[col] = r.value[col];
    if (PUBLIC_TEXT.includes(col) && contact(fields[col])) {
      warn(line, `${label} seems to include an email address or phone number. It will be public once the listing is published.`);
    }
  }

  if (price) {
    const [v, line] = price, p = parsePrice(v);
    const amountError = p.amount !== undefined && validateListing({ sale_price: p.amount }, { partial: true }).errors?.sale_price;
    if (p.text !== undefined) {
      const r = validateListing({ price_text: p.text }, { partial: true });
      if (r.errors) note(line, `Price: ${r.errors.price_text}`); else fields.price_text = r.value.price_text;
    } else if (p.bad) note(line, `Price: "${clip(v)}" isn't a clear amount. Write it like 850000 or 850,000.`);
    else if (amountError) note(line, `Price: ${amountError}`);
    else {
      const [lineCurrency, linePeriod] = [fields.currency, fields.rent_period];
      if (!lineCurrency && !badCurrency && p.currency) fields.currency = p.currency;
      if (!linePeriod && p.suffix) fields.rent_period = p.suffix;
      if (badCurrency) note(line, "Price: the currency isn't clear, so the amount wasn't imported.");
      else if (lineCurrency && p.currency && p.currency !== lineCurrency) {
        note(line, `Price: the amount says ${p.currency} but Currency says ${lineCurrency}, so it wasn't imported.`);
      } else if (linePeriod && p.suffix && p.suffix !== linePeriod) {
        note(line, `Price: the amount says per ${p.suffix} but Rent period says per ${linePeriod}, so it wasn't imported.`);
      } else fields.price = p.suffix ? { amount: p.amount, suffix: p.suffix } : { amount: p.amount };
    }
  }
  const ordered = list => list.sort((a, b) => a[0] - b[0]).map(n => n[1]);
  return { fields, notes: ordered(notes), warnings: ordered(warnings) };
}

const FIVE = ["title", "use", "operation", "availability", "country"];

// The POST /admin/listings body: the file's fields, the form's five (which win), and the amount under the form's operation.
export function draftBody(fields, form) {
  const { price, ...rest } = fields, notes = [];
  for (const k of FIVE) delete rest[k];
  const body = { ...rest, ...form };
  const operation = priceOperation(body);
  if (operation !== "rent") delete body.rent_period;
  if (price) {
    if (price.suffix && operation !== "rent") notes.push("Price: pcm and pa are for rentals only, so the amount wasn't imported.");
    else if (operation === "rent" && !body.rent_period) notes.push("Rent: say per month or per year.");
    else { body[priceField(body)] = price.amount; body.currency ??= "GBP"; }
  }
  return { body, notes };
}

// The folder (spec §3.3). Only the chosen folder's own files go up (Luis, decision 5): subfolders hold 360 photos, videos,
// originals or documents. System files are ignored without a word.
export const MAX_PHOTOS = 100, MAX_PHOTO = 40 * 1024 * 1024;
const MAX_TEXT = 100 * 1024;
const hidden = n => n.startsWith(".") || /^(thumbs\.db|desktop\.ini|__macosx)$/i.test(n);
const ext = n => (/\.([^.]+)$/.exec(n)?.[1] ?? "").toLowerCase();
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
const PLAN = /floor[\s_-]*plan/i, AERIAL = /(^|[^a-z])(aerial|drone)([^a-z]|$)/i;
// Why a file isn't uploaded, in the order the summary lists them.
const REASONS = [["HEIC photos (export them as JPG first)", e => ["heic", "heif"].includes(e)], ["PDFs aren't uploaded", e => e === "pdf"],
  ["Videos aren't uploaded", e => ["mp4", "mov", "m4v", "avi"].includes(e)],
  ["Only property.txt is read", e => ["doc", "docx", "pages", "rtf", "odt", "txt"].includes(e)], ["Not photos", () => true],
  ["Larger than 40 MB", () => false]];
// Camera and phone names say nothing about the photo; the website then uses the listing's title as its alt text.
// Also a phone's suffixes (.MP, -WA0001) and a copy's « (1)».
const CAMERA = /^(img|dsc[nf]?|pxl|p(?=\d)|photo|image|picture|pic|whatsapp image|screenshot|screen shot)?[\s_.-]*[\d\s_.:-]*(at[\d\s_.:-]*(am|pm)?)?(wa\d+)?(\.?mp)?(\s*\(\d+\))?$/i;

export function labelFromName(name) {
  const base = name.replace(/\.[^.]+$/, "");
  if (CAMERA.test(base)) return null;
  // Leading numbering goes («01 - Kitchen»), digits that start a word stay («1st floor plan», «3D floor plan»).
  return base.replace(/^\d+(?![\p{L}\d])\s*[-_.)]?\s*/u, "").replace(/_/g, " ").replace(/\s+/g, " ").trim() || null;
}

// «floor plan» in the name is a plan; the first «aerial» or «drone» the aerial view (also Properties Queue, PUB-21).
export function kindsOf(names) {
  let aerial = false;
  return names.map(n => (PLAN.test(n) ? "floorplan" : AERIAL.test(n) && !aerial ? ((aerial = true), "aerial") : "photo"));
}

// The cover: the first photo whose name doesn't say aerial or drone, else the first photo; never a floor plan.
export function pickCover(photos) {
  const i = photos.findIndex(p => p.kind === "photo" && !AERIAL.test(p.name));
  const j = i >= 0 ? i : photos.findIndex(p => p.kind === "photo");
  return j >= 0 ? j : null;
}

// items: [{ file, path }], path being "<folder>/<name>" (webkitRelativePath, or a dropped folder) or the bare name of a
// loose file; an empty path counts as the file's name. subfolders: the ones a dropped folder had, never read.
export function planFolder(items, subfolders = []) {
  const top = [], subs = new Set(subfolders);
  let folder = null;
  for (const { file, path } of items) {
    const parts = (path || file.name).split("/"), inside = parts.length > 1 ? parts.slice(1) : parts;
    if (parts.length > 1) folder ??= parts[0];
    if (inside.length > 1) subs.add(inside[0]); else top.push(file);
  }
  const files = top.filter(x => !hidden(x.name)).sort(byName), texts = files.filter(x => ext(x.name) === "txt");
  const text = texts.find(x => x.name.toLowerCase() === "property.txt") ?? (texts.length === 1 ? texts[0] : null);
  const groups = new Map(REASONS.map(([r]) => [r, []])), photos = [], skipped = [];
  for (const file of files) {
    const e = ext(file.name);
    if (file === text || (e === "txt" && !text)) continue;
    if (!["jpg", "jpeg", "png", "webp"].includes(e)) groups.get(REASONS.find(([, is]) => is(e))[0]).push(file.name);
    else if (file.size > MAX_PHOTO) groups.get("Larger than 40 MB").push(file.name);
    else photos.push(file);
  }
  if (texts.length > 1 && !text) {
    skipped.push(`Several text files, so none was read (name the one with the details property.txt): ${texts.map(x => x.name).join(", ")}`);
  }
  if (text && text.size > MAX_TEXT) skipped.push(`${text.name} is larger than 100 KB and wasn't read.`);
  for (const [reason, names] of groups) if (names.length) skipped.push(`${reason}: ${names.join(", ")}`);
  const kind = kindsOf(photos.map(f => f.name));
  const planned = photos.map((file, i) => ({ file, name: file.name, label: labelFromName(file.name), kind: kind[i] }));
  const error = planned.length > MAX_PHOTOS ? `This folder has ${planned.length} photos. The limit is 100: choose the property's own folder.`
    : !planned.length && !text ? "No photos or property.txt in this folder." : null;
  return { folder, photos: planned, cover: pickCover(planned), text: text && text.size <= MAX_TEXT ? text : null, skipped,
    subfolders: [...subs].filter(n => !hidden(n)).sort((a, b) => byName({ name: a }, { name: b })), error };
}

// A drop (DataTransferItem.webkitGetAsEntry(), taken inside the drop handler): one folder, read to its direct entries
// (readEntries hands them over in batches until an empty one), or loose files only.
const entriesOf = dir => new Promise((ok, no) => {
  const reader = dir.createReader(), all = [];
  const next = () => reader.readEntries(batch => (batch.length ? (all.push(...batch), next()) : ok(all)), no);
  next();
});
const fileOf = entry => new Promise((ok, no) => entry.file(ok, no));

export async function readDrop(entries) {
  const dirs = entries.filter(e => e.isDirectory), files = entries.filter(e => e.isFile);
  if (dirs.length > 1 || (dirs.length && files.length)) return { items: [], subfolders: [], error: "Drop one property folder at a time." };
  if (!dirs.length) return { items: await Promise.all(files.map(async e => ({ file: await fileOf(e), path: e.name }))), subfolders: [], error: null };
  const kids = await entriesOf(dirs[0]);
  return { items: await Promise.all(kids.filter(e => e.isFile).map(async e => ({ file: await fileOf(e), path: `${dirs[0].name}/${e.name}` }))),
    subfolders: kids.filter(e => e.isDirectory).map(e => e.name), error: null };
}

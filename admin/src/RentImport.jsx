import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDay } from "./format.js";
import { pence } from "./Rentals.jsx";
import { cleanDescription, occurrences, parseBankDate, parseMoney } from "../../server/rentals.js";

// Spec §4 Import (#/rentals/import), R9 and P13: the bank's CSV is read in this browser only (never stored), its columns
// are chosen once per bank (remembered by the header's SHA-256), every row is checked by the server in a dry run and then
// imported, both in sequential parts of 500 with each row's occurrence number counted over the whole file first.
const MAX_BYTES = 1024 * 1024, MAX_ROWS = 2000, PART = 500;
export const STATUS = { matched: "Matched to a tenancy", unmatched: "Unmatched", duplicate: "Already imported",
  by_hand: "Already recorded by hand", ignored: "Ignored" };
const TONE = { matched: "positive", unmatched: "attention", duplicate: "neutral", by_hand: "neutral", ignored: "neutral" };

// RFC 4180 without dependencies: quoted cells with "" for a quote, commas and line breaks inside quotes, CRLF or LF.
// Blank lines are dropped.
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      rows.push([...row, cell]); row = []; cell = "";
    } else cell += c;
  }
  rows.push([...row, cell]);
  return rows.filter(r => r.some(c => c.trim()));
}

const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
  .map(b => b.toString(16).padStart(2, "0")).join("");
// The first column whose name matches, trying each pattern in turn; else the first column.
const find = (header, ...res) => res.map(re => header.findIndex(h => re.test(h))).find(i => i >= 0) ?? 0;
const guess = (header, first) => ({ date: find(header, /date/i), amount: find(header, /paid in|money in|credit/i, /amount/i),
  description: find(header, /desc|narrative|detail|memo|payee|reference/i),
  date_format: /^\d{4}-/.test(first?.[find(header, /date/i)]?.trim() ?? "") ? "ISO" : "DMY" });
const read = (rows, m) => occurrences(rows.map(r => ({ date: parseBankDate(r[m.date], m.date_format), amount: parseMoney(r[m.amount]),
  description: cleanDescription(r[m.description]) })));
const plural = (n, one) => `${n.toLocaleString("en-GB")} ${one}${n === 1 ? "" : "s"}`;

export default function RentImport({ onChange }) {
  const [file, setFile] = useState(null), [map, setMap] = useState(null), [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(""), [summary, setSummary] = useState(null);
  const [done, setDone] = useState(null);
  const head = useRef(null);
  useEffect(() => { if (summary) head.current?.focus(); }, [summary]);

  const choose = async e => {
    const f = e.target.files[0];
    e.target.value = ""; // the same file can be chosen again
    setFile(null); setSummary(null); setDone(null); setErr(null); setProgress("");
    if (!f) return;
    if (f.size > MAX_BYTES) return setErr("This file is over 1 MB. Export a shorter period from the bank and choose it again.");
    const [header, ...rows] = parseCsv((await f.text()).replace(/^﻿/, ""));
    if (!rows.length) return setErr("This file has no rows under its first line (the column names).");
    if (rows.length > MAX_ROWS) return setErr(`This file has ${rows.length.toLocaleString("en-GB")} rows. Import up to 2,000 at a time: export a shorter period.`);
    const hash = await sha256(header.map(h => h.trim()).join(","));
    const saved = await api(`/admin/settings/csv-map?header=${hash}`).then(d => d.map, () => null);
    setMap(saved ?? guess(header, rows[0]));
    setFile({ name: f.name, header, rows, hash });
  };
  const set = k => e => { setMap(m => ({ ...m, [k]: k === "date_format" ? e.target.value : Number(e.target.value) })); setSummary(null); };

  // Sends the rows in parts, in order; a part that fails stops there, with the number of parts already through.
  const send = async (dry_run, verb) => {
    const rows = read(file.rows, map), parts = Math.ceil(rows.length / PART);
    const total = { matched: 0, unmatched: 0, duplicate: 0, by_hand: 0, ignored: 0, rows: [] };
    for (let i = 0; i < parts; i++) {
      setProgress(`${verb} rows ${(i * PART + 1).toLocaleString("en-GB")}–${Math.min((i + 1) * PART, rows.length).toLocaleString("en-GB")} of ${rows.length.toLocaleString("en-GB")}…`);
      const r = await api("/admin/payments/import", { method: "POST", body: { rows: rows.slice(i * PART, (i + 1) * PART), dry_run } })
        .catch(e => { e.parts = [i, parts]; throw e; });
      for (const k of Object.keys(STATUS)) total[k] += r[k];
      total.rows.push(...r.rows);
    }
    return total;
  };
  const check = async () => {
    setBusy(true); setErr(null); setSummary(null); setDone(null);
    try {
      await api(`/admin/settings/csv-map?header=${file.hash}`, { method: "PUT", body: map });
      const s = await send(true, "Checking");
      setProgress(""); setSummary(s);
    } catch (e) { setProgress(""); setErr(e.message); }
    finally { setBusy(false); }
  };
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const s = await send(false, "Importing");
      setProgress(""); setSummary(s); setDone(s);
    } catch (e) {
      const [ok, parts] = e.parts;
      setProgress(""); setErr(`${e.message} ${ok ? `The first ${ok} of ${parts} parts (rows 1–${(ok * PART).toLocaleString("en-GB")}) were saved.`
        : "Nothing was saved."} Import the same file again to add the rest: rows already imported are skipped.`);
    } finally { setBusy(false); onChange(); }
  };

  const writes = summary ? summary.matched + summary.unmatched : 0, sample = file && map ? read(file.rows.slice(0, 5), map) : [];
  // Labels apart from their selects, so a select's name is its label alone, not the column names listed in it.
  const column = (k, label) => <div className="field"><label htmlFor={`col-${k}`}>{label}</label>
    <select id={`col-${k}`} value={map[k]} onChange={set(k)} disabled={busy}>
      {file.header.map((h, i) => <option key={i} value={i}>{h.trim() || `Column ${i + 1}`}</option>)}</select></div>;
  const cells = r => <>
    <td className="num">{r.date ? fmtDay(r.date) : <span className="err">Not a date</span>}</td>
    <td className="wrap">{r.description || "—"}</td>
    <td className="num">{r.amount == null ? <span className="err">Not an amount</span> : pence(r.amount)}</td></>;

  return <section className="rent-import" aria-labelledby="t-import">
    <div className="head"><h1 id="t-import">Import bank CSV</h1><a href="#/rentals">Back to rentals</a></div>
    <p className="muted">The file is read in this browser and not stored. Only money in is imported, and importing the same file
      again adds nothing.</p>
    <section className="card fields-group" aria-labelledby="h-file"><h2 id="h-file">1. Choose the file</h2>
      <label>Bank statement (CSV)<input type="file" accept=".csv,text/csv" onChange={choose} disabled={busy} aria-describedby="d-file" /></label>
      <small id="d-file" className="muted">Up to 1 MB and 2,000 rows, with the column names on the first line.</small>
    </section>
    {file && <section className="card fields-group" aria-labelledby="h-columns"><h2 id="h-columns">2. Columns</h2>
      <p>{file.name}: {plural(file.rows.length, "row")}.</p>
      <div className="grid2">
        {column("date", "Date")}
        <div className="field"><label htmlFor="col-format">Date format</label>
          <select id="col-format" value={map.date_format} onChange={set("date_format")} disabled={busy}>
            <option value="DMY">DD/MM/YYYY</option><option value="ISO">YYYY-MM-DD</option></select></div>
        {column("amount", "Amount (money in)")}
        {column("description", "Description")}
      </div>
      <small className="muted">Amount is the money coming in: a signed amount, or the bank's Paid in column. Charges are ignored.</small>
      <div className="table-scroll" role="region" aria-labelledby="h-sample" tabIndex={0}>
        <table className="list small" id="import-sample"><caption id="h-sample">The first {sample.length} rows as they will be read</caption>
          <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Amount</th></tr></thead>
          <tbody>{sample.map((r, i) => <tr key={i}>{cells(r)}</tr>)}</tbody></table></div>
      <div className="inline"><button type="button" className="btn" onClick={check} disabled={busy}>Check rows</button></div>
    </section>}
    <p role="status" className="muted">{progress}</p>
    {err && <p role="alert" className="err">{err}</p>}
    {summary && <section className="card fields-group" aria-labelledby="h-summary">
      <h2 id="h-summary" ref={head} tabIndex={-1}>3. Summary</h2>
      <dl className="kv" id="import-counts">{Object.entries(STATUS).map(([k, t]) => <div key={k}><dt>{t}</dt><dd className="num">{summary[k]}</dd></div>)}</dl>
      <div className="table-scroll import-rows" role="region" aria-labelledby="h-rows" tabIndex={0}>
        <table className="list small" id="import-rows"><caption id="h-rows">Every row</caption>
          <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead>
          <tbody>{summary.rows.map((r, i) => <tr key={i}>{cells(r)}<td><span className={`badge ${TONE[r.status]}`}>{STATUS[r.status]}</span>
            {(r.payment_ref || r.reason) && <span className="muted cell-note">{r.payment_ref || r.reason}</span>}</td></tr>)}</tbody></table></div>
      {done ? <p role="status" className="ok">Imported {plural(writes, "payment")}: {done.matched} matched, {done.unmatched} unmatched.
        {done.by_hand > 0 && ` ${done.by_hand} already recorded by hand.`}{" "}
        {done.unmatched > 0 && <a href="#/rentals">Assign the unmatched payments in Rentals</a>}</p>
        : writes ? <div className="inline"><button type="button" className="btn" onClick={run} disabled={busy}>Import {plural(writes, "payment")}</button></div>
        : <p>Nothing new to import.</p>}
    </section>}
  </section>;
}

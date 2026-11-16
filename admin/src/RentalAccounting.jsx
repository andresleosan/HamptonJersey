import { useState } from "react";
import { accessReauth } from "./api.js";
import { useFieldErrors } from "./Sales.jsx";
import { jerseyToday, plusDays } from "../../server/viewings.js";

// ADM-21 (#/rentals/accounting): charges and write-offs, payments received, or closed landlord statements as a CSV for
// Hampton's accounts, for a range of Jersey days up to today (366 at most). Last month by default. The file is fetched
// first, so a refusal shows here instead of downloading; an empty range downloads nothing. Columns:
// docs/roadmap/work/ADM-21/columns.md.
const TYPES = [["charges", "Charges and write-offs"], ["payments", "Payments received"], ["statements", "Closed landlord statements"]];

export default function RentalAccounting() {
  const today = jerseyToday(), thisMonth = `${today.slice(0, 7)}-01`, lastEnd = plusDays(thisMonth, -1);
  const [f, setF] = useState({ type: "charges", from: `${lastEnd.slice(0, 7)}-01`, to: lastEnd });
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const { setErrors, invalid, error } = useFieldErrors("acc");
  const set = k => e => { setF(x => ({ ...x, [k]: e.target.value })); setMsg(null); };

  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null); setErrors({});
    try {
      const res = await fetch(`/api/admin/rental-accounting/export?${new URLSearchParams(f)}`, { credentials: "same-origin", redirect: "manual" });
      const lost = await accessReauth(res);
      if (lost) return setMsg({ text: lost.message });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (res.status === 401) window.dispatchEvent(new Event("hs:signed-out"));
        setErrors(data?.fields || {});
        return setMsg({ text: data?.error || `Error ${res.status}` });
      }
      const rows = Number(res.headers.get("x-export-rows")), name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition"))?.[1];
      if (!rows) return setMsg({ ok: true, text: "Nothing to export in this range." });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await res.blob());
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href));
      setMsg({ ok: true, text: `Downloaded ${rows.toLocaleString("en-GB")} row${rows === 1 ? "" : "s"}: ${name}.` });
    } catch { setMsg({ text: "Can't reach the server. Check your connection and try again." }); }
    finally { setBusy(false); }
  };

  return <section className="accounting" aria-labelledby="t-accounting">
    <div className="head"><h1 id="t-accounting">Accounting export</h1>
      <div className="ctl"><a className="btn ghost" href="#/rentals">Back to rentals</a></div></div>
    <form id="accounting-form" className="card accounting-form" onSubmit={submit} noValidate>
      <fieldset className="choices-set" aria-describedby={invalid("type")["aria-describedby"]}><legend>What to export</legend>
        <div className="choices">{TYPES.map(([v, t]) => <label key={v} className="check"><input type="radio" name="acc-type" value={v}
          checked={f.type === v} onChange={set("type")} />{t}</label>)}</div>
        {error("type")}</fieldset>
      <div className="filters">
        <label>From<input id="acc-from" type="date" required max={today} value={f.from} onChange={set("from")} {...invalid("from")} />
          {error("from")}</label>
        <label>To<input id="acc-to" type="date" required max={today} value={f.to} onChange={set("to")} {...invalid("to")} />
          {error("to")}</label>
        <button className="btn" disabled={busy}>{busy ? "Preparing…" : "Download CSV"}</button>
      </div>
      <small className="muted">Up to 366 days, ending today at the latest. Amounts are in pence (GBP), dates as YYYY-MM-DD.
        Statements are the latest closed revision of each month that ends in the range.</small>
    </form>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </section>;
}

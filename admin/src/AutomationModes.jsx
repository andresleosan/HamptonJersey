import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";

// AUT-10: how much review each operation's work gets. The server checks who may change it and the revision; no mode
// approves a match, confirms dictated criteria or closes a search.
const OPERATION = { listing_text: "Listing text drafts", market_ambiguity_v1: "Market listing interpretation",
  hampton_intent_v1: "Chat purpose" };
const MODE = { Draft: "Draft: a person approves each one", Approve: "Approve: a person approves them in a batch",
  Auto: "Auto: runs on its own; a sample is reviewed" };

export default function AutomationModes({ initial }) {
  const [ops, setOps] = useState(initial.operations), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const said = useRef(null), name = o => OPERATION[o.automation_id] ?? o.automation_id;
  useEffect(() => { if (msg) said.current.focus(); }, [msg]);
  const put = p => setOps(list => list.map(x => x.automation_id === p.automation_id && x.operation === p.operation ? p : x));
  const change = async (o, mode) => {
    if (mode === "Auto" && !confirm(`Set ${name(o)} to Auto? Approving matches, dictated criteria and closing a search still need a person.`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api("/admin/automations/modes", { method: "POST",
        body: { automation_id: o.automation_id, operation: o.operation, mode, expected_revision: o.revision } });
      put(r.policy); setMsg({ ok: true, text: `${name(o)}: ${r.policy.mode}.` });
    } catch (e) { if (e.data?.policy) put(e.data.policy); setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  return <article className="card" aria-labelledby="a-modes">
    <h2 id="a-modes">Modes</h2>
    <p className="muted">How much review each automation's work gets. Approving a match, confirming dictated criteria and closing a search always need a person, in every mode.</p>
    {!initial.can_edit && <p className="muted">Only people granted mode management can change these.</p>}
    {ops.map(o => <label key={`${o.automation_id}:${o.operation}`}>{name(o)}
      <select value={o.mode} disabled={busy || !initial.can_edit} onChange={e => change(o, e.target.value)}>
        {Object.entries(MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <span>Changed by {o.updated_by === "migration" ? "setup" : o.updated_by} on {fmtDate(o.updated_at)}</span></label>)}
    {msg && <p ref={said} tabIndex={-1} role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </article>;
}

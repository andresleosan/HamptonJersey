import { useEffect, useRef, useState } from "react";
import { api, accessReauth } from "./api.js";
import { fmtDate, fmtDay } from "./format.js";
import { setUnsaved } from "./unsaved.js";
import { useFieldErrors } from "./Sales.jsx";
import { jerseyToday } from "../../server/viewings.js";

// PRE-12 (#/privacy, with its switch): privacy requests the team records by hand, from an email, a call, a letter or a
// visit. A person links the contact, checks the identity and reviews the copy. Nothing here deletes or sends anything.
const KINDS = { access: "Access", rectification: "Rectification", erasure: "Erasure", objection: "Objection", portability: "Portability" };
const VIAS = { email: "Email", phone: "Phone", letter: "Letter", in_person: "In person" };
const METHODS = { photo_id: "Photo ID seen", details_on_record: "Confirmed through the details on our record",
  in_person: "In person", other: "Other" };
const RESULTS = { fulfilled: "Done", partially_fulfilled: "Partly done", refused: "Refused", withdrawn: "Withdrawn by the person" };
const HOLDS = { sale: "Has a sale, in any state: kept.", open_offer: "Has an open offer: kept while the negotiation lasts.",
  open_search: "Has an active search, or one under review: resolve and archive it first.",
  privacy_request: "Has another open privacy request (not an erasure one): close it first.",
  running_tenancy: "Linked as the tenant of a running tenancy: kept while it runs, or remove the link if it is not theirs." };
const REMOVE = { contact: "Contact record", searches: "Searches", offers: "Offers", matches: "Matches",
  marketing_preferences: "Marketing preferences" };
const ACTIONS = { created: "Recorded", updated: "Details changed", contact_linked: "Contact linked", identity_verified: "Identity checked",
  copy_viewed: "Copy opened", copy_reviewed: "Copy reviewed", closed: "Closed" };
const COPY_KINDS = ["access", "portability"];
const nameOf = (team, email) => team.find(t => t.email === email)?.name || email;
const Status = ({ r }) => r.state === "closed" ? <span className="badge closed">Closed · {RESULTS[r.result]}</span>
  : <span className="badge attention">Open</span>;
const Failure = ({ msg, reload, focus }) => msg && <p ref={focus} tabIndex={-1} role="alert" className="err">{msg.text}
  {msg.stale && <> <button type="button" className="btn ghost sm" onClick={reload}>Reload</button></>}</p>;

export default function PrivacyRequests({ id }) {
  return id ? <Detail key={id} id={id} /> : <List />;
}

function List() {
  const [d, setD] = useState(null), [err, setErr] = useState(null), [adding, setAdding] = useState(false);
  const load = () => api("/admin/privacy-requests").then(x => { setD(x); setErr(null); }, e => setErr(e.message));
  useEffect(() => { load(); }, []);
  return <section className="automations privacy" aria-labelledby="t-privacy">
    <div className="head"><div><h1 id="t-privacy">Privacy requests</h1>
      <p className="muted">Requests to see, correct, delete, object to or move personal data, recorded by hand. Nothing here deletes or sends anything.</p></div>
      {d && !adding && <button type="button" className="btn" onClick={() => setAdding(true)}>Record a request</button>}</div>
    {err && <p role="alert" className="err">{err} <button type="button" className="btn ghost sm" onClick={load}>Try again</button></p>}
    {!d ? !err && <p role="status">Loading privacy requests…</p> : <>
      {adding && <NewRequest team={d.team} onCancel={() => setAdding(false)} />}
      {d.requests.length === 0 ? <p className="empty">No privacy requests recorded.</p>
        : <div className="table-scroll"><table className="list"><caption>Requests, open first by deadline</caption>
          <thead><tr><th scope="col">Received</th><th scope="col">Type</th><th scope="col">Where it came from</th><th scope="col">Contact</th>
            <th scope="col">Assigned to</th><th scope="col">Deadline</th><th scope="col">Status</th></tr></thead>
          <tbody>{d.requests.map(r => <tr key={r.id}><td>{fmtDay(r.received_on)}</td><td>{KINDS[r.kind]}</td>
            <td><a href={`#/privacy/${r.id}`}>{r.reference}</a></td><td>{r.contact?.name ?? "Not linked"}</td>
            <td>{r.assigned_to ? nameOf(d.team, r.assigned_to) : "Not assigned"}</td><td>{r.due_on ? fmtDay(r.due_on) : "Not set"}</td>
            <td><Status r={r} /></td></tr>)}</tbody></table></div>}</>}
  </section>;
}

function NewRequest({ team, onCancel }) {
  const empty = { kind: "", received_on: jerseyToday(), received_via: "email", reference: "", due_on: "", assigned_to: "" };
  const [f, setF] = useState(empty), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const opId = useRef(crypto.randomUUID()), form = useRef(null), first = useRef(null), fe = useFieldErrors("pr");
  const dirty = JSON.stringify(f) !== JSON.stringify(empty);
  useEffect(() => { setUnsaved(dirty); return () => setUnsaved(false); }, [dirty]);
  useEffect(() => { first.current?.focus(); }, []);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null); fe.setErrors({});
    try {
      const { request } = await api("/admin/privacy-requests", { method: "POST", body: { id: opId.current, kind: f.kind,
        received_on: f.received_on, received_via: f.received_via, reference: f.reference, due_on: f.due_on || null,
        assigned_to: f.assigned_to || null } });
      setUnsaved(false); location.hash = `#/privacy/${request.id}`;
    } catch (x) {
      const fields = x.data?.fields || {};
      fe.setErrors(fields); setMsg({ text: Object.keys(fields).length ? "Please check the highlighted fields." : x.message }); setBusy(false);
      requestAnimationFrame(() => form.current?.querySelector('[aria-invalid="true"]')?.focus());
    }
  };
  return <form ref={form} className="card" onSubmit={submit} noValidate aria-labelledby="h-new-privacy">
    <h2 id="h-new-privacy">Record a request</h2>
    <div className="grid2">
      <label>Type of request<select ref={first} value={f.kind} onChange={set("kind")} {...fe.invalid("kind")}>
        <option value="">Choose…</option>{Object.entries(KINDS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>{fe.error("kind")}</label>
      <label>How it arrived<select value={f.received_via} onChange={set("received_via")} {...fe.invalid("received_via")}>
        {Object.entries(VIAS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>{fe.error("received_via")}</label>
      <label>Received on<input type="date" max={jerseyToday()} value={f.received_on} onChange={set("received_on")}
        {...fe.invalid("received_on")} />{fe.error("received_on")}</label>
      <div className="field"><label>Legal deadline (optional)<input type="date" min={f.received_on} value={f.due_on} onChange={set("due_on")}
        {...fe.invalid("due_on")} aria-describedby={["d-pr-due", fe.invalid("due_on")["aria-describedby"]].filter(Boolean).join(" ")} />
        {fe.error("due_on")}</label>
        <small id="d-pr-due" className="muted">Enter the deadline that applies. The app does not work one out.</small></div>
      <div className="field"><label>Where it came from<input value={f.reference} onChange={set("reference")} maxLength={200} autoComplete="off"
        {...fe.invalid("reference")} aria-describedby={["d-pr-ref", fe.invalid("reference")["aria-describedby"]].filter(Boolean).join(" ")} />
        {fe.error("reference")}</label>
        <small id="d-pr-ref" className="muted">For example the email's subject and date. Keep the request itself out.</small></div>
      <label>Assigned to<select value={f.assigned_to} onChange={set("assigned_to")} {...fe.invalid("assigned_to")}>
        <option value="">Not assigned</option>{team.map(t => <option key={t.email} value={t.email}>{t.name || t.email}</option>)}</select>
        {fe.error("assigned_to")}</label>
    </div>
    <div className="inline"><button className="btn" disabled={busy}>{busy ? "Saving…" : "Save request"}</button>
      <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>Cancel</button></div>
    {msg && <p role="alert" className="err">{msg.text}</p>}
  </form>;
}

function Detail({ id }) {
  const [d, setD] = useState(null), [team, setTeam] = useState([]), [err, setErr] = useState(null), [ok, setOk] = useState(null);
  const head = useRef(null), said = useRef(null), focused = useRef(false);
  const load = () => Promise.all([api(`/admin/privacy-requests/${id}`), api("/admin/privacy-requests")])
    .then(([x, all]) => { setD(x); setTeam(all.team); setErr(null); }, e => setErr(e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (d && !focused.current) { focused.current = true; head.current?.focus(); } }, [d]);
  useEffect(() => { if (ok) said.current?.focus(); }, [ok]);
  if (!d) return err ? <p role="alert" className="err">{err} <button type="button" className="btn ghost sm" onClick={load}>Try again</button></p>
    : <p role="status">Loading the request…</p>;
  const r = d.request, open = r.state === "open";
  const done = text => () => load().then(() => setOk(text));
  return <section className="automations privacy" aria-labelledby="t-request">
    <p><a href="#/privacy">All privacy requests</a></p>
    <div className="head"><div><h1 id="t-request" ref={head} tabIndex={-1}>{KINDS[r.kind]} request</h1>
      <p className="muted">Recorded by {nameOf(team, r.created_by)} on {fmtDate(r.created_at)}.</p></div><Status r={r} /></div>
    {ok && <p ref={said} tabIndex={-1} role="status" className="ok">{ok}</p>}
    <div className="card"><h2>Request</h2><dl className="checks">
      <div><dt>Received</dt><dd>{fmtDay(r.received_on)} · {VIAS[r.received_via]}</dd></div>
      <div><dt>From</dt><dd>{r.reference}</dd></div>
      <div><dt>Deadline</dt><dd>{r.due_on ? fmtDay(r.due_on) : "Not set"}</dd></div>
      <div><dt>Assigned</dt><dd>{r.assigned_to ? nameOf(team, r.assigned_to) : "Not assigned"}</dd></div>
      <div><dt>Contact</dt><dd>{r.contact?.name ?? "Not linked"}</dd></div></dl>
      {!r.due_on && open && <p className="warn">No deadline recorded for this request.</p>}</div>
    {open && <Details key={`d${r.revision}`} r={r} team={team} onSaved={done("Request saved.")} reload={load} />}
    <ContactCard key={`c${r.revision}`} r={r} onSaved={done("Contact linked.")} reload={load} />
    <Identity key={`i${r.revision}`} r={r} team={team} onSaved={done("Identity check recorded.")} reload={load} />
    {r.contact && <div className="card"><h2>Holds</h2>
      {d.holds.length ? <ul>{d.holds.map(h => <li key={h.code}>{HOLDS[h.code]}</li>)}</ul>
        : <p>No holds: nothing the cleanup keeps for this contact.</p>}</div>}
    {d.erasure && <Erasure plan={d.erasure} />}
    {d.viewings && <ViewingReview r={r} viewings={d.viewings} team={team} done={done} reload={load} />}
    {d.tenancies && <TenancyReview r={r} tenancies={d.tenancies} team={team} done={done} reload={load} />}
    {COPY_KINDS.includes(r.kind) && <Copy key={`p${r.revision}-${d.viewings?.filter(v => v.confirmed).map(v => v.id).join(".")}-${
      d.tenancies?.filter(t => t.link?.current).map(t => t.id).join(".")}`}
      r={r} team={team} onSaved={done("Copy marked as reviewed.")} reload={load} />}
    {open ? <Close key={`x${r.revision}`} r={r} onSaved={done("Request closed.")} reload={load} />
      : <div className="card"><h2>Result</h2><p>{RESULTS[r.result]}, recorded by {nameOf(team, r.closed_by)} on {fmtDate(r.closed_at)}.</p>
        {r.result_note && <p>{r.result_note}</p>}</div>}
    <div className="card"><h2>History</h2><ul>{d.audit.map(a => <li key={a.id}>{fmtDate(a.at)} · {ACTIONS[a.action]} by {nameOf(team, a.actor)}</li>)}</ul></div>
  </section>;
}

// One small form posting to the request: errors under the fields, a 409 offers to reload.
function useChange(prefix, path, method, onSaved) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), fe = useFieldErrors(prefix), said = useRef(null);
  useEffect(() => { if (msg) said.current?.focus(); }, [msg]);
  const send = async body => {
    if (busy) return;
    setBusy(true); setMsg(null); fe.setErrors({});
    try { const x = await api(path, { method, body }); setBusy(false); onSaved(x); }
    catch (x) {
      const fields = x.data?.fields || {};
      fe.setErrors(fields); setBusy(false);
      setMsg({ text: Object.keys(fields).length ? "Please check the highlighted fields." : x.message, stale: x.status === 409 });
    }
  };
  return { busy, msg, said, send, ...fe };
}

function Details({ r, team, onSaved, reload }) {
  const initial = { assigned_to: r.assigned_to ?? "", due_on: r.due_on ?? "", reference: r.reference };
  const [f, setF] = useState(initial), a = useChange("pd", `/admin/privacy-requests/${r.id}`, "PUT", onSaved);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  useEffect(() => { setUnsaved(dirty); return () => setUnsaved(false); }, [dirty]);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  return <form className="card" noValidate aria-labelledby="h-pd" onSubmit={e => { e.preventDefault();
    a.send({ revision: r.revision, assigned_to: f.assigned_to || null, due_on: f.due_on || null, reference: f.reference }); }}>
    <h2 id="h-pd">Assignment and deadline</h2>
    <div className="grid2">
      <label>Assigned to<select value={f.assigned_to} onChange={set("assigned_to")} {...a.invalid("assigned_to")}>
        <option value="">Not assigned</option>{team.map(t => <option key={t.email} value={t.email}>{t.name || t.email}</option>)}</select>{a.error("assigned_to")}</label>
      <label>Legal deadline<input type="date" min={r.received_on} value={f.due_on} onChange={set("due_on")} {...a.invalid("due_on")} />{a.error("due_on")}</label>
      <label>Where it came from<input value={f.reference} onChange={set("reference")} maxLength={200} autoComplete="off" {...a.invalid("reference")} />{a.error("reference")}</label>
    </div>
    <div className="inline"><button className="btn" disabled={!dirty || a.busy}>{a.busy ? "Saving…" : "Save"}</button>
      {dirty && <span className="unsaved">Unsaved changes</span>}</div>
    <Failure msg={a.msg} reload={reload} focus={a.said} />
  </form>;
}

function ContactCard({ r, onSaved, reload }) {
  const [q, setQ] = useState(""), [found, setFound] = useState(null), [searching, setSearching] = useState(!r.contact && r.state === "open");
  const search = useChange("ps", "/admin/privacy-requests/contact-search", "POST", x => setFound(x.contacts));
  const link = useChange("pl", `/admin/privacy-requests/${r.id}/contact`, "POST", onSaved);
  return <div className="card"><h2>Contact</h2>
    <p>{r.contact ? <>Linked to <strong>{r.contact.name}</strong>.</> : "No contact linked."} Linking another contact clears the identity check and the copy review.</p>
    {r.state === "open" && !searching && <div className="inline"><button type="button" className="btn ghost sm" onClick={() => setSearching(true)}>Change contact</button></div>}
    {r.state === "open" && searching && <>
      <form className="inline" role="search" noValidate onSubmit={e => { e.preventDefault(); search.send({ q }); }}>
        <label>Name, email or phone<input type="search" value={q} onChange={e => setQ(e.target.value)} maxLength={100} autoComplete="off"
          {...search.invalid("q")} />{search.error("q")}</label>
        <button className="btn ghost sm" disabled={search.busy}>{search.busy ? "Searching…" : "Search contacts"}</button></form>
      <p className="muted">A matching email or phone does not prove who wrote: choose the person, then check the identity.</p>
      {found && (found.length ? <ul aria-label="Contacts found">{found.map(c => <li key={c.id}>{c.name} · {c.email || "no email"} · {c.phone || "no phone"}{" "}
        <button type="button" className="btn ghost sm" disabled={link.busy || r.contact?.id === c.id}
          onClick={() => link.send({ revision: r.revision, contact_id: c.id })}>Link {c.name}</button></li>)}</ul>
        : <p role="status">No contacts found.</p>)}
      <Failure msg={search.msg} reload={reload} focus={search.said} />
      <Failure msg={link.msg} reload={reload} focus={link.said} /></>}
  </div>;
}

function Identity({ r, team, onSaved, reload }) {
  const [method, setMethod] = useState(""), [ref, setRef] = useState("");
  const a = useChange("pi", `/admin/privacy-requests/${r.id}/identity`, "POST", onSaved);
  const id = r.identity;
  return <div className="card"><h2>Identity check</h2>
    {!r.contact ? <p className="muted">Link the contact first.</p> : id
      ? <p><span className="badge positive">Checked</span> by {nameOf(team, id.verified_by)} on {fmtDate(id.verified_at)}: {METHODS[id.method]}{id.reference && <>. {id.reference}</>}</p>
      : r.state === "open" && <form noValidate aria-labelledby="h-pi" onSubmit={e => { e.preventDefault(); a.send({ revision: r.revision, method, reference: ref || null }); }}>
        <p id="h-pi" className="muted">Record how a person on the team checked that the request comes from {r.contact.name}.</p>
        <fieldset className="choices-set"><legend>How the identity was checked</legend>
          <div className="choices">{Object.entries(METHODS).map(([k, t]) => <label key={k} className="check">
            <input type="radio" name="pi-method" value={k} checked={method === k} onChange={() => setMethod(k)}
              aria-describedby={a.errors.method ? "e-pi-method" : undefined} />{t}</label>)}</div>{a.error("method")}</fieldset>
        <div className="field"><label>Reference (optional)<input value={ref} onChange={e => setRef(e.target.value)} maxLength={120} autoComplete="off"
          {...a.invalid("reference")} aria-describedby={["d-pi-ref", a.invalid("reference")["aria-describedby"]].filter(Boolean).join(" ")} />
          {a.error("reference")}</label>
          <small id="d-pi-ref" className="muted">Say what was seen, for example «passport seen at the office». Never write the document's number.</small></div>
        <div className="inline"><button className="btn" disabled={a.busy}>{a.busy ? "Saving…" : "Record identity check"}</button></div>
        <Failure msg={a.msg} reload={reload} focus={a.said} /></form>}
  </div>;
}

const BY_HAND = {
  rentals: () => "Rentals: not linked to contacts. Check Rentals by hand.",
  viewing_requests: n => `Viewing requests with the same email or phone: ${n}. Other people can share an email or phone: check each one before deleting it from Viewings.`,
  tenancies: n => `Tenancies linked to this contact: ${n}. They are kept under their own rules and never deleted from here.`,
  tenancy_candidates: n => `Tenancies still to check below: ${n}.`,
};
function Erasure({ plan }) {
  return <div className="card"><h2>What a deletion would remove</h2>
    <p className="muted">Nothing is deleted here. To delete, archive each search and use Delete on the applicant.</p>
    {!plan.can_delete && <p className="warn">Held: the holds above keep this contact. Resolve them before deleting.</p>}
    <ul>{plan.remove.map(x => <li key={x.item}>{REMOVE[x.item]}: {x.count}</li>)}</ul>
    <h3>To check by hand</h3>
    <ul>{plan.by_hand.map(x => <li key={x.item}>{BY_HAND[x.item](x.count)}</li>)}</ul>
  </div>;
}

// Viewing requests carry no contact: those with the contact's email or phone are checked one by one, and only the ones a
// person confirms go in the copy.
function ViewingReview({ r, viewings, team, done, reload }) {
  return <div className="card"><h2>Viewing requests to check</h2>
    <p className="muted">These viewing requests have {r.contact.name}'s email or phone. Other people can share an email or phone:
      confirm only the ones that are this person's. Only confirmed ones go in the copy.</p>
    {viewings.length ? <ul className="viewing-review">{viewings.map(v => <ViewingItem key={v.id} r={r} v={v} team={team}
      onSaved={done(v.confirmed ? "Viewing request taken out of the copy." : "Viewing request added to the copy.")} reload={reload} />)}</ul>
      : <p>No viewing requests with this contact's email or phone.</p>}
  </div>;
}

function ViewingItem({ r, v, team, onSaved, reload }) {
  const a = useChange(`pv${v.id}`, `/admin/privacy-requests/${r.id}/viewings/${v.id}`, "POST", onSaved);
  const what = `${fmtDay(v.date)} at ${v.time}`, action = v.confirmed ? "Take out of the copy" : "Confirm it is theirs";
  return <li><p><strong>{what}</strong> · {v.listing_title_snapshot || v.listing_ref || "No property"} · {v.name} ·{" "}
    {v.email || "no email"} · {v.phone || "no phone"}</p>
    {v.confirmed && <p><span className="badge positive">In the copy</span> Confirmed by {nameOf(team, v.confirmed.by)} on {fmtDate(v.confirmed.at)}.</p>}
    {r.state === "open" && <div className="inline"><button type="button" className={v.confirmed ? "btn ghost sm" : "btn sm"}
      disabled={a.busy} aria-label={`${action}: viewing request of ${what}`} onClick={() => a.send({ confirmed: !v.confirmed })}>
      {a.busy ? "Saving…" : action}</button></div>}
    <Failure msg={a.msg} reload={reload} focus={a.said} /></li>;
}

// Tenancies carry no contact: those with the contact's email or phone, or started from their search, are linked by a
// person one by one. A link lasts beyond this request; linked tenancies go in the copy.
function TenancyReview({ r, tenancies, team, done, reload }) {
  return <div className="card"><h2>Tenancies to check</h2>
    <p className="muted">These tenancies have {r.contact.name}'s email or phone, or started from their search. Other people can share
      an email or phone: link only the tenancies where this person is the tenant. Linked ones go in the copy with their address,
      dates and tenant details, and a running one keeps the contact from being deleted.</p>
    {tenancies.length ? <ul className="viewing-review">{tenancies.map(t => <TenancyItem key={t.id} r={r} t={t} team={team}
      onSaved={done("Tenancy link saved.")} reload={reload} />)}</ul>
      : <p>No tenancies with this contact's email or phone.</p>}
  </div>;
}

function TenancyItem({ r, t, team, onSaved, reload }) {
  const a = useChange(`pt${t.id}`, `/admin/privacy-requests/${r.id}/tenancies/${t.id}`, "POST", onSaved);
  const l = t.link, on = l?.linked && l.current, what = `${t.address} from ${fmtDay(t.start_on)}`;
  const action = on ? "Remove link" : l?.linked ? "Confirm again" : "Link as tenant";
  return <li><p><strong>{t.address}</strong> · {t.tenant_name} · {t.tenant_email || "no email"} · {t.tenant_phone || "no phone"} ·
    from {fmtDay(t.start_on)}{t.ended_on && ` to ${fmtDay(t.ended_on)}`}</p>
    {l?.linked && <p>{on ? <span className="badge positive">Linked</span> : <span className="badge attention">Tenant details changed</span>}
      {" "}by {nameOf(team, l.by)} on {fmtDate(l.at)}.{!on && " Confirm the link again or remove it."}</p>}
    {r.state === "open" && <div className="inline"><button type="button" className={on ? "btn ghost sm" : "btn sm"} disabled={a.busy}
      aria-label={`${action}: tenancy at ${what}`} onClick={() => a.send({ linked: !on })}>{a.busy ? "Saving…" : action}</button>
      {l?.linked && !on && <button type="button" className="btn ghost sm" disabled={a.busy} aria-label={`Remove link: tenancy at ${what}`}
        onClick={() => a.send({ linked: false })}>Remove link</button>}</div>}
    <Failure msg={a.msg} reload={reload} focus={a.said} /></li>;
}

function Copy({ r, team, onSaved, reload }) {
  const [preview, setPreview] = useState(null), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const a = useChange("pc", `/admin/privacy-requests/${r.id}/copy-review`, "POST", onSaved);
  const show = () => { setBusy(true); setErr(null);
    api(`/admin/privacy-requests/${r.id}/copy`).then(x => { setPreview(x); setBusy(false); }, e => { setErr(e.message); setBusy(false); }); };
  const ready = r.contact && r.identity;
  // Fetched rather than linked, so a refused download (data changed since the review) says why on this page.
  const download = async format => {
    setErr(null);
    const res = await fetch(`/api/admin/privacy-requests/${r.id}/copy/download?format=${format}`, { credentials: "same-origin", redirect: "manual" }).catch(() => null);
    const lost = res && await accessReauth(res);
    if (lost) { setErr(lost.message); return; }
    if (!res?.ok) {
      if (res?.status === 401) window.dispatchEvent(new Event("hs:signed-out"));
      setErr((await res?.json().catch(() => null))?.error ?? "Can't download the copy. Try again."); return;
    }
    const url = URL.createObjectURL(await res.blob()), link = document.createElement("a");
    link.href = url; link.download = `hampton-data-copy-${r.id}.${format}`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="card"><h2>Copy for the person</h2>
    {!ready ? <p className="muted">Link the contact and check the identity first.</p> : <>
      {r.copy_review ? <>
        <p><span className="badge positive">Reviewed</span> by {nameOf(team, r.copy_review.reviewed_by)} on {fmtDate(r.copy_review.reviewed_at)}.
          If the data has changed since, the download asks for a new review.</p>
        {r.state === "open" && <div className="inline"><button type="button" className="btn ghost sm" onClick={() => download("json")}>Download JSON</button>
          <button type="button" className="btn ghost sm" onClick={() => download("csv")}>Download CSV</button></div>}</>
        : <p className="muted">Read the copy before marking it as reviewed. Only a reviewed copy can be downloaded.</p>}
      {r.state === "open" && <div className="inline"><button type="button" className="btn ghost sm" disabled={busy} onClick={show}>
        {busy ? "Preparing…" : preview ? "Refresh copy" : "Show copy"}</button></div>}
      {err && <p role="alert" className="err">{err}</p>}
      {preview && <>
        <pre className="copy-preview" tabIndex={0} aria-label="Copy to review">{JSON.stringify(preview.copy, null, 2)}</pre>
        {r.copy_review?.sha256 !== preview.sha256 && <div className="inline"><button type="button" className="btn" disabled={a.busy}
          onClick={() => a.send({ revision: r.revision, sha256: preview.sha256 })}>{a.busy ? "Saving…" : "Mark copy as reviewed"}</button></div>}
        <Failure msg={a.msg} reload={reload} focus={a.said} /></>}
    </>}
  </div>;
}

function Close({ r, onSaved, reload }) {
  const [result, setResult] = useState(""), [note, setNote] = useState("");
  const a = useChange("px", `/admin/privacy-requests/${r.id}/close`, "POST", onSaved);
  return <form className="card" noValidate aria-labelledby="h-px" onSubmit={e => { e.preventDefault(); a.send({ revision: r.revision, result, note: note || null }); }}>
    <h2 id="h-px">Close the request</h2>
    <p className="muted">Record what was done. Closing deletes and sends nothing.</p>
    {["access", "portability"].includes(r.kind) && <p className="warn">Download the copy before closing: a closed request no longer serves it.</p>}
    <fieldset className="choices-set"><legend>Result</legend>
      <div className="choices">{Object.entries(RESULTS).map(([k, t]) => <label key={k} className="check">
        <input type="radio" name="px-result" value={k} checked={result === k} onChange={() => setResult(k)}
          aria-describedby={a.errors.result ? "e-px-result" : undefined} />{t}</label>)}</div>{a.error("result")}</fieldset>
    <label>Note (optional)<textarea className="short" value={note} onChange={e => setNote(e.target.value)} maxLength={500} {...a.invalid("note")} />{a.error("note")}</label>
    <div className="inline"><button className="btn" disabled={a.busy}>{a.busy ? "Saving…" : "Close request"}</button></div>
    <Failure msg={a.msg} reload={reload} focus={a.said} />
  </form>;
}

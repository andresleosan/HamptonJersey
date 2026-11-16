import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";
import { Note, useSave } from "./TenancyExit.jsx";

// PRE-12 (server/tenancy-contact-links.js, flag PRE12_TENANCY_LINK_READY): in each tenancy card, the contact of its
// tenant, linked by a person. A contact with the tenant's email or phone, or the applicant the tenancy started from, is
// only proposed. With the flag off the route answers 404 and none of this shows.
const WHY = { email: "same email", phone: "same phone", origin: "the applicant this tenancy started from" };
let switchedOff = false; // once a 404 says so, no other card asks again until the page reloads

export function TenancyContact({ id, tick }) {
  const [d, setD] = useState(null), [off, setOff] = useState(switchedOff), [err, setErr] = useState(null), s = useSave(`tc${id}`);
  const load = () => (switchedOff ? setOff(true) : api(`/admin/tenancies/${id}/contacts`).then(x => { setD(x); setErr(null); },
    e => (e.status === 404 ? setOff(switchedOff = true) : setErr(e.message))));
  useEffect(() => { load(); }, [id, tick]);
  if (off) return null;
  if (!d) return err && <p role="alert" className="err">{err} <button type="button" className="btn ghost sm" onClick={load}>Try again</button></p>;
  const set = (c, linked) => s.run(async () => setD(await api(`/admin/tenancies/${id}/contacts/${c.id}`, { method: "POST", body: { linked } })),
    linked ? `${c.name} linked as the tenant.` : `Link to ${c.name} removed.`);
  return <div ref={s.ref}>
    <h3>Contact</h3>
    <p className="muted">A privacy request finds this tenancy only through a link a person confirms. A contact with the same email
      or phone is only a suggestion: other people can share them.</p>
    {d.contacts.length ? <ul className="plain-list">{d.contacts.map(c => {
      const l = c.link, on = l?.linked && l.current, stale = l?.linked && !l.current;
      return <li key={c.id}><span>{c.name}<span className="muted cell-note">{c.matched_by.map(k => WHY[k]).join(", ") || "linked before"}
        {l && ` · ${l.linked ? "linked" : "link removed"} by ${l.by} on ${fmtDate(l.at)}`}</span></span>
        <span className="ctl">{on && <span className="badge positive">Linked</span>}
          {stale && <span className="badge attention">Tenant details changed</span>}
          {!on && <button type="button" className="btn sm" disabled={s.busy} onClick={() => set(c, true)}>
            {stale ? "Confirm again" : "Link as tenant"}<span className="sr"> {c.name}</span></button>}
          {l?.linked && <button type="button" className="btn ghost sm" disabled={s.busy} onClick={() => set(c, false)}>
            Remove link<span className="sr"> to {c.name}</span></button>}</span></li>;
    })}</ul> : <p>No contact has this tenant's email or phone.</p>}
    <Note msg={s.msg} onReload={s.reload(load)} />
  </div>;
}

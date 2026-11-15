import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";

// AGE-10: which files of the latest captured record (SPR-03) may be shown to a client in a private presentation. A
// person decides, file by file, with the evidence; a branded photo stays internal. Staff only, hidden until the server
// reports enabled (AGE10_PHOTOS_READY and migration 0085). Nothing here changes a file, makes it public or sends it.
const BADGE = { private_approved: ["positive", "Suitable for clients"], branded: ["attention", "Branded · internal only"],
  denied: ["attention", "Not authorised"], revoked: ["attention", "Permission withdrawn"] };
const BASIS = { own: "Hampton's own photo", supplied_unbranded: "Unbranded version supplied by the advertiser or owner",
  authorized_unbranded: "Unbranded, and the advertiser authorised sharing it" };
const CHOICES = [...Object.entries(BASIS).map(([basis, text]) => [basis, `Suitable · ${text}`, { status: "private_approved", basis }]),
  ["branded", "Branded · keep internal", { status: "branded" }], ["denied", "Not authorised to share", { status: "denied" }]];
const WITHDRAW = ["revoked", "Withdraw the permission", { status: "revoked" }];
const source = s => s.added_by === "import" ? ["Agency import", s.provider, s.rights_status && `permission recorded then: ${s.rights_status}`]
  .filter(Boolean).join(" · ") : s.origin === "hampton" ? "Hampton's photo library" : "Uploaded by the team";

function Review({ f, onSaved }) {
  const [choice, setChoice] = useState(""), [evidence, setEvidence] = useState(""), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const d = f.decision, choices = d?.status === "private_approved" ? [...CHOICES, WITHDRAW] : CHOICES, id = `pm-${f.asset_id}`;
  const save = async e => {
    e.preventDefault();
    if (busy) return;
    const pick = choices.find(c => c[0] === choice);
    if (!pick) return setMsg({ text: "Choose a decision." });
    setBusy(true); setMsg(null);
    try {
      onSaved(await api("/admin/photo-permissions", { method: "POST",
        body: { asset_id: f.asset_id, version: f.version, ...pick[2], evidence_ref: evidence } }));
      setChoice(""); setEvidence("");
    } catch (err) { setMsg({ text: err.message }); }
    finally { setBusy(false); }
  };
  const name = f.label || (f.role === "floorplan" ? "Floor plan" : "Photo");
  return <li>
    <div className="inline">
      <img className="thumb" src={`/media/${encodeURIComponent(f.media_id)}?thumb`} alt="" loading="lazy" />
      <span><strong>{name}</strong>{" "}<span className={`badge ${d ? BADGE[d.status][0] : "neutral"}`}>{d ? BADGE[d.status][1] : "To review"}</span></span>
    </div>
    <span className="muted">Source: {source(f.source)}</span>
    {d && <><br /><span className="muted">{d.basis ? `${BASIS[d.basis]} · ` : ""}{d.evidence_ref ? `Evidence: ${d.evidence_ref} · ` : ""}
      reviewed by {d.reviewed_by}, {fmtDate(d.reviewed_at)}</span></>}
    {f.earlier && <><br /><span className="muted">Reviewed on an earlier version of this file: review it again.</span></>}
    <form className="grid2" onSubmit={save} aria-label={`Decision for ${name}`} noValidate>
      <label>Decision<select value={choice} onChange={e => setChoice(e.target.value)} aria-describedby={msg ? `${id}-msg` : undefined}>
        <option value="">Choose…</option>{choices.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>
      <label>Evidence reference<input value={evidence} maxLength={500} autoComplete="off" onChange={e => setEvidence(e.target.value)}
        placeholder="e.g. Agency email of 12 Nov in the property file" /></label>
      <div className="inline"><button className="btn ghost sm" disabled={busy}>{busy ? "Saving…" : "Save decision"}</button></div>
    </form>
    {msg && <p id={`${id}-msg`} role="alert" className="err">{msg.text}</p>}
  </li>;
}

export default function PrivateMediaReview({ listingId }) {
  const [data, setData] = useState(null), [saved, setSaved] = useState(false);
  useEffect(() => {
    let live = true;
    setData(null); setSaved(false);
    // A failed read hides the card, as when it is switched off.
    api(`/admin/listings/${encodeURIComponent(listingId)}/photo-permissions`).then(d => { if (live) setData(d); }, () => {});
    return () => { live = false; };
  }, [listingId]);
  if (!data?.enabled || !data.capture_id) return null;
  const onSaved = d => { setData(d); setSaved(true); };
  return <section id="s-photo-permissions" className="card fields-group" aria-labelledby="h-photo-permissions">
    <h2 id="h-photo-permissions">Photos for clients <span className="muted">(staff only)</span></h2>
    <p>{data.suitable ? `${data.suitable} of ${data.files.length} captured ${data.files.length === 1 ? "file is" : "files are"} suitable for a private presentation.`
      : "No captured file is suitable for a client yet, so none can be presented."}</p>
    <p className="muted">Suitable: Hampton's own photo, or a version without branding that its advertiser or owner supplied or
      authorised to share. A branded photo stays internal until a suitable version is reviewed. Nothing here removes branding,
      changes a file, makes a photo public or sends it.{data.not_stored ? ` ${data.not_stored} captured ${data.not_stored === 1
        ? "file is" : "files are"} not stored here (missing, or only a link) and cannot be presented.` : ""}</p>
    {data.files.length ? <ul className="confirmations">{data.files.map(f => <Review key={f.asset_id} f={f} onSaved={onSaved} />)}</ul>
      : <p className="muted">The captured record has no stored photo or floor plan.</p>}
    {saved && <p role="status" className="ok">Decision saved.</p>}
  </section>;
}

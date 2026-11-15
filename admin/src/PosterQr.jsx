import { useEffect, useState } from "react";
import { api } from "./api.js";
import { propertyQrSvg } from "../../server/property-qr-svg.js";

// ANA-10: the QR for this listing's window poster, staff only. Nothing shows until the server reports it
// (ANA10_QR_OPENS_READY and migration 0091). The address is not a link: opening it from here would count an open.
export default function PosterQr({ listingId, refresh }) {
  const [qr, setQr] = useState(null);
  useEffect(() => {
    let live = true;
    setQr(null);
    api(`/admin/listings/${encodeURIComponent(listingId)}/poster-qr`).then(d => { if (live) setQr(d); }, () => {});
    return () => { live = false; };
  }, [listingId, refresh]);
  if (!qr) return null;
  const svg = qr.url && `data:image/svg+xml;charset=utf-8,${encodeURIComponent(propertyQrSvg(qr.url))}`;
  return <section id="s-poster-qr" className="card" aria-labelledby="h-poster-qr">
    <h2 id="h-poster-qr" tabIndex={-1}>Window poster QR</h2>
    {svg ? <>
      <img src={svg} alt={`QR code that opens ${qr.url}`} width="160" height="160" style={{ border: "1px solid var(--line)" }} />
      <p>Opens <code>{qr.url}</code></p>
      <p className="muted">Print it in black on white, at least 30 mm wide, and scan the printed poster with a phone before it
        goes in the window. The QR stays the same when you reprint.</p>
      <a className="btn ghost sm" href={svg} download={`${listingId}-poster-qr.svg`}>Download QR (SVG)</a>
    </> : <p className="muted">This listing is not on the website, so it has no poster QR. Publish it with a public photo first.
      A poster already printed opens a “Property not found” page and is not counted.</p>}
    <dl className="figures"><div className="card"><dt>Approximate QR opens, last {qr.days} days</dt>
      <dd className="num">{qr.opens.toLocaleString("en-GB")}</dd></div></dl>
    <p className="muted">Opens are not people: a scan can be repeated or missed. At most 200 a day per property are counted, and
      nothing about who scanned.</p>
  </section>;
}

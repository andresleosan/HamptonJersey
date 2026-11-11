import lib from "../site/lib.js";

const { amount, priceLabel, liveSummary, jerseyToday } = lib;
const BRAND = "Hampton Estates Jersey";
const COUNTRY = { jersey: "JE", uk: "GB" };

// At most n characters, cut at a word boundary.
function clip(s, n = 160) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length).replace(/[\s,.;:·-]+$/, "") + "…";
}

// p: the public shape (server/listing.js toPublic). The metadata shares the approved address snapshot.
export function listingMeta(p, siteUrl) {
  const site = siteUrl.replace(/\/+$/, ""), price = amount(p) == null ? null : priceLabel(p);
  const lines = liveSummary(p.summary, jerseyToday());
  const text = lines.length ? lines.map(l => l.replace(/^[-•]\s*/, "").replace(/[.;:,]$/, "").replace(/[^!?]$/, "$&.")).join(" ") : p.description.join(" ");
  const canonical = `${site}/p/${p.id}`;
  const photos = p.photos.map(x => site + x.src);
  const ld = {
    "@context": "https://schema.org", "@type": "RealEstateListing", name: p.title, url: canonical,
    description: text || undefined, image: photos.length ? photos : undefined,
    contentLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: p.place || undefined,
      addressCountry: COUNTRY[p.region], ...(p.exactAddress ? { streetAddress: p.exactAddress } : {}) } },
    offers: price ? { "@type": "Offer", price: amount(p), priceCurrency: p.currency,
      ...(p.operation === "rent" && { priceSpecification: { "@type": "UnitPriceSpecification", price: amount(p),
        priceCurrency: p.currency, unitCode: { month: "MON", year: "ANN" }[p.rentPeriod] } }) } : undefined,
  };
  return {
    title: [p.title, price, BRAND].filter(Boolean).join(" · "),
    description: clip(text || `${p.title}${p.place ? `, ${p.place}` : ""}. ${BRAND}.`),
    canonical,
    image: p.thumb ? site + p.thumb : null,
    imageAlt: p.photos.find(x => x.src === p.image)?.alt ?? p.title,
    jsonLd: JSON.stringify(ld).replace(/</g, "\\u003c"),
  };
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Escaped for an attribute; the Function appends it to <head> (HTMLRewriter has no way to build new elements).
export function headTags(m) {
  const meta = (k, v, attr = "property") => `<meta ${attr}="${k}" content="${esc(v)}">`;
  return [
    meta("description", m.description, "name"),
    `<link rel="canonical" href="${esc(m.canonical)}">`,
    meta("og:type", "website"), meta("og:site_name", BRAND), meta("og:title", m.title),
    meta("og:description", m.description), meta("og:url", m.canonical),
    ...(m.image ? [meta("og:image", m.image), meta("og:image:alt", m.imageAlt)] : []),
    meta("twitter:card", m.image ? "summary_large_image" : "summary", "name"),
    `<script type="application/ld+json">${m.jsonLd}</script>`,
  ].join("\n");
}

export { BRAND };

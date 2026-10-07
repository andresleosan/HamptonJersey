import { isPublicMedia } from "./visibility.js";

export const ENUMS = {
  use: ["residential", "commercial"],
  operation: ["sale", "rent", "business"],
  availability: ["for_sale", "under_offer", "sold", "to_let", "lease", "not_stated", "withdrawn"],
  rent_period: ["month", "year"],
  currency: ["GBP", "EUR"],
};
const TEXT = { title: 200, property_type: 100, country: 100, location: 200, road_name: 200, tenure: 100,
  price_text: 200, summary: 5000, description: 20000, tour_url: 500 };
const INTS = ["bedrooms", "bathrooms"];
const MONEY = ["sale_price", "rent", "premium"];
const REQUIRED = ["title", "use", "operation", "availability"];
export const EDITABLE = [...Object.keys(ENUMS), ...Object.keys(TEXT), ...INTS, ...MONEY, "specs"];

const blank = v => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const bad = msg => { throw new Error(msg); };

function checkSpecs(v) {
  if (!Array.isArray(v) || v.length > 60) bad("Máximo 60 filas");
  return v.map(s => {
    const [group, label, value] = ["group", "label", "value"].map(k => (typeof s?.[k] === "string" ? s[k].trim() : ""));
    if (!label || !value) bad("Cada fila necesita dato y valor");
    if (group.length > 60 || label.length > 100 || value.length > 300) bad("Fila demasiado larga");
    return { group, label, value };
  });
}

function check(k, v) {
  if (blank(v)) return REQUIRED.includes(k) ? bad("Obligatorio") : k === "specs" ? "[]" : null;
  if (k in ENUMS) return ENUMS[k].includes(v) ? v : bad(`Valor no válido (${ENUMS[k].join(", ")})`);
  if (k in TEXT) {
    if (typeof v !== "string") bad("Debe ser texto");
    const s = v.trim();
    if (s.length > TEXT[k]) bad(`Máximo ${TEXT[k]} caracteres`);
    if (k === "tour_url" && !/^https:\/\/\S+$/i.test(s)) bad("Debe empezar por https://");
    return s;
  }
  if (INTS.includes(k)) return Number.isInteger(v) && v >= 0 && v <= 100 ? v : bad("Número entero entre 0 y 100");
  if (MONEY.includes(k)) {
    return typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e10 ? v
      : bad("Importe mayor que 0, o vacío si no se conoce");
  }
  return JSON.stringify(checkSpecs(v)); // specs
}

// Whitelist validation: unknown or locked keys (id, published, archived_at…) are ignored.
export function validateListing(input, { partial = false } = {}) {
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const value = {}, errors = {};
  for (const k of EDITABLE) {
    if (!(k in src)) { if (!partial && REQUIRED.includes(k)) errors[k] = "Obligatorio"; continue; }
    try { value[k] = check(k, src[k]); } catch (e) { errors[k] = e.message; }
  }
  return Object.keys(errors).length ? { errors } : { value };
}

// Cross-field rules, checked on the full row (create, or stored row merged with an update).
export function checkPrice(row) {
  const errors = {};
  if (["sale_price", "rent", "premium"].some(k => row[k] != null) && !row.currency) errors.currency = "Elige la moneda del precio";
  if (row.rent != null && !row.rent_period) errors.rent_period = "Indica si el alquiler es al mes o al año";
  return errors;
}

export const regionOf = country => (country === "Jersey" ? "jersey" : country === "United Kingdom" ? "uk" : "international");
export const idPrefix = (use, country) =>
  regionOf(country) === "international" ? "HE-I" : use === "commercial" ? "HE-C" : "HE-R";
export function nextId(ids, prefix) {
  const n = ids.filter(id => id.startsWith(prefix)).map(id => parseInt(id.slice(prefix.length), 10)).filter(Number.isFinite);
  return prefix + String(Math.max(0, ...n) + 1).padStart(3, "0");
}

const STATUS = { for_sale: "For Sale", under_offer: "Under Offer", sold: "Sold", to_let: "To Let", lease: "Lease",
  not_stated: "Enquire", withdrawn: "Withdrawn" };
const lines = s => (s || "").split("\n").map(x => x.trim()).filter(Boolean);
const src = (m, thumb) => `/media/${m.id}${thumb ? "?thumb" : ""}`;
const alt = (m, fallback) => (m.label || "").replace(/\.(png|jpe?g|webp)$/i, "").trim() || fallback;

// Public shape read by site/index.html. Media must be ordered by position.
export function toPublic(l, media) {
  const pub = media.filter(m => isPublicMedia(m, l));
  const photos = pub.filter(m => m.kind === "photo");
  const cover = photos.find(m => m.id === l.cover_media_id) || photos[0];
  const aerial = pub.find(m => m.kind === "aerial");
  return {
    id: l.id, title: l.title, status: STATUS[l.availability], region: regionOf(l.country),
    place: l.location || l.country || "", type: l.property_type, use: l.use, operation: l.operation,
    currency: l.currency, salePrice: l.sale_price, rent: l.rent, rentPeriod: l.rent_period, premium: l.premium,
    priceText: l.price_text, beds: l.bedrooms, baths: l.bathrooms, tenure: l.tenure,
    summary: lines(l.summary), description: lines(l.description),
    image: cover ? src(cover) : null, thumb: cover ? src(cover, true) : null,
    photos: photos.map(m => ({ src: src(m), thumb: src(m, true), alt: alt(m, l.title) })),
    floorplans: pub.filter(m => m.kind === "floorplan").map(m => ({ src: src(m), alt: alt(m, "Floor plan") })),
    aerial: aerial ? { src: src(aerial), alt: alt(aerial, "Aerial view") } : null,
    tourUrl: l.tour_url, specs: JSON.parse(l.specs || "[]"),
  };
}

import { OPTIONS } from "../../server/applicants.js";
import { jerseyToday } from "../../server/viewings.js";

export const AVAILABILITY = { for_sale: "For sale", under_offer: "Under offer", sold: "Sold", to_let: "To let",
  lease: "Lease", not_stated: "Not stated", withdrawn: "Withdrawn" };
export const OPERATION = { sale: "Sale", rent: "Rent", business: "Business" };
export const USE = { residential: "Residential", commercial: "Commercial" };
export const KIND = { photo: "Photo", floorplan: "Floor plan", aerial: "Aerial", document: "Document" };
export const STATUS_LABEL = { published: "Published", draft: "Draft", archived: "Archived" };
export const stateOf = l => (l.archived_at ? "archived" : l.published ? "published" : "draft");

const SYM = { GBP: "£", EUR: "€" };
export function priceText(l) {
  const a = { sale: l.sale_price, rent: l.rent, business: l.premium }[l.operation];
  if (a == null) return l.price_text || "—";
  const per = l.operation === "rent" ? (l.rent_period === "year" ? " p.a." : " pcm") : "";
  return `${SYM[l.currency] ?? ""}${Math.round(a).toLocaleString("en-GB")}${per}`;
}
export const fmtDate = iso => (iso ? new Date(iso).toLocaleString("en-GB",
  { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
// A viewing's status and its badge tone (DESIGN.md: Requested attention, Confirmed ok, the closed ones neutral).
export const VIEWING_STATUS = { requested: ["Requested", "attention"], confirmed: ["Confirmed", "positive"],
  completed: ["Completed", "neutral"], no_show: ["No-show", "neutral"], cancelled: ["Cancelled", "neutral"] };
export const OUTCOME = { proceed: "Proceed", more_info: "Need more information", not_interested: "Not interested" };
// VIS-02: why the team took someone out of a listing's interest count (INTEREST_REASONS).
export const INTEREST_REASON = { no_longer_interested: "No longer interested", not_buyer: "Not a buyer or tenant", other: "Other" };
// A Jersey calendar day (YYYY-MM-DD) as text: "Mon 26 Oct", or long "Monday 26 October"; the year only when it isn't this one.
export const fmtDay = (d, long = false) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: long ? "long" : "short",
  day: "numeric", month: long ? "long" : "short", timeZone: "UTC",
  ...(d.slice(0, 4) !== jerseyToday().slice(0, 4) ? { year: "numeric" } : {}) }).replace(",", "");
// A calendar day (YYYY-MM-DD) as "12 Nov 2027"; year false: "12 Nov" when it is this year.
export const fmtDayMonth = (d, year = true) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric",
  month: "short", timeZone: "UTC", ...(year || d.slice(0, 4) !== jerseyToday().slice(0, 4) ? { year: "numeric" } : {}) });
export const safeHref = u => (/^https?:\/\//i.test(u || "") ? u : undefined);
const AGO = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const STEPS = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
// "3 hours ago", "yesterday", "now": whole units, never rounded up; never in the future (clock skew).
export function fmtAgo(iso) {
  if (!iso) return "—";
  const s = Math.min(0, (new Date(iso) - Date.now()) / 1000);
  const [unit, size] = STEPS.find(([, n]) => Math.abs(s) >= n) ?? ["second", 1];
  return AGO.format(Math.trunc(s / size) || 0, unit);
}

// A server message's first sentence: for when its "Reload to see it" has been done already.
export const firstSentence = t => t.split(". ")[0].replace(/\.?$/, ".");

export const blank = v => v == null || v === "" || (Array.isArray(v) && !v.length);
const CHOICES = { operation: OPTIONS.operation, stage: OPTIONS.stages, source: OPTIONS.sources, furnished: OPTIONS.furnished,
  property_types: OPTIONS.property_types, outdoor: OPTIONS.outdoor, parishes_wanted: OPTIONS.parishes, parishes_excluded: OPTIONS.parishes,
  buyer_position: OPTIONS.buyer_position, mortgage_aip: OPTIONS.mortgage_aip, housing_status: OPTIONS.housing_status,
  preferred_channel: OPTIONS.channels, parking_spaces: OPTIONS.parking };
const MONEY = ["budget_min", "budget_max", "budget_stretch"];
// An applicant's stored or submitted value as text: option labels, £ amounts, lists in the form's order. Never HTML.
export function show(k, v, nameOf) {
  if (k === "assigned_to") return v ? nameOf(v) : "Unassigned";
  if (blank(v)) return "—";
  if (k === "pets") return OPTIONS.pet_kinds.filter(([p]) => v.some(x => x.kind === p)).map(([p, t]) => {
    const n = v.find(x => x.kind === p).count;
    return p === "none" || blank(n) ? t : `${t} (${n})`;
  }).join(", ");
  const list = CHOICES[k], text = x => list?.find(([o]) => String(o) === String(x))?.[1] ?? String(x);
  if (Array.isArray(v)) return (list ? [...v].sort((a, b) => list.findIndex(([o]) => o === a) - list.findIndex(([o]) => o === b)) : v)
    .map(text).join(", ");
  if (MONEY.includes(k) && Number.isFinite(Number(v))) return `£${Number(v).toLocaleString("en-GB")}`;
  if (k.endsWith("_at")) return fmtDate(v);
  return text(v);
}

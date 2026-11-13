import { jerseyToday, plusDays, realDate } from './viewings.js';

// Internal building blocks only. Creating a code is not authorization to publish or associate it.
const SITE = 'https://www.hamptonestatesjersey.com';
const CODE = /^[A-Za-z0-9_-]{21}[AQgw]$/;
const LISTING = /^HE-[A-Z][0-9]{3,}$/;
const validListing = id => typeof id === 'string' && id.length <= 160 && LISTING.test(id);
export const isPropertyQrCode = code => typeof code === 'string' && code.length === 22 && CODE.test(code);

export function createPropertyQrCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export function propertyQrUrl(code) {
  if (!isPropertyQrCode(code)) throw new TypeError('Invalid QR code');
  return `${SITE}/r/${code}`;
}

export async function resolvePropertyQr(DB,code) {
  if (!isPropertyQrCode(code)) return null;
  const found=await DB.prepare(`SELECT q.id,q.listing_id FROM property_qr_codes q
    JOIN listings l ON l.id=q.listing_id WHERE q.code=?`).bind(code).first();
  if (!found) return null;
  if (!Number.isSafeInteger(found.id) || found.id < 1 || !validListing(found.listing_id)) throw new Error('Invalid QR association');
  return {id:found.id,listing_id:found.listing_id,code};
}

export function propertyQrListingUrl(association) {
  if (!association || !validListing(association.listing_id)) throw new TypeError('Invalid QR association');
  return `${SITE}/p/${association.listing_id}`;
}

// D1 batch is one transaction. The same association is checked again inside the budget statement:
// deleting a listing between resolution and counting must not consume budget or recreate a counter.
export async function recordPropertyQrRedirect(DB,association,at=new Date()) {
  if (!association || !Number.isSafeInteger(association.id) || association.id < 1 ||
      !validListing(association.listing_id) || !isPropertyQrCode(association.code) ||
      !(at instanceof Date) || !Number.isFinite(at.getTime())) throw new TypeError('Invalid QR measurement');
  const day=jerseyToday(at), args=[association.id,association.listing_id,association.code];
  await DB.batch([
    DB.prepare(`INSERT INTO property_qr_budget(day,n,capped)
      SELECT ?,1,0 FROM property_qr_codes WHERE id=? AND listing_id=? AND code=?
      ON CONFLICT(day) DO UPDATE SET n=n+1,capped=CASE WHEN n+1>=5000 THEN 1 ELSE 0 END WHERE n<5000`).bind(day,...args),
    DB.prepare(`INSERT INTO property_qr_redirect_days(day,qr_id,redirects)
      SELECT ?,id,1 FROM property_qr_codes WHERE id=? AND listing_id=? AND code=? AND changes()=1
      ON CONFLICT(day,qr_id) DO UPDATE SET redirects=redirects+1`).bind(day,...args),
  ]);
}

// No route calls this reader. A future Staff endpoint must authenticate and authorize its caller.
export async function readPropertyQrStats(DB,listingId,from,to) {
  if (!validListing(listingId) || !realDate(from) || !realDate(to)) throw new TypeError('Invalid QR statistics range');
  const days=(Date.parse(`${to}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86400000+1;
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new RangeError('Invalid QR statistics range');
  const [association,redirects,budgets]=await DB.batch([
    DB.prepare('SELECT id FROM property_qr_codes WHERE listing_id=?').bind(listingId),
    DB.prepare(`SELECT d.day,d.redirects FROM property_qr_redirect_days d JOIN property_qr_codes q ON q.id=d.qr_id
      WHERE q.listing_id=? AND d.day BETWEEN ? AND ?`).bind(listingId,from,to),
    DB.prepare('SELECT day,n,capped FROM property_qr_budget WHERE day BETWEEN ? AND ?').bind(from,to),
  ]);
  if (!association.results.length) return null;
  if (association.results.length !== 1 || !Number.isSafeInteger(association.results[0].id) || association.results[0].id < 1)
    throw new Error('Invalid QR statistics');
  const series=Array.from({length:days},(_,i)=>({day:plusDays(from,i),redirects:0,capped:false}));
  const byDay=new Map(series.map(item=>[item.day,item])),budgetByDay=new Map();
  for (const b of budgets.results) {
    if (!byDay.has(b.day) || budgetByDay.has(b.day) || !Number.isSafeInteger(b.n) || b.n < 1 || b.n > 5000 ||
        ![0,1].includes(b.capped) || (b.capped===1)!==(b.n===5000)) throw new Error('Invalid QR statistics');
    budgetByDay.set(b.day,b.n);byDay.get(b.day).capped=b.capped===1;
  }
  const seen=new Set();
  for (const r of redirects.results) {
    if (!byDay.has(r.day) || seen.has(r.day) || !Number.isSafeInteger(r.redirects) || r.redirects < 1 ||
        r.redirects > (budgetByDay.get(r.day) ?? 0)) throw new Error('Invalid QR statistics');
    seen.add(r.day);byDay.get(r.day).redirects=r.redirects;
  }
  return {period:{from,to},total:series.reduce((n,day)=>n+day.redirects,0),capped:series.some(day=>day.capped),
    coverage:'unknown',days:series};
}

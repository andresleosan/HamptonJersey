import { priceOperation } from "../../server/listing-pricing.js";
// Recommendations reflect the current form and saved media, never publication permission.
const PRICE = {business: ['premium', 'Add the business premium'], sale: ['sale_price', 'Add the sale price'], rent: ['rent', 'Add the rent']};
const blank = value => String(value ?? '').trim() === '';
const eligiblePhoto = m => m && (m.public === 1 || m.public === true) && m.kind === 'photo' && !!m.r2_key && m.origin !== 'external';

export function listingCriteria(form, parish, media, coverId) {
  const criteria = [];
  const add = (id, label, target, met) => criteria.push({id, label, target, met});
  const [price, priceLabel] = PRICE[form.operation === "business" ? "business" : priceOperation(form)] ?? [];
  if (price) add('price', priceLabel, `f-${price}`, !blank(form[price]) || !blank(form.price_text));
  if (form.country === 'Jersey') add('parish', 'Choose the parish', 'f-parish', !blank(parish));
  if (form.use === 'residential') add('bedrooms', 'Add the bedrooms', 'f-bedrooms', !blank(form.bedrooms));
  if (priceOperation(form) === 'sale') add('tenure', 'Choose the tenure', 'f-tenure_type', !blank(form.tenure_type));
  if (form.use === 'residential' && form.country === 'Jersey')
    add('housing', 'Choose the housing category', 'f-housing_category', !blank(form.housing_category));
  const photos = Array.isArray(media) ? media.filter(eligiblePhoto) : null;
  add('photos', photos ? `Add photos for the website (${photos.length} of 5)` : 'Photos could not be loaded', 'h-photos', photos ? photos.length >= 5 : null);
  add('cover', 'Choose a cover photo', 'h-photos', photos ? photos.some(m => m.id === coverId) : null);
  add('summary', 'Add a summary', 'f-summary', !blank(form.summary));
  return criteria;
}

export function listingCompleteness(criteria) {
  if (!Array.isArray(criteria) || !criteria.length || criteria.some(c => typeof c.met !== 'boolean')) return null;
  const total = criteria.length, met = criteria.filter(c => c.met).length;
  return {met, total, percentage: Math.round(100 * met / total)};
}

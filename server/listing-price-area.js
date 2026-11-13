import { priceOperation } from './listing-pricing.js';

// Keep entered decimal digits as a fraction. This avoids binary rounding at currency boundaries.
function positiveDecimal(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim();
  if (!text || text.length > 128) return null;
  const m = /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(text);
  const numeric = Number(text);
  if (!m || !Number.isFinite(numeric) || numeric <= 0) return null;
  const fraction = m[2] ?? m[3] ?? '', exponent = Number(m[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 400) return null;
  const digits = `${m[1] ?? '0'}${fraction}`;
  let numerator = BigInt(digits), denominator = 1n;
  const scale = fraction.length - exponent;
  if (scale > 0) denominator = 10n ** BigInt(scale);
  else if (scale < 0) numerator *= 10n ** BigInt(-scale);
  return { numerator, denominator, numeric };
}

// The server stores interior area to at most two decimal places, with a 0.01 minimum.
export function isValidInteriorArea(value) {
  const area = positiveDecimal(value);
  return !!area && area.numerator * 100n >= area.denominator &&
    area.numerator < 100000000n * area.denominator && (area.numerator * 100n) % area.denominator === 0n;
}

// The result is informational. No entered field is altered or saved by this calculation.
export function derivePricePerArea(listing) {
  if (!listing || typeof listing !== 'object' || !['sale', 'rent', 'business'].includes(listing.operation)) return null;
  if (!['GBP', 'EUR'].includes(listing.currency) || !isValidInteriorArea(listing.interior_area_sqft)) return null;
  if (listing.operation === 'business') {
    const tenure = String(listing.tenure_type || listing.tenureType || listing.tenure || '').trim().toLowerCase();
    if (!['freehold', 'leasehold', 'flying_freehold', 'share_transfer'].includes(tenure)) return null;
  }
  const basis = priceOperation(listing), area = positiveDecimal(listing.interior_area_sqft);
  const price = positiveDecimal(basis === 'sale' ? listing.sale_price : listing.rent);
  if (!price || price.numerator >= 10000000000n * price.denominator) return null;
  const period = basis === 'rent' ? listing.rent_period : null;
  if (basis === 'rent' && !['month', 'year'].includes(period)) return null;
  const numerator = price.numerator * area.denominator;
  const denominator = price.denominator * area.numerator;
  const scaled = numerator * 100n;
  const minorUnits = Number((scaled * 2n + denominator) / (denominator * 2n));
  const approximate = price.numeric / area.numeric;
  return { amount: approximate || null, currency: listing.currency, period,
    minorUnits, belowMinimumUnit: scaled < denominator };
}

export function formatPricePerArea(value) {
  if (!value || !Number.isSafeInteger(value.minorUnits) || value.minorUnits < 0 ||
      typeof value.belowMinimumUnit !== 'boolean' || !['GBP', 'EUR'].includes(value.currency) ||
      ![null, 'month', 'year'].includes(value.period)) return null;
  const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: value.currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amount = value.belowMinimumUnit ? `Less than ${money.format(0.01)}` : money.format(value.minorUnits / 100);
  const period = value.period === 'month' ? ' per month' : value.period === 'year' ? ' per year' : '';
  return `${amount} per sq ft${period}`;
}

// Premium and rent are separate concepts; never combine their ratios.
export function formatPremiumPerArea(listing) {
  if (listing?.operation !== 'business') return null;
  const value = derivePricePerArea({ ...listing, operation: 'sale', sale_price: listing.premium });
  const formatted = formatPricePerArea(value);
  return formatted ? formatted.replace(' per sq ft', ' premium per sq ft') : null;
}

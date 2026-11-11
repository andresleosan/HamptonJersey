import { sha256 } from './http.js';
import { listingMeta } from './listing-meta.js';
import { toPublic } from './listing.js';
import { exactAddressErrors, formatExactAddress } from './listing-details.js';

export async function buildPublicAddressReview(listing, details, media, driveFolderName, siteUrl) {
  const errors = exactAddressErrors(listing, details);
  const address = Object.keys(errors).length ? null : formatExactAddress(listing, details);
  const publicListing = toPublic({ ...listing,
    specs: Array.isArray(listing.specs) ? JSON.stringify(listing.specs) : listing.specs,
    public_address_snapshot: address,
  }, media);
  const seo = listingMeta(publicListing, siteUrl);
  const preview = { listing: publicListing, seo, drive_folder_name: driveFolderName ?? null };
  // Interest changes continuously; it is visible to the site but does not affect address consent. All other public
  // listing fields, metadata, media labels, address and the last known Drive folder title are part of the review.
  const { interest: _interest, ...reviewedListing } = publicListing;
  const public_snapshot_hash = await sha256(JSON.stringify({ listing: reviewedListing, seo, drive_folder_name: driveFolderName ?? null }));
  return { address, errors, preview, public_snapshot_hash };
}
export function addressDetailsFromListing(listing) {
  return { building_name_or_number: listing.building_name_or_number ?? null,
    postcode: listing.postcode ?? null, property_condition: listing.property_condition ?? null,
    developer_name: listing.developer_name ?? null, public_address_snapshot: listing.public_address_snapshot ?? null };
}

const normalized = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const containsPhrase = (text, phrase) => {
  const words = text.split(' '), sought = phrase.split(' ');
  return words.some((_, index) => words.slice(index, index + sought.length).join(' ') === phrase);
};

export function addressAppearsInPublicContent(listing, details, publicListing) {
  const parts = String(details.public_address_snapshot ?? '').split(', ');
  const pairs = [
    [details.building_name_or_number, listing.road_name],
    [parts[0], parts[1]],
    [parts[0], listing.road_name],
    [details.building_name_or_number, parts[1]],
  ].map(pair => pair.map(normalized)).filter(([building, road]) => building && road);
  if (!pairs.length) return false;
  const texts = [publicListing.title, publicListing.place, ...publicListing.summary, ...publicListing.description,
    ...publicListing.specs.flatMap(spec => [spec.group, spec.label, spec.value]),
    ...publicListing.photos.map(photo => photo.alt), ...publicListing.floorplans.map(plan => plan.alt), publicListing.aerial?.alt]
    .map(normalized).filter(Boolean);
  const joined = texts.join(' ');
  return pairs.some(([building, road]) => containsPhrase(joined, building) && containsPhrase(joined, road));
}

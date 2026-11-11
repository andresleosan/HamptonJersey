// Pure minimum policy; the publishing service remains responsible for permissions,
// state, editorial checks and verifying that each photo is eligible.
export function publicationReadiness(listing, eligiblePhotoCount) {
  const missing = [];
  if (typeof listing?.title !== 'string' || !listing.title.trim()) missing.push('title');
  if (!['sale', 'rent', 'business'].includes(listing?.operation)) missing.push('operation');
  if (!Number.isInteger(eligiblePhotoCount) || eligiblePhotoCount < 1) missing.push('public_photo');
  return {ready: missing.length === 0, missing};
}

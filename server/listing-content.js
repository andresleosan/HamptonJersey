// PUB-08: a closed, versioned set of staff-selected web tags. It is not an
// automated classification and does not alter an existing tour.
export const CONTENT_TAGS = Object.freeze({
  renovated: 'Renovated',
  sea_view: 'Sea view',
  town_centre: 'Town centre',
});
export const CONTENT_TAG_VERSION = 1;

export function normalizeVideoUrl(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 500 || value !== value.trim()) throw new Error('Enter a supported HTTPS video URL or leave blank');
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a supported HTTPS video URL or leave blank'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash)
    throw new Error('Enter a supported HTTPS video URL or leave blank');
  if (url.hostname === 'player.vimeo.com') {
    if (!/^\/video\/\d+$/.test(url.pathname) || [...url.searchParams].some(([key, val]) =>
      !((key === 'h' && /^[A-Za-z0-9_-]{1,128}$/.test(val)) || (key === 'dnt' && ['0','1'].includes(val)))))
      throw new Error('Use a supported Vimeo player URL');
  } else if (url.hostname === 'www.youtube-nocookie.com') {
    if (!/^\/embed\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname) || [...url.searchParams].some(([key, val]) =>
      !(['start','end'].includes(key) && /^\d{1,8}$/.test(val))))
      throw new Error('Use a supported privacy-enhanced YouTube embed URL');
  } else throw new Error('Use a supported Vimeo or privacy-enhanced YouTube player URL');
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) throw new Error('Remove repeated video URL parameters');
  return url.href;
}

export function validateListingContent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return {errors:{content:'Must be an object'}};
  const errors = {}, value = {};
  for (const key of Object.keys(input)) if (!['tags','video_url'].includes(key)) errors[key] = 'Unknown field';
  if (Object.hasOwn(input,'tags')) {
    const tags=input.tags;
    if (!Array.isArray(tags) || tags.length > Object.keys(CONTENT_TAGS).length ||
        tags.some(tag=>typeof tag!=='string' || !Object.hasOwn(CONTENT_TAGS,tag)) || new Set(tags).size!==tags.length)
      errors.tags='Choose distinct tags from the list';
    else value.tags=Object.keys(CONTENT_TAGS).filter(tag=>tags.includes(tag));
  }
  if (Object.hasOwn(input,'video_url')) {
    try { value.video_url=normalizeVideoUrl(input.video_url); }
    catch (error) { errors.video_url=error.message; }
  }
  return Object.keys(errors).length ? {errors} : {value};
}

export function contentFromStored(tags, video_url) {
  let parsed;
  try { parsed=tags == null ? [] : JSON.parse(tags); } catch { throw new Error('Invalid stored listing content'); }
  const result=validateListingContent({tags:parsed,video_url:video_url ?? null});
  if (result.errors) throw new Error('Invalid stored listing content');
  return result.value;
}

export async function readListingContent(env,id) {
  const row=await env.DB.prepare('SELECT tags,video_url FROM listing_content WHERE listing_id=?').bind(id).first();
  return contentFromStored(row?.tags,row?.video_url);
}

// Only runs immediately after a successful versioned UPDATE of this listing.
export function listingContentUpdateStatement(env,id,content) {
  return env.DB.prepare(`INSERT INTO listing_content(listing_id,tags,video_url) SELECT ?,?,? WHERE changes()>0
    ON CONFLICT(listing_id) DO UPDATE SET tags=excluded.tags,video_url=excluded.video_url`)
    .bind(id,JSON.stringify(content.tags),content.video_url);
}

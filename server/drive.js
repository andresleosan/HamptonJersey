import { SignJWT, importPKCS8 } from "jose";
import { fail } from "./http.js";
import { MAX_PHOTO } from "./listing-import.js";

// PUB-21 (spec 2026-11-05, C1): the only place that talks to Google Drive. The service account's JSON key is the secret
// GOOGLE_SERVICE_ACCOUNT, read only (drive.readonly); it sees only what Franco shared with it (D13). Hermes never gets
// the key: it asks the app for its import's documents. DRIVE_API and DRIVE_TOKEN_URL let the tests and e2e use a fake.
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const FOLDER = "application/vnd.google-apps.folder";
const ID = /^[A-Za-z0-9_-]{10,100}$/;
const api = env => env.DRIVE_API ?? "https://www.googleapis.com";

// C10: what the team copies from the browser (with /u/N/ and ?usp=…) or the bare id.
export function folderIdFrom(text) {
  const s = String(text ?? "").trim();
  if (ID.test(s)) return s;
  try {
    const u = new URL(s);
    const m = /^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,100})\/?$/.exec(u.pathname);
    return u.protocol === "https:" && u.hostname === "drive.google.com" && m ? m[1] : null;
  } catch { return null; }
}
// D7: «Records», «Old records», «Records 2024.pdf» (security review: any name with the word, folders and files).
export const isRecords = name => /(^|[^a-z])records?([^a-z]|$)/i.test(name);
// D5: «Edited», «Edited Photos», «Fotos editadas»; never «Unedited», «Not edited» or «No editadas» (bugs review).
export const isEdited = name => /(^|[^a-z])(edited|editadas)([^a-z]|$)/i.test(name) && !/(^|[^a-z])(not|no|sin)[\s_-]+edit/i.test(name);
const isPhotoFolder = name => isEdited(name) || /photo|foto|picture|image/i.test(name); // D8: not read for documents

let cached = null; // { secret, url, token, until }: one token for about an hour per key
async function token(env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT) fail(503, "Google Drive isn't set up yet");
  const url = env.DRIVE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
  if (cached?.secret === env.GOOGLE_SERVICE_ACCOUNT && cached.url === url && cached.until > Date.now()) return cached.token;
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const jwt = await new SignJWT({ scope: SCOPE }).setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(sa.client_email)
    .setSubject(sa.client_email).setAudience(url).setIssuedAt().setExpirationTime("1h").sign(await importPKCS8(sa.private_key, "RS256"));
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
  if (!r.ok) fail(502, "Google refused the app's key");
  const { access_token, expires_in } = await r.json();
  cached = { secret: env.GOOGLE_SERVICE_ACCOUNT, url, token: access_token, until: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

// The token goes only to Drive's API or, for a HEIC's thumbnail, to Google's image hosts over https (security review).
const hostOk = (env, link) => {
  try {
    const u = new URL(link);
    return u.origin === new URL(api(env)).origin || (u.protocol === "https:" && /^lh\d+\.googleusercontent\.com$/.test(u.hostname));
  } catch { return false; }
};
export async function driveFetch(env, path, init = {}) {
  if (path.startsWith("http") && !hostOk(env, path)) fail(502, "Google Drive sent a link the app doesn't follow");
  const t = await token(env);
  return fetch(path.startsWith("http") ? path : `${api(env)}/drive/v3/${path}`,
    { ...init, headers: { ...init.headers, authorization: `Bearer ${t}` } });
}

const FIELDS = "id,name,mimeType,size,modifiedTime,thumbnailLink,trashed,parents";
async function children(env, id) {
  if (!ID.test(id)) fail(400, "Not a Drive folder id");
  const out = [];
  let page = "";
  do {
    const q = new URLSearchParams({ q: `'${id}' in parents and trashed = false`, fields: `nextPageToken,files(${FIELDS})`,
      pageSize: "1000", ...(page ? { pageToken: page } : {}) });
    const r = await driveFetch(env, `files?${q}`);
    if (!r.ok) fail(502, "Google Drive didn't list the folder");
    const j = await r.json();
    out.push(...j.files);
    page = j.nextPageToken;
  } while (page);
  return out;
}

export async function folderInfo(env, id) {
  if (!ID.test(id)) return null;
  const r = await driveFetch(env, `files/${id}?fields=${FIELDS}`);
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) fail(502, "Google Drive didn't answer");
  const f = await r.json();
  return f.mimeType === FOLDER && !f.trashed ? { id: f.id, name: f.name, parents: f.parents ?? [] } : null;
}

// D7 (security review): a folder pasted from inside Records is Records too. Walks up the parents the app can see
// (above the shared folder Drive shows none), at most 10 levels.
export async function insideRecords(env, folder) {
  for (let f = folder, depth = 0; f && depth < 10; depth++) {
    if (isRecords(f.name)) return true;
    f = f.parents?.[0] ? await folderInfo(env, f.parents[0]) : null;
  }
  return false;
}

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
const MAX_DOCS = 30, MAX_DOC = 20 * 1024 * 1024, DEPTH = 5;
const EXPORT = { "application/vnd.google-apps.document": "text/plain", "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain" };
const media = m => /^(image|video|audio)\//.test(m);

// D7, D8, C12: every document of the folder and its subfolders, except Records and photo folders. Edited folders are
// kept apart for the photos (D5); depth is capped so a folder that contains itself through a shortcut can't loop.
export async function walkFolder(env, id) {
  const documents = [], editedFolders = [], skipped = [], notRead = [];
  let extra = 0;
  const walk = async (fid, prefix, depth) => {
    for (const f of (await children(env, fid)).sort(byName)) {
      const path = prefix + f.name;
      if (f.mimeType === FOLDER) {
        if (isRecords(f.name)) notRead.push(path);
        else if (depth === 0 && isEdited(f.name)) editedFolders.push({ id: f.id, name: f.name, modifiedTime: f.modifiedTime });
        else if (isPhotoFolder(f.name) || depth >= DEPTH) notRead.push(path);
        else await walk(f.id, `${path}/`, depth + 1);
      } else if (media(f.mimeType)) continue;
      else if (isRecords(f.name)) notRead.push(path);
      else if (f.mimeType.startsWith("application/vnd.google-apps.") && !EXPORT[f.mimeType]) skipped.push(`${path}: can't be read`);
      else if (Number(f.size ?? 0) > MAX_DOC) skipped.push(`${path}: larger than 20 MB`);
      else if (documents.length >= MAX_DOCS) extra++;
      else documents.push({ id: f.id, name: f.name, path, mimeType: f.mimeType, size: Number(f.size ?? 0), modifiedTime: f.modifiedTime });
    }
  };
  await walk(id, "", 0);
  if (extra) skipped.push(`${extra} more ${extra === 1 ? "document wasn't" : "documents weren't"} read (more than 30 documents)`);
  if (notRead.length) skipped.push(`Folders not read: ${notRead.join(", ")}`);
  return { documents, editedFolders, skipped };
}

const PHOTO = ["image/jpeg", "image/png", "image/webp"], HEIC = ["image/heic", "image/heif"];
// C3, C4: the Edited folder's own photos, by name like the folder import. HEIC comes through Drive's thumbnail.
export async function photosIn(env, folderId) {
  const photos = [], other = [];
  for (const f of (await children(env, folderId)).sort(byName)) {
    if (f.mimeType === FOLDER) continue;
    const heic = HEIC.includes(f.mimeType) || /\.(heic|heif)$/i.test(f.name);
    if ((!PHOTO.includes(f.mimeType) && !heic) || Number(f.size ?? 0) > MAX_PHOTO) other.push(f.name);
    else if (heic && !f.thumbnailLink) other.push(f.name);
    else photos.push({ id: f.id, name: f.name, mimeType: heic ? "image/jpeg" : f.mimeType, heic });
  }
  return { photos, skipped: other.length ? [`Not uploaded from the Edited folder: ${other.join(", ")}`] : [] };
}

export async function fileResponse(env, file) {
  let r;
  if (file.heic) { // the thumbnail link is short-lived: asked for each time
    const m = await driveFetch(env, `files/${file.id}?fields=thumbnailLink`);
    const link = m.ok ? (await m.json()).thumbnailLink : null;
    if (!link) fail(502, "Google Drive didn't send the photo");
    r = await driveFetch(env, link.replace(/=s\d+$/, "=s1600"));
  } else if (EXPORT[file.mimeType]) {
    r = await driveFetch(env, `files/${file.id}/export?${new URLSearchParams({ mimeType: EXPORT[file.mimeType] })}`);
  } else r = await driveFetch(env, `files/${file.id}?alt=media`);
  if (!r.ok) fail(502, "Google Drive didn't send the file");
  return new Response(r.body, { headers: { "content-type": EXPORT[file.mimeType] ?? (file.heic ? "image/jpeg" : file.mimeType),
    "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

// D6, C3: the note can name one Edited folder; else the only one, or the most recently modified with a warning.
export function chooseEdited(folders, wanted) {
  if (!folders.length) return { folder: null, warning: 'No "Edited" folder: the draft will have no photos.' };
  const named = wanted && folders.find(f => f.name.trim().toLowerCase() === wanted.trim().toLowerCase());
  if (named) return { folder: named, warning: null };
  if (folders.length === 1) return { folder: folders[0], warning: null };
  const newest = [...folders].sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))[0];
  return { folder: newest, warning: `Several "Edited" folders: used "${newest.name}" (the most recent).` };
}

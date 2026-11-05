// A Google Drive double for the tests (PUB-21): the token endpoint and the few Drive v3 calls server/drive.js makes,
// answered from an in-memory tree. Every URL asked for is kept in `calls`. Ids and names are made up.
const API = "http://drive.test";
const FOLDER = "application/vnd.google-apps.folder";

let keyPem;
async function serviceAccount() {
  if (!keyPem) {
    const k = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256" }, true, ["sign", "verify"]);
    const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", k.privateKey)).toString("base64");
    keyPem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
  }
  return JSON.stringify({ client_email: `app-${Math.random()}@example.iam.gserviceaccount.com`, private_key: keyPem });
}

// files: { id: { name, mimeType?, parent?, size?, modifiedTime?, body? } }; no mimeType means a folder.
export async function fakeDrive(t, files) {
  const calls = [], tokens = [];
  const real = globalThis.fetch;
  const meta = (id, f) => ({ id, name: f.name, mimeType: f.mimeType ?? FOLDER, ...(f.parent ? { parents: [f.parent] } : {}), modifiedTime: f.modifiedTime ?? "2026-11-01T00:00:00.000Z",
    ...(f.size !== undefined ? { size: String(f.size) } : f.mimeType && !f.mimeType.startsWith("application/vnd.google-apps")
      ? { size: String((f.body ?? "x").length) } : {}),
    ...(f.mimeType?.startsWith("image/") ? { thumbnailLink: `${API}/thumb/${id}=s220` } : {}) });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.origin !== API) return real(input, init);
    calls.push(url.pathname + url.search);
    if (url.pathname === "/token") {
      tokens.push(new URLSearchParams(await new Response(init.body).text()).get("assertion"));
      return Response.json({ access_token: "tok", expires_in: 3600 });
    }
    if (!/^Bearer tok$/.test(new Headers(init.headers).get("authorization") ?? "")) return new Response("no auth", { status: 401 });
    const thumb = /^\/thumb\/([^=]+)=s(\d+)$/.exec(url.pathname);
    if (thumb) return files[thumb[1]] ? new Response(`thumb ${thumb[1]} ${thumb[2]}`) : new Response("", { status: 404 });
    const m = /^\/drive\/v3\/files(?:\/([^/]+))?(\/export)?$/.exec(url.pathname);
    if (!m) return new Response("not found", { status: 404 });
    if (!m[1]) {
      const parent = /^'([^']+)' in parents/.exec(url.searchParams.get("q") ?? "")?.[1];
      return Response.json({ files: Object.entries(files).filter(([, f]) => f.parent === parent).map(([id, f]) => meta(id, f)) });
    }
    const f = files[m[1]];
    if (!f) return new Response("missing", { status: 404 });
    if (m[2]) return new Response(`export ${m[1]} ${url.searchParams.get("mimeType")}`);
    if (url.searchParams.get("alt") === "media") return new Response(f.body ?? `bytes ${m[1]}`);
    return Response.json(meta(m[1], f));
  };
  t.after(() => { globalThis.fetch = real; });
  return { calls, tokens, env: { DRIVE_API: API, DRIVE_TOKEN_URL: `${API}/token`, GOOGLE_SERVICE_ACCOUNT: await serviceAccount() } };
}

// The house used across the tests: Records, two Edited folders, a raw photos folder, an old subfolder, documents.
export const HOUSE = {
  F_HOUSE00001: { name: "27 Example Road" },
  F_RECORDS001: { name: "Records", parent: "F_HOUSE00001" },
  D_SECRET0001: { name: "secret.pdf", mimeType: "application/pdf", parent: "F_RECORDS001" },
  F_EDITED0001: { name: "Edited", parent: "F_HOUSE00001", modifiedTime: "2026-10-30T18:00:00.000Z" },
  P_B000000001: { name: "b.png", mimeType: "image/png", parent: "F_EDITED0001" },
  P_A000000001: { name: "a.jpg", mimeType: "image/jpeg", parent: "F_EDITED0001" },
  P_C000000001: { name: "c.heic", mimeType: "image/heic", parent: "F_EDITED0001" },
  F_EDITED0002: { name: "Edited Photos", parent: "F_HOUSE00001", modifiedTime: "2026-09-01T00:00:00.000Z" },
  P_OLD0000001: { name: "old.jpg", mimeType: "image/jpeg", parent: "F_EDITED0002" },
  F_RAW0000001: { name: "Photos (raw)", parent: "F_HOUSE00001" },
  P_RAW0000001: { name: "raw.jpg", mimeType: "image/jpeg", parent: "F_RAW0000001" },
  F_OLD0000001: { name: "Old", parent: "F_HOUSE00001" },
  D_OLDPDF0001: { name: "old.pdf", mimeType: "application/pdf", parent: "F_OLD0000001", modifiedTime: "2022-02-17T00:00:00.000Z" },
  D_DETAILS001: { name: "Details.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    parent: "F_HOUSE00001", body: "Asking price £675,000" },
  D_NOTES00001: { name: "Notes", mimeType: "application/vnd.google-apps.document", parent: "F_HOUSE00001" },
  V_TOUR000001: { name: "tour.mp4", mimeType: "video/mp4", parent: "F_HOUSE00001" },
  P_LOOSE00001: { name: "loose.jpg", mimeType: "image/jpeg", parent: "F_HOUSE00001" },
};

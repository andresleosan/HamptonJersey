// PUB-21 (spec 2026-11-05): Properties Queue, the panel's side and Hermes's side of a Drive import.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, seedListing, seedMedia } from "./helpers.mjs";
import { fakeDrive, HOUSE } from "./fake-drive.mjs";

const KEY = "k".repeat(40);
const LINK = "https://drive.google.com/drive/u/5/folders/F_HOUSE00001?usp=sharing";
async function setup(t) {
  const d = await fakeDrive(t, HOUSE);
  return { d, env: { ...makeEnv(), ...d.env, HERMES_KEY: KEY } };
}
const admin = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const hermes = (env, method, path, body) => call(env, method, path, { body, bearer: KEY, origin: null });
const row = (env, id) => env.DB.raw.prepare("SELECT * FROM drive_imports WHERE id = ?").get(id);
const PROPOSAL = { property_txt: "Title: 27 Example Road\nOperation: Sale\nPrice: £675,000\nParish: St Helier",
  sources: { price: "Details.docx" }, conflicts: [{ field: "price", values: [{ value: "£675,000", document: "Details.docx" },
    { value: "£650,000", document: "Old/old.pdf" }] }], photos_folder: null };

const BODY = { title: "27 Example Road", use: "residential", operation: "sale", availability: "for_sale", country: "Jersey" };
const draft = async (env, id, body = BODY) => admin(env, "POST", `/admin/queue/${id}/draft`, body);
async function ready(env) {
  const { data } = await admin(env, "POST", "/admin/queue", { link: LINK, note: "Price from the Word" });
  await hermes(env, "POST", "/hermes/imports/next");
  assert.equal((await hermes(env, "POST", `/hermes/imports/${data.item.id}/proposal`, PROPOSAL)).status, 200);
  return data.item.id;
}

test("sending a folder: a queued row with Drive's name; bad links, long notes and unshared folders refused", async t => {
  const { env } = await setup(t);
  const r = await admin(env, "POST", "/admin/queue", { link: LINK, note: "Use the Word" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.deepEqual([r.data.item.folder_name, r.data.item.status, r.data.duplicate], ["27 Example Road", "queued", null]);
  for (const body of [{ link: "https://example.com/x" }, { link: LINK, note: "x".repeat(2001) },
    { link: "https://drive.google.com/drive/folders/F_MISSING001" }]) {
    const bad = await admin(env, "POST", "/admin/queue", body);
    assert.equal(bad.status, 400, JSON.stringify(body));
  }
  assert.match((await admin(env, "POST", "/admin/queue", { link: "F_MISSING001" })).data.error, /can't open this folder/);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM drive_imports").get().n, 1);
  const list = await admin(env, "GET", "/admin/queue");
  assert.deepEqual(list.data.items.map(i => i.folder_name), ["27 Example Road"]);
  assert.equal(list.data.items[0].documents, undefined, "Hermes's file list stays on the server");
});

test("the same folder again is flagged, not refused", async t => {
  const { env } = await setup(t);
  await admin(env, "POST", "/admin/queue", { link: LINK });
  assert.deepEqual((await admin(env, "POST", "/admin/queue", { link: LINK })).data.duplicate, { import_id: 1 });
  seedListing(env, { id: "HE-R009", drive_folder_id: "F_HOUSE00001" });
  const r = await admin(env, "POST", "/admin/queue", { link: "F_HOUSE00001" });
  assert.equal(r.status, 201);
  assert.deepEqual(r.data.duplicate, { listing_id: "HE-R009" });
});

test("Hermes: claims once, gets the documents without Records, reads only its own files", async t => {
  const { env, d } = await setup(t);
  assert.deepEqual((await hermes(env, "POST", "/hermes/imports/next")).data, { import: null });
  await admin(env, "POST", "/admin/queue", { link: LINK, note: "Price from the Word" });
  const r = await hermes(env, "POST", "/hermes/imports/next");
  assert.equal(r.data.import.note, "Price from the Word");
  assert.deepEqual(r.data.import.documents.map(x => x.path), ["Details.docx", "Notes", "Old/old.pdf"]);
  assert.equal(r.data.import.requested_by, undefined, "never who sent it");
  assert.deepEqual((await hermes(env, "POST", "/hermes/imports/next")).data, { import: null });
  const f = await hermes(env, "GET", "/hermes/imports/1/files/D_DETAILS001");
  assert.equal(f.status, 200);
  assert.equal(f.text, "Asking price £675,000");
  const before = d.calls.length;
  for (const id of ["P_A000000001", "D_SECRET0001", "D_UNKNOWN001"])
    assert.equal((await hermes(env, "GET", `/hermes/imports/1/files/${id}`)).status, 404, id);
  assert.equal(d.calls.length, before, "nothing asked of Drive for a file outside the list");
  assert.equal((await call(env, "POST", "/hermes/imports/next", { origin: null })).status, 401);
});

test("Hermes's proposal: the Edited photos chosen by the app, warnings kept", async t => {
  const { env } = await setup(t);
  await admin(env, "POST", "/admin/queue", { link: LINK });
  assert.equal((await hermes(env, "POST", "/hermes/imports/1/proposal", PROPOSAL)).status, 409, "not claimed yet");
  await hermes(env, "POST", "/hermes/imports/next");
  assert.equal((await hermes(env, "POST", "/hermes/imports/1/proposal", { ...PROPOSAL, property_txt: "x".repeat(100 * 1024 + 1) })).status, 400);
  assert.equal((await hermes(env, "POST", "/hermes/imports/1/proposal", { ...PROPOSAL, conflicts: "no" })).status, 400);
  assert.equal((await hermes(env, "POST", "/hermes/imports/1/proposal", PROPOSAL)).status, 200);
  const r = row(env, 1), result = JSON.parse(r.result);
  assert.equal(r.status, "ready");
  assert.deepEqual(result.photos.map(p => p.name), ["a.jpg", "b.png", "c.heic"]);
  assert.equal(result.photos_folder, "Edited");
  assert.ok(result.warnings.some(w => /Several "Edited" folders/.test(w)));
  assert.equal(result.conflicts[0].values.length, 2);
  // The note named the other Edited folder.
  await admin(env, "POST", "/admin/queue", { link: LINK });
  await hermes(env, "POST", "/hermes/imports/next");
  await hermes(env, "POST", "/hermes/imports/2/proposal", { ...PROPOSAL, photos_folder: "Edited Photos" });
  assert.deepEqual(JSON.parse(row(env, 2).result).photos.map(p => p.name), ["old.jpg"]);
});

test("a claim not finished in 5 minutes is taken again; the third fails", async t => {
  const { env } = await setup(t);
  await admin(env, "POST", "/admin/queue", { link: LINK });
  const back = () => env.DB.raw.prepare("UPDATE drive_imports SET claimed_at = '2026-01-01T00:00:00.000Z'").run();
  for (let i = 0; i < 3; i++) { assert.ok((await hermes(env, "POST", "/hermes/imports/next")).data.import); back(); }
  assert.deepEqual((await hermes(env, "POST", "/hermes/imports/next")).data, { import: null });
  assert.equal(row(env, 1).status, "failed");
  assert.match(row(env, 1).error, /didn't finish in 15 minutes/);
  assert.equal((await admin(env, "POST", "/admin/queue/1/retry")).status, 200);
  assert.deepEqual([row(env, 1).status, row(env, 1).attempts], ["queued", 0]);
  assert.equal((await admin(env, "POST", "/admin/queue/1/retry")).status, 409, "only a failed one");
});

test("review: one draft per row, made and linked by the server; the photo proxy serves only its photos", async t => {
  const { env, d } = await setup(t);
  const id = await ready(env);
  const p = await admin(env, "GET", `/admin/queue/${id}/photo/P_A000000001`);
  assert.equal(p.status, 200);
  assert.equal(p.text, "bytes P_A000000001");
  assert.equal((await admin(env, "GET", `/admin/queue/${id}/photo/P_C000000001`)).text, "thumb P_C000000001 4000");
  const before = d.calls.length;
  for (const f of ["P_LOOSE00001", "P_RAW0000001", "D_DETAILS001"])
    assert.equal((await admin(env, "GET", `/admin/queue/${id}/photo/${f}`)).status, 404, f);
  assert.equal(d.calls.length, before);
  const r = await draft(env, id);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const lid = r.data.id;
  assert.deepEqual([row(env, id).status, row(env, id).listing_id], ["review", lid]);
  assert.equal(env.DB.raw.prepare("SELECT drive_folder_id FROM listings WHERE id = ?").get(lid).drive_folder_id, "F_HOUSE00001");
  const again = await draft(env, id);
  assert.equal(again.status, 409);
  assert.equal(again.data.listing_id, lid, "the second person is sent to the first one's draft");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM listings").get().n, 1, "no second listing");
  assert.deepEqual((await admin(env, "GET", `/admin/listings/${lid}`)).data.queue, { id, status: "review" });
  assert.equal((await admin(env, "POST", `/admin/queue/${id}/listing`, { listing_id: "HE-R050" })).status, 404,
    "no route to tie another listing to a row");
});

test("a draft the server refuses leaves the row ready for the same person to try again", async t => {
  const { env } = await setup(t);
  const id = await ready(env);
  const bad = await draft(env, id, { ...BODY, title: "" });
  assert.equal(bad.status, 400);
  assert.equal(row(env, id).status, "ready");
  assert.equal((await draft(env, id)).status, 201);
});

test("Approve and publish: the minimum, then the website; the plain Publish is closed meanwhile", async t => {
  const { env } = await setup(t);
  const id = await ready(env);
  const lid = (await draft(env, id, { ...BODY, parish: "St Helier", description: "A period town house.", sale_price: 675000, currency: "GBP" })).data.id;
  assert.equal(lid, "HE-R001");
  assert.equal((await admin(env, "POST", "/admin/listings/HE-R001/publish")).status, 409);
  const no = await admin(env, "POST", `/admin/queue/${id}/approve`);
  assert.equal(no.status, 400);
  assert.deepEqual(no.data.missing, ["A photo"]);
  seedMedia(env, { id: "A00050", listing_id: "HE-R001", origin: "upload" });
  const ok = await admin(env, "POST", `/admin/queue/${id}/approve`);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(env.DB.raw.prepare("SELECT published FROM listings WHERE id = 'HE-R001'").get().published, 1);
  assert.equal(row(env, id).status, "published");
  assert.equal((await admin(env, "POST", `/admin/queue/${id}/approve`)).status, 409);
  assert.equal((await admin(env, "POST", `/admin/queue/${id}/discard`)).status, 409, "a published one stays");
});

test("the minimum lists everything missing", async t => {
  const { env } = await setup(t);
  const id = await ready(env);
  await draft(env, id, { ...BODY, location: null });
  assert.deepEqual((await admin(env, "POST", `/admin/queue/${id}/approve`)).data.missing, ["Price", "Parish", "A photo", "Description"]);
});

test("Discard removes the unpublished draft and its photos", async t => {
  const { env } = await setup(t);
  const id = await ready(env);
  const lid = (await draft(env, id)).data.id;
  seedMedia(env, { id: "A00052", listing_id: lid, origin: "upload", r2_key: "media/x.jpg", thumb_key: "thumbs/x.jpg" });
  env.MEDIA.store.set("media/x.jpg", { body: "x" });
  assert.equal((await admin(env, "POST", `/admin/queue/${id}/discard`)).status, 200);
  assert.equal(row(env, id).status, "discarded");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM listings WHERE id = ?").get(lid).n, 0);
  assert.equal(env.MEDIA.store.has("media/x.jpg"), false);
});

test("Records in any spelling is never read, nor sent as the folder itself; a null body is a 400", async t => {
  const { env } = await setup(t);
  const d2 = await fakeDrive(t, { ...HOUSE, F_OLDREC0001: { name: "Old records", parent: "F_HOUSE00001" },
    D_INOLDREC01: { name: "lease.pdf", mimeType: "application/pdf", parent: "F_OLDREC0001" },
    D_RECFILE001: { name: "Records 2024.pdf", mimeType: "application/pdf", parent: "F_HOUSE00001" },
    F_INRECORDS1: { name: "Contracts", parent: "F_RECORDS001" } });
  const env2 = { ...env, ...d2.env };
  const sent = await admin(env2, "POST", "/admin/queue", { link: "F_RECORDS001" });
  assert.equal(sent.status, 400);
  assert.match(sent.data.error, /Records/);
  const inside = await admin(env2, "POST", "/admin/queue", { link: "F_INRECORDS1" });
  assert.equal(inside.status, 400, "a folder inside Records is refused too");
  assert.match(inside.data.error, /Records/);
  await admin(env2, "POST", "/admin/queue", { link: LINK });
  const docs = (await hermes(env2, "POST", "/hermes/imports/next")).data.import.documents.map(x => x.path);
  assert.deepEqual(docs, ["Details.docx", "Notes", "Old/old.pdf"]);
  assert.ok(!d2.calls.some(c => c.includes("F_OLDREC0001")), "Old records is never opened");
  assert.equal((await call(env2, "POST", "/admin/queue", { body: null, cookie: await adminCookie() })).status, 400);
});

test("a Drive failure while Hermes claims is kept as the reason when the row fails", async t => {
  const { env } = await setup(t);
  await admin(env, "POST", "/admin/queue", { link: LINK });
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init) => (String(input).includes("in+parents") || String(input).includes("in%20parents")
    ? new Response("busy", { status: 503 }) : real(input, init));
  assert.equal((await hermes(env, "POST", "/hermes/imports/next")).status, 502);
  globalThis.fetch = real;
  assert.match(row(env, 1).error, /Google Drive/);
  env.DB.raw.prepare("UPDATE drive_imports SET claimed_at = '2026-01-01T00:00:00.000Z', attempts = 3").run();
  await hermes(env, "POST", "/hermes/imports/next");
  assert.equal(row(env, 1).status, "failed");
  assert.match(row(env, 1).error, /Google Drive/);
});

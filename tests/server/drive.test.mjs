// PUB-21 (spec 2026-11-05): the Drive client. Records never opened (D7), Edited photos only (D5, D6), limits (C12).
import test from "node:test";
import assert from "node:assert/strict";
import { decodeJwt } from "jose";
import { fakeDrive, HOUSE } from "./fake-drive.mjs";
import { folderIdFrom, isEdited, isRecords, folderInfo, walkFolder, photosIn, fileResponse, chooseEdited } from "../../server/drive.js";

test("folderIdFrom: Drive folder links and bare ids only", () => {
  for (const s of ["https://drive.google.com/drive/u/5/folders/F_HOUSE12345?usp=sharing",
    "https://drive.google.com/drive/folders/F_HOUSE12345", " F_HOUSE12345 "]) assert.equal(folderIdFrom(s), "F_HOUSE12345", s);
  for (const s of ["https://example.com/folders/F_HOUSE12345", "https://drive.google.com/file/d/F_HOUSE12345/view", "", "a'b",
    "https://drive.google.com.evil.test/drive/folders/F_HOUSE12345"]) assert.equal(folderIdFrom(s), null, s);
});

test("folder names: Edited and Records", () => {
  for (const n of ["Edited", "edited photos", "Fotos editadas", "EDITADAS 2025"]) assert.ok(isEdited(n), n);
  for (const n of ["Photos", "Records", "Unedited", "Unedited photos", "Not edited", "No editadas"]) assert.ok(!isEdited(n), n);
  assert.ok(isRecords(" records "));
  for (const n of ["Records 2024", "Old records", "Tenancy Record"]) assert.ok(isRecords(n), n);
  assert.ok(!isRecords("Recorded tour"));
});

test("walkFolder: documents of the folder and its subfolders, never Records, photos or videos", async t => {
  const d = await fakeDrive(t, HOUSE);
  const w = await walkFolder(d.env, "F_HOUSE00001");
  assert.deepEqual(w.documents.map(x => x.path), ["Details.docx", "Notes", "Old/old.pdf"]);
  assert.deepEqual(w.editedFolders.map(x => x.name).sort(), ["Edited", "Edited Photos"]);
  assert.ok(!d.calls.some(c => c.includes("F_RECORDS001")), "Records is never opened");
  assert.ok(!d.calls.some(c => c.includes("F_RAW0000001")), "a photos folder is not walked");
});

test("walkFolder: at most 30 documents of up to 20 MB", async t => {
  const files = { F_BIG0000001: { name: "Big" } };
  for (let i = 0; i < 31; i++) files[`D_${String(i).padStart(9, "0")}`] = { name: `doc ${String(i).padStart(2, "0")}.pdf`,
    mimeType: "application/pdf", parent: "F_BIG0000001" };
  files.D_HUGE000001 = { name: "huge.pdf", mimeType: "application/pdf", parent: "F_BIG0000001", size: 21 * 1024 * 1024 };
  const d = await fakeDrive(t, files);
  const w = await walkFolder(d.env, "F_BIG0000001");
  assert.equal(w.documents.length, 30);
  assert.ok(w.skipped.some(s => /more than 30 documents/.test(s)), w.skipped.join("|"));
  assert.ok(w.skipped.some(s => /huge\.pdf.*larger than 20 MB/.test(s)), w.skipped.join("|"));
});

test("photosIn: the folder's own photos by name, HEIC marked", async t => {
  const d = await fakeDrive(t, HOUSE);
  const p = await photosIn(d.env, "F_EDITED0001");
  assert.deepEqual(p.photos.map(x => [x.name, x.heic]), [["a.jpg", false], ["b.png", false], ["c.heic", true]]);
});

test("fileResponse: Google Docs exported as text, HEIC through a large thumbnail", async t => {
  const d = await fakeDrive(t, HOUSE);
  assert.equal(await (await fileResponse(d.env, { id: "D_NOTES00001", mimeType: "application/vnd.google-apps.document" })).text(),
    "export D_NOTES00001 text/plain");
  assert.equal(await (await fileResponse(d.env, { id: "D_DETAILS001", mimeType: "application/pdf" })).text(), "Asking price £675,000");
  const [heic] = (await photosIn(d.env, "F_EDITED0001")).photos.filter(x => x.heic);
  assert.equal(await (await fileResponse(d.env, heic)).text(), "thumb P_C000000001 1600");
});

test("the token: drive.readonly, asked once an hour; no key, 503", async t => {
  const d = await fakeDrive(t, HOUSE);
  assert.deepEqual(await folderInfo(d.env, "F_HOUSE00001"), { id: "F_HOUSE00001", name: "27 Example Road", parents: [] });
  await folderInfo(d.env, "F_EDITED0001"); // a second call within the hour: same token
  assert.equal(d.tokens.length, 1);
  assert.equal(decodeJwt(d.tokens[0]).scope, "https://www.googleapis.com/auth/drive.readonly");
  assert.equal(await folderInfo(d.env, "F_MISSING001"), null);
  assert.equal(await folderInfo(d.env, "D_DETAILS001"), null, "a file is not a folder");
  await assert.rejects(folderInfo({ ...d.env, GOOGLE_SERVICE_ACCOUNT: undefined }, "F_HOUSE00001"), e => e.status === 503);
});

test("chooseEdited: none, one, the newest of several, or the one the note names", () => {
  const a = { id: "A", name: "Edited", modifiedTime: "2026-10-30T00:00:00Z" }, b = { id: "B", name: "Edited 2", modifiedTime: "2026-09-01T00:00:00Z" };
  assert.deepEqual(chooseEdited([], null), { folder: null, warning: 'No "Edited" folder: the draft will have no photos.' });
  assert.deepEqual(chooseEdited([b], null), { folder: b, warning: null });
  assert.deepEqual(chooseEdited([b, a], null), { folder: a, warning: 'Several "Edited" folders: used "Edited" (the most recent).' });
  assert.deepEqual(chooseEdited([b, a], " edited 2 "), { folder: b, warning: null });
  assert.deepEqual(chooseEdited([b, a], "Other"), { folder: a, warning: 'Several "Edited" folders: used "Edited" (the most recent).' });
});

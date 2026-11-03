import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeText, readPropertyText, draftBody, labelFromName, planFolder, readDrop } from "../../server/listing-import.js";
import { checkPrice } from "../../server/listing.js";

// PUB-01 (spec 2026-11-03): «Add new property» from a folder. Invented values only (public repo).
const EX = ["Title: Le Clos Test", "Type: House", "Use: Residential", "Operation: Sale", "Availability: For sale", "Country: jersey",
  "Parish: st. brelade", "Location: St Aubin", "Road: Le Mont Test", "Bedrooms: 4 bedrooms", "Bathrooms: 3", "Tenure: Freehold",
  "Housing category: Qualified", "Restriction: Over 55s only", "Price: £1,250,000", "Tour URL: https://my.matterport.com/show/?m=test",
  "Summary:", "- Sea views", "• Large garden", "Description:", "Location: set above the bay.", "", "A second paragraph."].join("\n");

test("template: the shipped property.txt reads with nothing and no notes", () =>
  assert.deepEqual(readPropertyText(readFileSync(new URL("../../admin/public/property.txt", import.meta.url), "utf8")), { fields: {}, notes: [], warnings: [] }));

test("text: a filled example", () => assert.deepEqual(readPropertyText(EX), { notes: [], warnings: [], fields: {
  title: "Le Clos Test", property_type: "House", use: "residential", operation: "sale", availability: "for_sale", country: "Jersey",
  parish: "St Brelade", location: "St Aubin", road_name: "Le Mont Test", bedrooms: 4, bathrooms: 3, tenure_type: "freehold",
  housing_category: "qualified", restriction: "over_55", price: { amount: 1250000 }, currency: "GBP",
  tour_url: "https://my.matterport.com/show/?m=test", summary: "Sea views\nLarge garden",
  description: "Location: set above the bay.\nA second paragraph." } }));

test("text: decodeText reads UTF-8 with a BOM, else Windows-1252", () => {
  assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0xc2, 0xa3, 0x31])), "£1");
  assert.equal(decodeText(new Uint8Array([0xa3, 0x31])), "£1");
});

test("text: field names in any form, CRLF, # lines, unknown and repeated lines", () => {
  const r = readPropertyText("tour-URL: https://example.test/t\r\n# a note\r\nBEDROOMS: 2\r\nGarage: double\r\nBedrooms: 3\r\nhello\r\n");
  assert.deepEqual(r.fields, { tour_url: "https://example.test/t", bedrooms: 3 });
  assert.deepEqual(r.notes, ['Line 4: "Garage: double" isn\'t a field of the template.', 'Line 6: "hello" isn\'t a field of the template.']);
  assert.deepEqual(r.warnings, ["Bedrooms appears more than once: line 5 is used."]);
  // Lookups are own keys only: «Constructor» is not a field, and «constructor» is a country like any other text.
  assert.deepEqual(readPropertyText("Constructor: x\nCountry: constructor"), { fields: { country: "constructor" }, notes: ['Line 1: "Constructor: x" isn\'t a field of the template.'], warnings: [] });
});

test("text: list values by label or value; parish and country forms", () => {
  for (const [line, key, want] of [["Availability: FOR-SALE", "availability", "for_sale"], ["Tenure: Flying freehold", "tenure_type", "flying_freehold"],
    ["Restriction: First-time buyers only", "restriction", "first_time_buyer"], ["Housing category: registered", "housing_category", "registered"],
    ["Operation: business", "operation", "business"], ["Parish: Saint Helier", "parish", "St Helier"], ["Parish: TRINITY", "parish", "Trinity"],
    ["Country: uk", "country", "United Kingdom"], ["Country: Portugal", "country", "Portugal"]]) assert.equal(readPropertyText(line).fields[key], want, line);
  assert.deepEqual(readPropertyText("Restriction: None"), { fields: {}, notes: [], warnings: [] });
  assert.deepEqual(readPropertyText("Parish: St Bralade").notes, ['Parish: "St Bralade" isn\'t one of the accepted values.']);
});

test("text: numbers and the server's own messages", () => {
  assert.deepEqual(readPropertyText("Bathrooms: 3-4\nBedrooms: 101").fields, {});
  assert.deepEqual(readPropertyText(`Title: ${"x".repeat(201)}\nTour URL: http://example.test\nPublished: 1`).notes,
    ["Title: At most 200 characters", "Tour URL: Must start with https://", 'Line 3: "Published: 1" isn\'t a field of the template.']);
});

test("text: price formats", () => {
  const p = s => readPropertyText(`Price: ${s}`).fields;
  assert.deepEqual(p("850000"), { price: { amount: 850000 } });
  assert.deepEqual(p("€1.2m"), { price: { amount: 1200000 }, currency: "EUR" });
  assert.deepEqual(p("850k"), { price: { amount: 850000 } });
  assert.deepEqual(p("1 250 000 GBP"), { price: { amount: 1250000 }, currency: "GBP" });
  assert.deepEqual(p("£2,500 pcm"), { price: { amount: 2500, suffix: "month" }, currency: "GBP", rent_period: "month" });
  assert.deepEqual(p("30,000 p.a."), { price: { amount: 30000, suffix: "year" }, rent_period: "year" });
  assert.deepEqual(p("1,250.50 per month"), { price: { amount: 1250.5, suffix: "month" }, rent_period: "month" });
  assert.deepEqual(p("Offers over £850,000"), { price_text: "Offers over £850,000" });
  assert.deepEqual(readPropertyText("Price: 850.000"), { fields: {}, notes: ['Price: "850.000" isn\'t a clear amount. Write it like 850000 or 850,000.'], warnings: [] });
  assert.deepEqual(readPropertyText("Price: 0").notes, ["Price: Amount above 0, or leave blank if unknown"]);
});

test("text: a doubtful amount isn't imported", () => {
  const r1 = readPropertyText("Price: €450,000\nCurrency: GBP"), r2 = readPropertyText("Price: £30,000 pa\nRent period: Per month"),
    r3 = readPropertyText("Price: 500000\nCurrency: USD");
  assert.deepEqual([r1.fields, r2.fields, r3.fields], [{ currency: "GBP" }, { currency: "GBP", rent_period: "month" }, {}]);
  assert.match(r1.notes.join(" "), /says EUR but Currency says GBP/); assert.match(r2.notes.join(" "), /says per year but Rent period says per month/);
  assert.match(r3.notes.join(" "), /Currency: "USD" isn't one of the accepted values\./); assert.match(r3.notes.join(" "), /currency isn't clear/);
});

test("draftBody: the price follows the form's operation; the form wins for its five fields", () => {
  const form = { title: "T", use: "residential", operation: "rent", availability: "to_let", country: "Jersey" }, sale = { ...form, operation: "sale", availability: "for_sale" };
  const pcm = readPropertyText("Title: From file\nPrice: £2,500 pcm").fields, plain = readPropertyText("Price: 850000").fields;
  const cases = [draftBody(pcm, form), draftBody(pcm, sale), draftBody(plain, sale), draftBody(plain, { ...form, operation: "business" }), draftBody(plain, form)];
  assert.deepEqual(cases[0], { body: { ...form, rent: 2500, currency: "GBP", rent_period: "month" }, notes: [] });
  assert.deepEqual(cases[1].body, { ...sale, currency: "GBP" }); assert.match(cases[1].notes[0], /pcm and pa are for rentals only/);
  assert.deepEqual(cases[2].body, { ...sale, sale_price: 850000, currency: "GBP" });
  assert.equal(cases[3].body.premium, 850000);
  assert.equal(cases[4].body.rent, undefined); assert.deepEqual(cases[4].notes, ["Rent: say per month or per year."]);
  for (const c of cases) assert.deepEqual(checkPrice(c.body), {});
});

test("text: Summary runs to Description, Description to the end", () => {
  const { fields } = readPropertyText("Summary: First\n- Second\nPrice: 5\nDescription:\nLocation: set above the bay.\n\n# hidden\nTenure: Freehold");
  assert.deepEqual(fields, { summary: "First\nSecond\nPrice: 5", description: "Location: set above the bay.\nTenure: Freehold" });
});

test("text: contact details in public text are flagged, not dropped", () => {
  const r = readPropertyText("Summary: Call 01534 000000\nDescription: Write to someone@example.test");
  assert.deepEqual(r.fields, { summary: "Call 01534 000000", description: "Write to someone@example.test" });
  assert.deepEqual(r.notes, []);
  assert.equal(r.warnings.filter(n => /email address or phone number/.test(n)).length, 2);
  assert.deepEqual(readPropertyText("Price: £1,250,000\nDescription: Built in 1982, 2,500 sq ft.").warnings, []);
});

// The folder (spec §3.3): only its own files (Luis, decision 5). f() builds a picked file as the panel passes it.
const f = (path, size = 1000) => ({ file: { name: path.split("/").pop() || path, size }, path });

test("folder: hidden files, subfolders, kinds, order, labels and cover", () => {
  const p = planFolder(["Le Clos/IMG_1234.jpg", "Le Clos/02 Kitchen.JPG", "Le Clos/Drone 2.jpg", "Le Clos/01 Front.jpeg", "Le Clos/Aerial view.webp",
    "Le Clos/Floor plan ground.png", "Le Clos/10 Garden.jpg", "Le Clos/03 Hall.jpg", "Le Clos/.DS_Store", "Le Clos/._01 Front.jpeg", "Le Clos/Thumbs.db",
    "Le Clos/360 photos/pano.jpg", "Le Clos/__MACOSX/x.jpg", "Le Clos/property.txt"].map(x => f(x)));
  assert.deepEqual(p.photos.map(x => [x.name, x.kind, x.label]), [["01 Front.jpeg", "photo", "Front"], ["02 Kitchen.JPG", "photo", "Kitchen"],
    ["03 Hall.jpg", "photo", "Hall"], ["10 Garden.jpg", "photo", "Garden"], ["Aerial view.webp", "aerial", "Aerial view"], ["Drone 2.jpg", "photo", "Drone 2"],
    ["Floor plan ground.png", "floorplan", "Floor plan ground"], ["IMG_1234.jpg", "photo", null]]);
  assert.deepEqual([p.folder, p.cover, p.text.name, p.subfolders, p.skipped, p.error], ["Le Clos", 0, "property.txt", ["360 photos"], [], null]);
});

test("folder: the cover skips aerial-named photos unless nothing else is left", () => {
  assert.equal(planFolder(["A/Drone 1.jpg", "A/Drone 2.jpg", "A/Kitchen.jpg"].map(x => f(x))).cover, 2);
  assert.equal(planFolder(["A/Drone 1.jpg", "A/Drone 2.jpg"].map(x => f(x))).cover, 1);
  assert.equal(planFolder([f("A/Floor plan.jpg")]).cover, null);
});

test("folder: what isn't uploaded, grouped by reason", () => assert.deepEqual(planFolder([...["A/IMG_1.HEIC", "A/IMG_2.heif", "A/Brochure.pdf", "A/Tour.MOV",
  "A/Notes.docx", "A/notes.txt", "A/property.txt", "A/plan.dwg", "A/ok.jpg"].map(x => f(x)), f("A/big.jpg", 40 * 1024 * 1024 + 1)]).skipped,
  ["HEIC photos (export them as JPG first): IMG_1.HEIC, IMG_2.heif", "PDFs aren't uploaded: Brochure.pdf", "Videos aren't uploaded: Tour.MOV",
    "Only property.txt is read: Notes.docx, notes.txt", "Not photos: plan.dwg", "Larger than 40 MB: big.jpg"]));

test("folder: which text file is read", () => {
  assert.equal(planFolder(["A/PROPERTY.TXT", "A/x.txt", "A/a.jpg"].map(x => f(x))).text.name, "PROPERTY.TXT");
  assert.equal(planFolder(["A/Le Clos.txt", "A/a.jpg"].map(x => f(x))).text.name, "Le Clos.txt");
  const two = planFolder(["A/a.txt", "A/b.txt", "A/a.jpg"].map(x => f(x)));
  assert.equal(two.text, null); assert.ok(two.skipped.includes("Several text files, so none was read (name the one with the details property.txt): a.txt, b.txt"));
  const big = planFolder([f("A/property.txt", 100 * 1024 + 1), f("A/a.jpg")]);
  assert.equal(big.text, null); assert.ok(big.skipped.includes("property.txt is larger than 100 KB and wasn't read."));
  assert.equal(planFolder(["A/sub/property.txt", "A/a.jpg"].map(x => f(x))).text, null);
});

test("folder: refused selections", () => {
  const many = n => planFolder(Array.from({ length: n }, (_, i) => f(`A/${i}.jpg`)));
  assert.equal(many(101).error, "This folder has 101 photos. The limit is 100: choose the property's own folder."); assert.equal(many(100).error, null);
  for (const items of [[f("A/Brochure.pdf")], [f("A/sub/a.jpg")]]) assert.equal(planFolder(items).error, "No photos or property.txt in this folder.");
});

test("folder: loose photos and an empty relative path", () => {
  const p = planFolder([f("b.jpg"), { file: { name: "a.jpg", size: 1 }, path: "" }]);
  assert.deepEqual([p.folder, p.photos.map(x => x.name), p.subfolders], [null, ["a.jpg", "b.jpg"], []]);
});

test("labelFromName: camera names give no label; numbering and underscores go", () => {
  for (const n of ["IMG_1234.JPG", "DSC01234.jpg", "DSCN0001.jpg", "DSCF0001.jpg", "PXL_20261103_101010123.jpg", "P1010001.JPG",
    "WhatsApp Image 2026-11-03 at 10.10.10.jpeg", "Screenshot 2026-11-03 at 10.10.10.png", "Photo 12.jpg", "image1.png", "0012.jpg",
    "PXL_20261103_101010123.MP.jpg", "IMG-20261103-WA0001.jpg", "IMG_1234 (1).jpg"]) assert.equal(labelFromName(n), null, n);
  assert.deepEqual(["1st floor plan.jpg", "3D floor plan.png", "1960s kitchen.jpg"].map(labelFromName), ["1st floor plan", "3D floor plan", "1960s kitchen"]);
  assert.deepEqual(["01 - Kitchen.jpg", "02_living_room.jpg", "1. Garden view.webp", "IMG_1234 kitchen.jpg"].map(labelFromName),
    ["Kitchen", "living room", "Garden view", "IMG 1234 kitchen"]);
});

test("readDrop: one folder read in batches, its subfolders named, nothing else accepted", async () => {
  const file = name => ({ isFile: true, isDirectory: false, name, file: ok => ok({ name, size: 1 }) });
  const dir = (name, kids) => ({ isFile: false, isDirectory: true, name,
    createReader: () => { const b = [kids.slice(0, 2), kids.slice(2), []]; return { readEntries: ok => ok(b.shift()) }; } });
  const r = await readDrop([dir("Le Clos", [file("01.jpg"), dir("360 photos", []), file("property.txt"), file("02.jpg")])]);
  assert.deepEqual([r.items.map(i => i.path), r.subfolders, r.error], [["Le Clos/01.jpg", "Le Clos/property.txt", "Le Clos/02.jpg"], ["360 photos"], null]);
  assert.deepEqual((await readDrop([file("a.jpg"), file("b.jpg")])).items.map(i => i.path), ["a.jpg", "b.jpg"]);
  for (const e of [[dir("A", []), dir("B", [])], [dir("A", []), file("a.jpg")]]) assert.equal((await readDrop(e)).error, "Drop one property folder at a time.");
});

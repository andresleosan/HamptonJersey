# PUB-01 · Add a property from a folder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «Add new property» replaces «New listing». It opens the same draft form, plus an optional folder import that:
- reads `property.txt`;
- uploads the folder's own photos in name order and sets the cover;
- then opens the editor.

**Architecture:** everything runs in the browser.
- A pure module, `server/listing-import.js`, reads the text file and plans the photos. It is shared like `server/applicants.js` and tested by node.
- The panel form, `admin/src/NewProperty.jsx`, uses only existing routes:
  - `POST /admin/listings` creates the draft;
  - `POST /admin/listings/:id/media` uploads each photo;
  - `PUT /admin/listings/:id/media` sets the cover.
- No server route changes and no migration.

**Tech Stack:** React 19 + Vite panel; Cloudflare Pages Functions, D1 and R2 (unchanged); node:test; Playwright e2e (playwright-core 1.61).

**Spec:** docs/superpowers/specs/2026-11-03-hampton-app-folder-import-design.md

## Global Constraints

### Scope and limits

- **Nothing changes in:**
  - `server/routes/`, `functions/` and `migrations/`;
  - dependencies, fonts and endpoints (no new ones).
- **`server/listing-import.js`:**
  - uses no DOM, no `env` and no network;
  - imports only from `./listing.js` and `./applicants.js`;
  - the panel imports it as `../../server/listing-import.js`.
- **Limits:**
  - `MAX_PHOTOS = 100` top-level images;
  - text file ≤ `100 * 1024` bytes;
  - photo ≤ `40 * 1024 * 1024` bytes.
- **Images:**
  - `.jpg .jpeg .png .webp`, in any case;
  - only the files directly in the chosen folder: subfolders are never read (Luis, decision 5).
- **Ignored silently:** names starting with `.`, plus `Thumbs.db`, `desktop.ini` and `__MACOSX`.
- **Each photo upload:**
  - `resizeImage(file, 1600)` and `resizeImage(file, 640, 0.8)`;
  - then `POST` with `file`, `thumb`, `label`, `kind`, `width` and `height`;
  - one at a time, in plan order.

### Template and form fields

- **Template fields → listing columns** (fixed; nothing else can be set from the file):

  | Template field | Column |
  |---|---|
  | Title | `title` |
  | Type | `property_type` |
  | Use | `use` |
  | Operation | `operation` |
  | Availability | `availability` |
  | Country | `country` |
  | Parish | `parish` |
  | Location | `location` |
  | Road | `road_name` |
  | Bedrooms | `bedrooms` |
  | Bathrooms | `bathrooms` |
  | Tenure | `tenure_type` |
  | Housing category | `housing_category` |
  | Restriction | `restriction` |
  | Price | the operation's amount (`sale_price`, `rent` or `premium`), or `price_text` |
  | Rent period | `rent_period` |
  | Currency | `currency` |
  | Tour URL | `tour_url` |
  | Summary | `summary` |
  | Description | `description` |

- **The five form fields:**
  - they start as `START = { title: "", use: "residential", operation: "sale", availability: "for_sale", country: "Jersey" }`;
  - every pick and every «Remove» resets them to `START`;
  - then the file's values apply, and the folder name fills a blank title;
  - what the person types afterwards wins.

### Exact copy

Tests rely on these strings:
- `Add new property`, `Import a folder (optional)`, `Choose folder`, `Choose photos`
- `Download the template (property.txt)`, `Remove`, `Create draft`, `Cancel`, `Open the listing`, `Close`, `Check before you publish:`
- `Creating the draft…`, `Uploading photo {i} of {n}…`
- `Draft {id} created. {k} of {n} photos uploaded.`
- `A listing with this title already exists: {id}.`
- `This folder has {n} photos. The limit is 100: choose the property's own folder.`
- `No photos or property.txt in this folder.`
- `Drop one property folder at a time.`
- `Subfolders not read: {names}.`
- `Rent: say per month or per year.`
- `Choose the cover in the editor.`

### Rules copied from DESIGN.md

- **Color:**
  - panel tokens only, and no new colors;
  - `.warn` (warn-bg with a bronze left border) for what isn't imported and for the duplicate title;
  - `.err` with `role="alert"` for errors, `role="status"` for progress;
  - bronze only for focus and hover (One Accent Rule);
  - every state carries its text (Text-Not-Color Rule).
- **Type:**
  - panel body 14px/1.5;
  - H2 19px Tenor Sans, without capitals;
  - `label` and `.muted` 12px stone;
  - buttons 12px, uppercase, `.08em`;
  - weights 400, 500 and 600 only.
- **Spacing and layout:**
  - new CSS uses only 4, 8, 12, 16, 24 and 32px;
  - panel density: gaps of 8–16px;
  - mobile-first; a 760px breakpoint only if something must stack;
  - z-index only from the existing levels.
- **Components:**
  - reuse `.card.new`, `.dropzone` (and `.over`), `.btn`, `.btn.ghost.sm`, `.filters`, `.muted`, `.warn`, `.err` and `.ok`;
  - a native `<details>` for a long file list;
  - real `<button>`s that open hidden file inputs;
  - the drop zone is a `div` and is not itself a click target (no pointer cursor).
- **Accessibility:**
  - every visible input has its `<label>`; the hidden inputs are reached through their buttons;
  - dragging has button alternatives (WCAG 2.5.7);
  - the duplicate-title warning is tied to Title with `aria-describedby`;
  - errors use `role="alert"`, progress `role="status"`, focus stays visible (existing `:focus-visible`);
  - panel targets ≥ 32px;
  - works at 200% zoom, and at 390px without horizontal scroll;
  - motion follows the panel's global reduced-motion rule.
- **Performance:**
  - no previews of the originals: names only;
  - resize in the browser with `resizeImage`;
  - uploads one at a time.
- **Security:**
  - never `dangerouslySetInnerHTML`;
  - file names, file text and API errors are rendered as text;
  - no `style=` attributes, and nothing in `localStorage`;
  - the template link is the same-origin `property.txt`, with `download`.
- **Copy (D19):**
  - functional English, in sentence case;
  - no exclamations and no emoji;
  - no «—» as a separator in new sentences.

### Public repo

- Invented test data only: `admin@example.test`, made-up houses and the phone number `01534 000000`.
- No real emails, addresses or phone numbers.

## Review Focus

1. **Double submit:** double-clicking «Create draft» makes one listing, not two. Guard with a ref, not only the disabled state (Task 3: e2e `dblclick`, then exactly one row with that title).
2. **Leaving mid-upload:** after the confirm, the loop stops and never pulls the person back to the editor. The draft keeps what was uploaded (Task 3, walkthrough step).
3. **A failed upload** (server error, lost connection, expired session):
   - the photo is listed and the rest go on;
   - the page ends with «Open the listing».

   Pinned by Task 3, e2e phone pass, with a 500 on the second upload.
4. **The cover call failing** (409 when someone saved meanwhile) is not fatal: the page shows «Choose the cover in the editor.» (Task 3, e2e phone pass, with a 409 on `PUT` media).
5. **Empty `webkitRelativePath`:** some browsers leave it empty. Such a file counts as a top-level file named by `file.name` (Task 2 unit test).

---

### Task 1: Read property.txt

**Files:**
- Create: `admin/public/property.txt` (served at `/admin/property.txt`).
- Create: `server/listing-import.js`.
- Create: `tests/server/listing-import.test.mjs`.
- Modify: `docs/superpowers/plans/2026-11-03-hampton-app-folder-import-ledger.md`.

**Interfaces:**
- Produces:
  - `decodeText(bytes: Uint8Array) -> string`
    - decodes UTF-8 with `fatal: true` and drops a leading BOM;
    - on a decoding error, decodes `windows-1252` instead.
  - `readPropertyText(text: string) -> { fields, notes: string[], warnings: string[] }` (`warnings` added by the final review: a repeated line and contact details, both about text that is imported)
    - `fields` holds only valid values, keyed by listing column;
    - `currency` and `rent_period` are already resolved from their own lines, or else from the price's symbol, code or suffix;
    - an amount is kept as `price: { amount: number, suffix?: "month" | "year" }`.
  - `draftBody(fields, form: { title, use, operation, availability, country }) -> { body, notes: string[] }`
    - `body` is the `POST /admin/listings` body.

- [ ] **Step 1: Template.** `admin/public/property.txt` holds exactly the template from spec §3.1: every value blank, with Summary and Description last.

- [ ] **Step 2: Failing tests** in `tests/server/listing-import.test.mjs`. `const EX` is a filled example built from invented values:
  - Title `Le Clos Test`, Type `House`, Use `Residential`, Operation `Sale`, Availability `For sale`;
  - Country `jersey`, Parish `st. brelade`, Location `St Aubin`, Road `Le Mont Test`;
  - Bedrooms `4 bedrooms`, Bathrooms `3`;
  - Tenure `Freehold`, Housing category `Qualified`, Restriction `Over 55s only`;
  - Price `£1,250,000`, Tour URL `https://my.matterport.com/show/?m=test`;
  - Summary lines `- Sea views` and `• Large garden`;
  - Description `Location: set above the bay.`, a blank line, then `A second paragraph.`

```js
test("template: the shipped property.txt reads with nothing and no notes", () =>
  assert.deepEqual(readPropertyText(readFileSync(new URL("../../admin/public/property.txt", import.meta.url), "utf8")), { fields: {}, notes: [] }));
test("text: a filled example", () => assert.deepEqual(readPropertyText(EX), { notes: [], fields: {
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
  for (const re of [/^Line 4: "Garage: double" isn't a field of the template\.$/, /^Bedrooms appears more than once: line 5 is used\.$/,
    /^Line 6: "hello" isn't a field of the template\.$/]) assert.ok(r.notes.some(n => re.test(n)), re);
});
test("text: list values by label or value; parish and country forms", () => {
  for (const [line, key, want] of [["Availability: FOR-SALE", "availability", "for_sale"], ["Tenure: Flying freehold", "tenure_type", "flying_freehold"],
    ["Restriction: First-time buyers only", "restriction", "first_time_buyer"], ["Housing category: registered", "housing_category", "registered"],
    ["Operation: business", "operation", "business"], ["Parish: Saint Helier", "parish", "St Helier"], ["Parish: TRINITY", "parish", "Trinity"],
    ["Country: uk", "country", "United Kingdom"], ["Country: Portugal", "country", "Portugal"]]) assert.equal(readPropertyText(line).fields[key], want, line);
  assert.deepEqual(readPropertyText("Restriction: None"), { fields: {}, notes: [] });
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
  assert.deepEqual(readPropertyText("Price: 850.000"), { fields: {}, notes: ['Price: "850.000" isn\'t a clear amount. Write it like 850000 or 850,000.'] });
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
  assert.equal(r.notes.filter(n => /email address or phone number/.test(n)).length, 2);
  assert.deepEqual(readPropertyText("Price: £1,250,000\nDescription: Built in 1982, 2,500 sq ft.").notes, []);
});
```

- [ ] **Step 3:** `node --test tests/server/listing-import.test.mjs`. Expected: FAIL, because `server/listing-import.js` doesn't exist.

- [ ] **Step 4: Implement** `decodeText`, `readPropertyText` and `draftBody` in `server/listing-import.js`.
  - **Keys:** normalize by lower-casing and dropping everything but letters. «Tour URL» becomes `toururl` and «Housing category» becomes `housingcategory`.
  - **Blocks:**
    - `Summary` collects lines up to the `Description` line, and `Description` collects lines to the end;
    - text on the block's own line is its first line;
    - blank lines and `#` lines are dropped everywhere;
    - the summary's leading `- `, `• ` and `* ` bullets are removed.
  - **List values:** fold both sides with `s.toLowerCase().replace(/[^a-z0-9]+/g, "_")` and compare with every stored value in `ENUMS` and its panel label. Restriction also accepts `First-time buyers only`, `Over 55s only` and `None` (blank).
  - **Parish:** the same fold, after removing dots and turning a leading `saint ` into `st `.
  - **Country:** `jersey`, `united kingdom` and `uk` (any case) become `Jersey` and `United Kingdom`.
  - **Integers:** a leading whole number followed only by letters counts; anything else goes as the raw string to `validateListing`, so the note carries its message.
  - **Amounts:**
    - remove the currency (`£`, `€`, or `GBP`/`EUR` at either end) and the period suffix (spec §3.2);
    - then remove spaces, and commas between digit groups;
    - then match `^\d+(\.\d{1,2})?$`, or `^\d+(\.\d{1,3})?[km]$`;
    - anything with other letters is `price_text`;
    - anything else is the «isn't a clear amount» note.
  - **At parse time:** resolve the currency and period conflicts and the invalid Currency line, as in spec §3.2. Then run each value through `validateListing({ [col]: v }, { partial: true })`, and turn an error into `${Label}: ${message}` without keeping the value.
  - **Contact flag:**
    - checks Title, Location, Road, Summary and Description;
    - an email is `/\S+@\S+\.\S+/`;
    - a phone is a run of digits, spaces, `+`, `(`, `)` and `-` containing at least 10 digits;
    - the note reads `${Label} seems to include an email address or phone number. It will be public once the listing is published.`
  - **`draftBody`:**
    - starts from the fields without the five form keys and without `price`, then adds the form;
    - drops `rent_period` unless the operation is `rent`;
    - places `price.amount` under `{ sale: "sale_price", rent: "rent", business: "premium" }[operation]`, with `currency` defaulting to `GBP`;
    - doesn't place the amount in two cases: a suffix on a sale or business gives `Price: pcm and pa are for rentals only, so the amount wasn't imported.`; a rent without a period gives `Rent: say per month or per year.`

- [ ] **Step 5:** `npm test`. Expected: every test passes, the earlier ones included.

- [ ] **Step 6:** Write the ledger line for Task 1: the failing first run, then the rulings.

### Task 2: Plan the folder's photos

**Files:**
- Modify: `server/listing-import.js`.
- Modify: `tests/server/listing-import.test.mjs`.

**Interfaces:**
- Produces:
  - `labelFromName(name: string) -> string | null`
  - `pickCover(photos: Array<{ name: string, kind: string }>) -> number | null`
    - returns the index of the first `kind === "photo"` whose name doesn't say aerial or drone;
    - else the index of the first photo;
    - else `null`.
  - `planFolder(items: Array<{ file: { name, size }, path: string }>, subfolders: string[] = [])` returns:
    - `folder: string | null`
    - `photos: Array<{ file, name, kind, label }>`
    - `cover: number | null`
    - `text: file | null`
    - `skipped: string[]`
    - `subfolders: string[]`
    - `error: string | null`
  - `readDrop(entries: Array<FileSystemEntry-like>) -> Promise<{ items, subfolders: string[], error: string | null }>`
    - the entries come from `DataTransferItem.webkitGetAsEntry()`;
    - each `path` is `"<folder>/<name>"`, or the bare name for loose files.

- [ ] **Step 1: Failing tests.** `const f = (path, size = 1000) => ({ file: { name: path.split("/").pop() || path, size }, path })`.

```js
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
    "WhatsApp Image 2026-11-03 at 10.10.10.jpeg", "Screenshot 2026-11-03 at 10.10.10.png", "Photo 12.jpg", "image1.png", "0012.jpg"]) assert.equal(labelFromName(n), null, n);
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
```

- [ ] **Step 2:** `node --test tests/server/listing-import.test.mjs`. Expected: the new tests FAIL, because `planFolder` and the other functions aren't exported yet.

- [ ] **Step 3: Implement** in `server/listing-import.js`.
  - **Top-level file:** a path whose part after the first `/` has no further `/`. An empty path means `file.name`.
  - **`folder`:** the first segment, when the paths have one.
  - **Subfolders:** a deeper path names its subfolder. They are merged with the `subfolders` argument, with hidden names removed.
  - **Order:** `localeCompare(b, undefined, { numeric: true, sensitivity: "base" })`.
  - **Kinds:**
    - floor plan when the name matches `/floor[\s_-]*plan/i`;
    - aerial when it matches `/(^|[^a-z])(aerial|drone)([^a-z]|$)/i`; only the first such name, the rest stay `photo`.
  - **`pickCover`** decides the cover.
  - **`readDrop`:**
    - wraps `readEntries` and `file()` in promises, repeating `readEntries` until it returns an empty batch;
    - reads only the dropped folder's direct entries.

- [ ] **Step 4:** `npm test`. Expected: every test passes.

- [ ] **Step 5:** Write the ledger line for Task 2.

### Task 3: The «Add new property» form

**Files:**
- Create: `admin/src/NewProperty.jsx`.
- Modify: `admin/src/Listings.jsx`:
  - the buttons at `:67` and `:125` say `Add new property`;
  - `NewListing` (`:129-151`) is deleted;
  - Listings renders `<NewProperty rows={rows} onClose={…} />`.
- Modify: `admin/src/image.js`:
  - fill white before `drawImage`;
  - add `uploadPhoto`.
- Modify: `admin/src/MediaManager.jsx:44-50`: the loop body calls `uploadPhoto(listingId, file, { label: file.name.replace(/\.[^.]+$/, "") })`. Its behavior doesn't change.
- Modify: `admin/src/styles.css`: only what is missing.
- Modify: `tests/e2e.cjs`: `folderImport(page, phone)`, called right after `hermesDrafters(page)` in `admin()`.

**Interfaces:**
- Consumes: `decodeText`, `readPropertyText`, `draftBody`, `planFolder`, `pickCover` and `readDrop` (Tasks 1–2).
- Produces:
  - `uploadPhoto(listingId: string, file: File, { kind = "photo", label = null } = {}) -> Promise<media row>`
    - throws `Error("is larger than 40 MB")` above 40 MB;
    - otherwise runs the resize and the `POST`.
  - The default export `NewProperty({ rows, onClose })`.

- [ ] **Step 1: e2e step** `folderImport(page, phone)`.

  **Setup:**
  - Build `<tmp>/Le Clos Test` from `tests/fixtures/photo.jpg` copies:
    - `01 Front.jpg`, `02 Kitchen.jpg`, `Floor plan ground.jpg`, `IMG_1234.jpg`;
    - `360 photos/pano.jpg`.
  - Add a 40×40 fully transparent `Floor plan first.png`. Make it in the page with an `OffscreenCanvas` and `convertToBlob({ type: "image/png" })`, then write the bytes from node.
  - Add `notes.pdf`, `IMG_2041.HEIC` and `.DS_Store`.
  - Add a CRLF `property.txt` with these lines, so `Garage` is line 8:
    - `Title: Le Clos Test`, `Country: jersey`, `Parish: st. brelade`, `Bedrooms: 4 bedrooms`, `Tenure: Freehold`, `Housing category: Qualified`, `Price: £1,250,000`;
    - `Garage: double`;
    - `Summary:`, `- Sea views`;
    - `Description:`, `Location: set above the bay, invented for this test.`

  **Desktop (`page`):**
  - Open `admin/#/listings`, click `Add new property` and `setInputFiles(dir)` on `input[webkitdirectory]`.
  - Assert that the form shows:
    - `3 photos, 2 floor plans`;
    - `notes.pdf`, `IMG_2041.HEIC`, `Line 8: "Garage: double"` and `Subfolders not read: 360 photos.`;
    - no `pano.jpg`;
    - Title `Le Clos Test`.
  - Fill Title with HE-R001's title, read with `d1`, and see `A listing with this title already exists: HE-R001.`
  - Click `Remove`: Title is `""`. Pick the folder again.
  - Take the screenshot `admin-add-property`, then `dblclick` `Create draft`.
  - `waitForURL(/#\/p\/HE-R\d+$/)`, with a 60 s timeout.
  - Exactly 1 row has the title `Le Clos Test` (d1).
  - The editor shows:
    - `#f-country` `Jersey`, `#f-parish` `St Brelade`, `#f-bedrooms` `4` and `#f-sale_price` `1250000`;
    - `#f-tenure_type` `freehold` and `#f-housing_category` `qualified`;
    - `#f-summary` `Sea views`, and `#f-description` containing `Location: set above the bay`.
  - `fetch('/api/admin/listings/<id>')` in the page:
    - media `[label, kind, public]` are `[["Front","photo",1],["Kitchen","photo",1],["Floor plan first","floorplan",1],["Floor plan ground","floorplan",1],[null,"photo",1]]`;
    - `cover_media_id` is `media[0].id`.
  - «Missing from this listing» says `Add photos for the website (3 of 5)` and not `Choose a cover photo`.
  - `/media/<Floor plan first id>`, drawn on a canvas: pixel (0,0) has R, G and B > 245.
  - Take the screenshot `admin-add-property-editor`.

  **Phone (`phone`, 390):**
  - Click `Add new property`, then `setInputFiles([01 Front.jpg, 02 Kitchen.jpg])` on the non-directory `input[type=file][multiple]`.
  - Fill Title with `Phone import test`.
  - Route `/api/admin/listings/*/media`: the second `POST` gets a 500 `{"error":"Test failure"}`, and the `PUT` a 409.
  - Click `Create draft`. Expect `created. 1 of 2 photos uploaded.`, `02 Kitchen.jpg`, `Choose the cover in the editor.` and no horizontal scroll.
  - Take the screenshot `admin-add-property-phone`, unroute, click `Open the listing` and see `#f-title`.

- [ ] **Step 2: `image.js`.**
  - Before `drawImage`, fill white: `ctx.fillStyle = "#fff"` and `ctx.fillRect(0, 0, w, h)`.
  - Add `uploadPhoto`, as in Interfaces, and point MediaManager's loop at it.
  - Run `npm test` and `npm run build`. Expected: both pass.

- [ ] **Step 3: `NewProperty.jsx`** (spec §3.4–3.5).
  - **State:**
    - `f`, starting at `START`;
    - `imp`: `{ plan, fields, notes } | null`;
    - `err`, `status` and `result`.
  - **Refs:**
    - `running`, the double-submit guard;
    - `alive`, false on unmount;
    - the two inputs.
  - **Picking:**
    - Every pick goes through `choose(items, subfolders)`.
    - When `planFolder` gives an error: `imp = null`, `f = START` and the error goes in the alert.
    - Otherwise:
      - read `plan.text` with `decodeText(new Uint8Array(await text.arrayBuffer()))` and `readPropertyText`;
      - `setF({ ...START, ...five(fields), title: fields.title ?? plan.folder ?? "" })`;
      - a short `role="status"` says what was read.
    - The two inputs:
      - the folder input gives items `{ file, path: file.webkitRelativePath }`;
      - the photos input gives items `{ file, path: file.name }`;
      - both reset `value = ""`, so the same folder can be picked again.
    - On drop, call `webkitGetAsEntry()` synchronously inside the handler, then `readDrop`.
  - **Duplicate title:** look in `rows` for the trimmed, lower-cased title.
  - **Submit:**
    1. Return if `running.current`; otherwise set it.
    2. `POST /admin/listings` with `draftBody(imp?.fields ?? {}, f).body`. Field errors show as today.
    3. `setUnsaved(true)`.
    4. Upload each `plan.photos` item with `uploadPhoto`. Collect `"<name>: <message>"` on failure, and `break` when `!alive.current`.
    5. Run `pickCover` over the uploaded items, then `GET /admin/listings/<id>` and `PUT /admin/listings/<id>/media` with `{ items: [], cover_media_id, updated_at }`. A failure there adds `Choose the cover in the editor.`
    6. `setUnsaved(false)`.
    7. With nothing failed and `alive.current`, go to `location.hash = "#/p/<id>"`. Otherwise show the result with `Open the listing`.
  - **Unmount:** `alive.current = false` and `setUnsaved(false)`.
  - **Display:**
    - the summary counts omit zeros and use the singular for one;
    - the file list sits in a `<details>`, which starts open when it has 12 files or fewer.

- [ ] **Step 4: `Listings.jsx`.** Wire up the buttons and `NewProperty`, then remove `NewListing` and its now-unused imports. Run `npm test` and `npm run build`. Expected: both pass.

- [ ] **Step 5: `styles.css`.** Add only what `.dropzone`, `.warn` and `.filters` don't already give: the zone's cursor, the list spacing, and wrapping for long file names. Every value comes from the spacing scale.

- [ ] **Step 6: Final checks.**
  - `npm test` and `npm run build`.
  - The full e2e from a fresh database, following the header of `tests/e2e.cjs`, with local R2 photos and `wrangler pages dev`. Expected: `e2e OK`.

- [ ] **Step 7: Walkthrough** on the local server at 1280 and 390, with screenshots in the scratchpad. Use Playwright MCP; if it won't start as root, use the e2e's playwright-core with the session cookie.
  - The empty form.
  - The summary with notes.
  - The editor after the import.
  - The phone result.
  - **Review Focus 2:** start an import with uploads delayed by a route, leave through the Listings link and accept the confirm. After the uploads would have ended, the page is still on Listings and the draft has only what was uploaded.

- [ ] **Step 8:** Write the ledger line for Task 3.

### Task 4: Documents, review and commit

**Files:**
- Modify: `docs/roadmap/checklist-hampton-app.html` (the JSON `datos` block):
  - **PUB-01:** stays `parcial`. Update `hecho` («Add new property», by hand or from a folder), `falta` (the guided intake for the phone and PUB-04 to PUB-09 stay) and `evidencia` (the new files and lines).
  - **AUT-13:** in `hecho` and `falta`, the door is open since 3-nov-2026, with the phase-1a avisador installed. Phase 1b, the door split, the WAF limit and `APP_ORIGIN` stay in `falta`.
  - **AUT-14:** becomes `parcial`. The channel posts alerts since 3-nov-2026 (a test viewing request reached it with no personal data). `falta` keeps the 08:00 summary check, a failed-send test and the team guide before inviting anyone.
  - **`actualizado`:** `2026-11-03`.
- Modify: `docs/roadmap/ESTADO.md`:
  - the F4 row: one sentence on «Add new property» from a folder;
  - the Hermes section: the door is open and the avisador live since 3-nov-2026;
  - the checklist points (AUT-14 `parcial`);
  - «Siguiente tarea».
- Modify: `docs/roadmap/2026-10-23-arquitectura-hampton-app.md` §5.10: one line on the folder import (PUB-01, spec 2026-11-03).
- Modify: the ledger.

- [ ] **Step 1: The edits above.**
  - No Telegram IDs, invite links, IPs, emails or labels that only exist on the VPS.
  - Don't touch `docs/audits/` or `docs/roadmap/Hampton APP.md`, which is untracked.

- [ ] **Step 2: Check the docs.**
  - `node -e` parses the `datos` JSON.
  - `npm test`. Expected: every test passes.

- [ ] **Step 3: Independent review.** Run one workflow of reviewers over the whole diff: bugs, security and privacy, DESIGN.md, code of more, and docs. Then fix what they find and rerun `npm test`, `npm run build` and the full e2e.

- [ ] **Step 4: Commit.**
  - One commit on `main`, with a short English message (`Add a property from a folder with Add new property`) and the Co-Authored-By line.
  - It includes the code, `admin/public/property.txt`, the tests, the spec, this plan, the ledger, ESTADO, the checklist and the architecture.
  - Nothing from `docs/audits/`, and not `Hampton APP.md`.

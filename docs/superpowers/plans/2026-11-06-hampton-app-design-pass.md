# Design pass: swipeable hero carousel and the AI tells, interface by interface Implementation Plan

> **Execution:** Implemented locally in `codex/hampton-design-pass`. See the [execution record](2026-11-06-hampton-app-design-pass-ledger.md) for verification, review fixes, decisions and remaining device/publication checks.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** The home carousel moves like a real gallery (finger swipe on Safari/Android, two-finger swipe on a
MacBook trackpad, arrow buttons for a mouse), and every screen of the website and the panel loses the marks
that read as machine-made: an eyebrow over every heading, "·" chains, shouting uppercase titles, decorative
arrows, repeated listings, template stat strips.

**Architecture:** No new libraries. The carousel is a native CSS scroll-snap track (`overflow-x:auto`,
`scroll-snap-type:x mandatory`) so the browser itself handles touch momentum, trackpad swipes and snapping;
JS only adds the arrow buttons, the "2 of 4" counter (IntersectionObserver, no scroll listeners) and
Left/Right keys. The same track replaces the photo stage on the listing page. The clean-up is copy and CSS in
`site/index.html`, `site/apply.js`, `admin/src/styles.css` and the panel `.jsx` files, pinned by static
checks in `tests/design.test.js` and by `tests/e2e.cjs`.

**Tech Stack:** vanilla JS site (`site/index.html`), React 19 panel (Vite), `node --test`, Playwright e2e.

**Spec:** this plan argues from Luis's request of 6-nov-2026 (below) and `DESIGN.md`. There is no separate
spec: the decisions it needs are in "Decisions for Luis".

> Luis, 6-nov: the landing carousel must scroll left and right smoothly, as if dragging the screen, on Safari
> and the Android browser; on a MacBook a two-finger swipe changes property; with a normal mouse the left and
> right arrows. Remove everything that looks obviously made by AI (some titles, the dots in the type) so it
> looks like the work of a professional UX/UI designer. One plan for every interface of the app.

## How each screen was judged (audit of 6-nov, live site + source)

Live screenshots at 1280 and 390 (home, /properties, /p/HE-R001) plus a source count per file. The tells, with
the rule each breaks (taste-skill §4.7/§9, antislop-ui, DESIGN.md "Don'ts"):

| Tell | Where today | Rule |
|---|---|---|
| Eyebrow above every heading | home 7 (hero, Properties, 3× Featured, Meet the team, Book a viewing), catalogue, detail summary, Similar, booking | max 1 per 3 sections; "Properties" over "Latest properties" says it twice |
| "·" chains | hero facts `£1,500 pcm · 2 bedrooms · 1 bathroom · Two-bedroom flat`, `Featured · Jersey`, footer, logo, ~110 in the panel | max one "·" per line; lists of facts are spaced items, not dotted strings |
| Duplicated facts | hero/feature/card: "2 bedrooms" and "Two-bedroom flat"; card "To let" next to the TO LET pill | each fact once |
| Shouting titles | listing addresses in 72px uppercase Tenor: the hero H1 wraps to 5 lines at 1280 | hero headline max 2 lines; display size planned with the image |
| Same 4 homes three times | home shows every listing in the carousel, again in Latest, and 3 of them again as Featured blocks (3 zigzags in a row) | no repeated content; zigzag cap 2 |
| Template stat strip | Team "1982 / Free / Mon–Sat / Sales & lettings" | stats row tell |
| Decorative arrows | `" →"` after "HOMES TO LET" (CSS), `↗` in two links, `→` in panel rows | arrows only where direction is the meaning |
| Filler chip | "Book with an agent" on every Featured block | a chip must say something this listing has |
| Spec table hairline on every row, repeating the summary | detail "Listing details" (Type, Operation, Price as listed already shown above) | no border on every row; no repeats |
| Tiny bronze caps | detail spec groups (ACCOMMODATION…) bronze 11px = 4.40:1 | fails AA; label in ink sentence case |
| En dash / em dash | "Mon–Sat", option "Title — £769,000", "still here — please", panel ranges | zero dashes in visible copy (empty table cells keep "—" per DESIGN.md) |
| Fake-person placeholders | booking form "Jane Le Brocq", "jane@example.je" | honest placeholders |
| Layout animation | `/properties` photo buttons animate `flex` on hover | animate transform/opacity only |

Kept on purpose (they carry meaning, not decoration): the status pill on photos (TO LET / FOR SALE, the
industry convention), uppercase spaced buttons and nav (the brand's one uppercase voice), Tenor + Montserrat,
the dark Team band (the page's single deliberate inversion), "—" for an empty cell in panel tables.

## Decisions for Luis (the plan uses the recommended option until he says otherwise)

1. **Titles case.** Recommended: section headings and listing titles in sentence case Tenor
   (`letter-spacing:.01em`); uppercase stays only in the logo, nav and buttons. Alternative: keep uppercase
   headings but smaller.
2. **Featured blocks while the site has 5 listings or fewer.** Recommended: hide them; the carousel is the
   showcase then, and they come back by themselves at 6+ listings (when the hero becomes the search form).
   Alternative: keep them but take starred listings out of "Latest properties".
3. **Carousel autoplay.** Recommended: no autoplay (a moving track fights the visitor's own swipe, and
   WCAG 2.2.2 then needs a Pause button). Alternative: autoplay every 7 s, stopped for good at the first touch.

## Global Constraints

- English UI copy (D19); this plan in English, Luis's summary in Spanish.
- DESIGN.md palette only (`tests/design.test.js` PALETTE); Tenor Sans display, Montserrat body; weights 400/500/600.
- Spacing in new CSS from 4, 8, 12, 16, 24, 32, 48, 64; breakpoints 480 / 760 / 980.
- Touch targets ≥ 44px on the site, ≥ 32px in the panel; visible `:focus-visible`; text ≥ 4.5:1.
- Every new transition/animation off under `prefers-reduced-motion: reduce`; animate transform/opacity only.
- No `style=` attributes in new markup, no inline handlers (future CSP); `esc()` on every interpolated value.
- No new dependency, font, cookie or `scroll` event listener.
- Routes, ids used by tests/analytics (`#portfolio`, `#team`, `#book`, `#book-slot`, `#hero-book` behaviour),
  page `<title>`s and the logo wordmark do not change (SEO and brand).
- After each task: `npm test`; before commit: `npm run build` and the e2e (header of `tests/e2e.cjs`), plus
  screenshots at 1280 and 390 of every screen the task touched, 0 console errors.

## Review Focus

1. **One listing published** (or 0): no arrows, no counter, no empty track; the hero still shows that home
   with both CTAs → e2e in Task 2 seeds down to one published listing.
2. **A two-finger swipe at the first or last slide** must not trigger the browser's back/forward page swipe
   on a Mac → `overscroll-behavior-x:contain` on the track (checked by computed style in Task 2); Luis
   confirms by hand on his MacBook (headless Chrome has no trackpad).
3. **Vertical scrolling over the hero on a phone** must still scroll the page, never lock it → the track
   only overflows on x; e2e in Task 2 wheels vertically over the hero and expects `scrollY > 0`.
4. **A listing with no photo or a broken image URL** in the carousel or the detail track keeps its height and
   shows the mist background, no layout jump → slide has `aspect`/`min-height` from CSS, not the image; e2e
   in Task 2 with a listing whose image 404s.
5. **Keyboard only:** Tab reaches the arrows, Left/Right with focus on the track moves one slide, the
   counter is announced (`aria-live="polite"`) → e2e in Task 2.

---

## Part A: public website (`site/`)

### Task 1: Anti-slop guards in the design test

**Files:**
- Modify: `tests/design.test.js`

**Interfaces:**
- Produces: three tests later tasks must keep green: `visible copy has no en or em dash`,
  `no decorative arrows in CSS content`, `home has at most two eyebrows`.

- [x] **Step 1: Write the failing tests**

```js
// Visible strings = template-literal and tag text, not comments. Strip // and /* */ comments first.
const code = src => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
test("visible copy has no en or em dash", () => {
  for (const f of ["site/index.html", "site/apply.js"]) assert.doesNotMatch(code(read(f)), /[–—]/, f);
});
test("no decorative arrows in CSS content", () => {
  assert.doesNotMatch(FILES.site, /content:\s*"[^"]*[→↗]/);
});
test("home has at most two eyebrows", () => {
  const home = read("site/index.html").match(/function home\(\)[\s\S]*?\n}\n/)[0];
  assert.ok((home.match(/class="eyebrow"/g) || []).length <= 2);
});
```

- [x] **Step 2: Run and see them fail**

Run: `node --test tests/design.test.js`
Expected: FAIL on the three new tests (dashes at `site/index.html:526,621,703`, arrow at `:372`, 7 eyebrows).

- [x] **Step 3: Commit only the tests together with Task 3.** Write this task right before Task 3, after Task 2
  is committed, so Task 2's `npm test` is not red because of tests it does not own.

### Task 2: Swipeable hero carousel

**Files:**
- Modify: `site/index.html` (hero CSS `:90-121`, `home()` hero markup `:657-665`, carousel JS `:749-776`)
- Test: `tests/e2e.cjs` (`publicSite`, lines `:45-100`, `:539`)

**Interfaces:**
- Consumes: `PUB`, `feat`, `slides`, `priceLabel`, `esc`, `isSold`, `.meta` (`site/index.html:153`).
- Produces: `.hero-track` > `.slide[data-id]` (one per listing in showcase mode), buttons
  `.hero-arrow[data-dir="-1|1"]`, counter `#hero-count`, `.slide [data-book]` buttons; site class `.sr`
  (visually hidden, same rule as `admin/src/styles.css:13`); helper `facts(p)` (array of fact strings: price,
  `N bedrooms`, `N bathrooms`, type only when `!/bed/i.test(type)`), reused by Tasks 3-5. Task 5 reuses
  `.hero-track`'s snap rules for the photo stage.

Decisions this task carries:
- Markup: `<section class="hero" aria-roledescription="carousel" aria-label="Featured properties">`, a hidden
  `<h1 class="sr">Homes for sale and to let in Jersey</h1>`, then `<div class="hero-track" tabindex="0">`
  with one `<article class="slide" role="group" aria-roledescription="slide" aria-label="N of M" data-id>` per
  listing: `<img>` (first `fetchpriority="high"`, others `loading="lazy"`, `alt=""` because the title is
  text), place line, `<h2>` title, facts as `<div class="meta">` spans, CTAs `Explore the property` (link) and
  `Book a viewing` (`button data-book="<id>"`).
- Facts: `facts(p)` rendered as `<div class="meta">` spans.
- Below the track: `<div class="hero-nav">` with `‹` / `›` buttons (`aria-label="Previous property"` /
  `"Next property"`, 44px, disabled at the ends, no wrap) and `<span id="hero-count" aria-live="polite">1 of 4</span>`.
  Arrows and counter are not rendered when there is one slide.
- CSS: track `display:grid; grid-auto-flow:column; grid-auto-columns:100%; overflow-x:auto;
  scroll-snap-type:x mandatory; overscroll-behavior-x:contain; scrollbar-width:none; scroll-behavior:smooth`
  (`auto` under reduced motion); `::-webkit-scrollbar{display:none}`; slide `scroll-snap-align:start;
  scroll-snap-stop:always; min-height:min(78vh,720px); background:var(--ink)`; img absolutely filling,
  `object-fit:cover`; the existing gradient moves from `.hero::before` to `.slide::before`.
- Headline: `clamp(28px,4vw,52px)`, sentence case (Decision 1), `max-width:20ch`, two lines at 1280 for the
  longest current title ("2 bedroom flat - Bottom of Wellington Road").
- JS: an IntersectionObserver on the slides (`root: track, threshold: .6`) sets `cur`, the counter and the
  arrows' `disabled`. Arrow click: `track.scrollTo({left: target.offsetLeft})`. Keydown on the track:
  ArrowLeft/ArrowRight move one slide, `preventDefault`. `#hero-book` behaviour moves to `[data-book]`:
  preselect that id in `#book-slot select[name=prop]` unless sold, scroll to `#book`, focus the select.
- Removed: `.hero-bg`, `.dots`, `.hero-pause`, `setInterval`, `heroTxt`, the `#hero-txt` animation
  (Decision 3).

- [x] **Step 1: Write the failing e2e assertions** (replace `:95-100` and adjust `:50`, `:539`)

```js
assert.equal(await page.$$eval(".hero .slide", s => s.length), 5, "one slide per published listing");
assert.equal(await page.textContent("#hero-count"), "1 of 5");
assert.ok(await page.$eval('.hero-arrow[data-dir="-1"]', b => b.disabled), "no previous on the first slide");
await page.click('.hero-arrow[data-dir="1"]');
await page.waitForFunction(() => document.querySelector("#hero-count").textContent === "2 of 5");
await page.$eval(".hero-track", t => { t.scrollLeft = t.clientWidth * 4; });            // a swipe to the end
await page.waitForFunction(() => document.querySelector("#hero-count").textContent === "5 of 5");
assert.ok(await page.$eval('.hero-arrow[data-dir="1"]', b => b.disabled), "no next on the last slide");
await page.focus(".hero-track"); await page.keyboard.press("ArrowLeft");
await page.waitForFunction(() => document.querySelector("#hero-count").textContent === "4 of 5");
assert.equal(await page.$eval(".hero-track", t => getComputedStyle(t).overscrollBehaviorX), "contain");
await page.waitForTimeout(8000);
assert.equal(await page.textContent("#hero-count"), "4 of 5", "no autoplay");
await page.mouse.move(400, 300); await page.mouse.wheel(0, 600);
await page.waitForFunction(() => scrollY > 0);                                             // page still scrolls
await page.click('.slide:first-child [data-book]');
assert.equal(await page.inputValue("#book-slot select[name=prop]"), "HE-R001", "slide booking preselects it");
```

Plus, in the phone context (390): `.slide` width equals `innerWidth` and
`document.documentElement.scrollWidth === innerWidth`. Plus the one-listing case: unpublish all but one
via `d1(...)`, reload, expect `.hero .slide` 1 and no `.hero-arrow`, then restore. Plus a listing whose
`image` points at a 404: its slide's height stays `>= 500` at 1280. `:50` becomes `.hero .slide:first-child h2`;
`:539` the same selector.

- [x] **Step 2: Run the e2e and see the new assertions fail** (reseed per the header of `tests/e2e.cjs`)

Run: `PW=/root/cotizador-video/node_modules/playwright-core CHROME=/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome node tests/e2e.cjs`
Expected: FAIL at "one slide per published listing".

- [x] **Step 3: Implement the markup, CSS and JS above in `site/index.html`**

- [x] **Step 4: Run e2e and `npm test`**

Expected: e2e PASS, `npm test` PASS. Screenshots `home-d`/`home-m` before and after go in the scratchpad.

- [x] **Step 5: Commit**

```bash
git add site/index.html tests/e2e.cjs
git commit -m "Make the home carousel swipeable with arrows and a counter"
```

### Task 3: Home sections

**Files:**
- Modify: `site/index.html` (`home()` `:641-708`, `card()` `:509-516`, footer `:458-469`, `.team`/`.facts` CSS)
- Test: `tests/design.test.js` (Task 1), `tests/e2e.cjs:52,507-528`

**Interfaces:**
- Consumes: `.meta`, `.slide`, `facts(p)` from Task 2.
- Produces: `.place` (place line, 13px stone, normal case) used by Tasks 4 and 5.

Changes, all in sentence case per Decision 1:
- "Latest properties": drop the "Properties" eyebrow; H2 alone. Grid at 4 listings: 2×2 at ≥ 760px
  (`repeat(2,1fr)` when the count is even and ≤ 4), so no orphan card.
- Cards: place line in normal case 13px stone (`.place`, not `.eyebrow`); meta from `facts()` without the
  price and without the operation word (the pill already says it).
- Featured blocks: hidden while `PUB.length <= FEW_MAX` (Decision 2); when shown, at most 2 in a row (the
  third starred listing joins the grid); place line instead of "Featured · …"; chips from real features only
  (3D tour, Aerial view, Floor plans, Mortgage calculator), "Book with an agent" removed.
- Team: drop the eyebrow; H2 "A family firm on Bath Street"; the four-cell `.facts` strip becomes one
  paragraph under the H2: "Established in St Helier in 1982. Free local and international valuations.
  Viewings Monday to Saturday, in person or by live video." (the `PUB.length >= 10` count cell is dropped).
- Booking: H2 "Book a viewing" with the existing hint paragraph, no eyebrow; the property `<option>` text is
  `Title, £769,000`; error text "… Your details are still here. Please try again."; placeholders: name none,
  email `name@example.com`, phone `07797 123456`.
- Footer: "Sales, lettings and free valuations." / "Family-run on Bath Street since 1982."; contact lines
  "Office 01534 727582" and "Mobile 07797 718199" on separate lines. The logo's "JERSEY · SINCE 1982" stays.
- e2e `:52` ("#portfolio .eyebrow") becomes `#portfolio h2` = "Latest properties"; `:507-528` Featured
  assertions run with the fixture's 5 listings, so they seed a sixth published listing first.

- [x] **Step 1: Update the e2e assertions above and add:** home has no `.facts`; no visible text node on the
  home contains "·" except inside `.logo` (`$$eval` over `#app` text).
- [x] **Step 2: Run `node --test tests/design.test.js` and the e2e; expect FAIL** (Task 1 tests + the new e2e lines).
- [x] **Step 3: Implement the changes above.**
- [x] **Step 4: Run `npm test` and the e2e; expect PASS.** Screenshots 1280/390 of the whole home.
- [x] **Step 5: Commit** `git commit -m "Quieter home sections: no stacked eyebrows, dotted facts or repeats"` (with Task 1's test file).

### Task 4: Properties page (`/properties`)

**Files:**
- Modify: `site/index.html` (`properties()` `:794-830`, `.catalog`/`.op-*` CSS `:362-380`)
- Test: `tests/e2e.cjs` (catalogue block)

Changes:
- Drop the "Properties" eyebrow; H1 "Find your home in Jersey" in sentence case, top padding from the
  section rhythm (no extra block above it).
- Photo buttons: sub-label sentence case 13px ("Homes to let"), the `::after " →"` removed; the hover
  grows the photo with `transform:scale(1.04)` only, the `flex:1.6` width animation removed (the pressed
  button keeps a 2px ink outline instead).
- Cards from Task 3 (`facts()`, `.place`); same 2×2 rule when the result count is 4 or fewer and even.

- [x] **Step 1: e2e:** after hovering a photo button, its `getBoundingClientRect().width` is unchanged;
  `.op-txt small` computed `content` of `::after` is `none`.
- [x] **Step 2: Run; expect FAIL.**  - [x] **Step 3: Implement.**
- [x] **Step 4: `npm test` + e2e PASS; screenshots 1280/390.**
- [x] **Step 5: Commit** `git commit -m "Calmer Properties page buttons and headings"`.

### Task 5: Listing page (`/p/<id>`) with a swipeable photo stage

**Files:**
- Modify: `site/index.html` (`detail()` `:845-1045`, `.stage`/`.thumbs`/`.specs`/`.keys` CSS `:320-345`)
- Test: `tests/e2e.cjs` (detail block, `:640-700`)

**Interfaces:**
- Consumes: Task 2's track CSS (copy the rule set under `.stage-track`; one shared selector list
  `.hero-track,.stage-track` for the snap rules), `facts()`.

Changes:
- Photo stage: the single `<img>` with `‹ ›` becomes a `.stage-track` of all photos (first eager, others
  lazy) with the same snap rules, so photos swipe on touch and trackpad; the `‹ ›` buttons stay for the mouse
  and scroll the track; thumbnails scroll the track to their photo; "Photo 3 of 17" follows the
  IntersectionObserver; clicking a photo still opens the lightbox at that index. Tabs (Photos / 3D tour /
  Aerial) unchanged.
- Summary: the eyebrow becomes one place line "For sale in St Saviour" (`${status} in ${place}`), H1 in
  sentence case; key figures labels "Bedrooms / Bathrooms / Type" 13px stone sentence case, not tiny caps;
  agent line keeps its single "·".
- "Listing details": drop rows already in the summary (Type, Operation, Price as listed); the rest as a
  two-column `<dl>` without a border on every row (one top border on the group).
- "Property details": group names (Accommodation, Outside, Services, Costs) 13px 600 ink sentence case,
  not bronze caps.
- Similar: drop the eyebrow, keep H2 "Around £769,000 in Jersey" and its explanatory line.
- Booking aside: H2 "Book a viewing", hint "Choose your agent, the type of viewing and a slot that suits
  you."; no eyebrow.
- Notes: "Drag to look around." and links "Open the tour in a new tab" without `↗` (the link already opens
  a tab; `rel` stays).

- [x] **Step 1: e2e:** on `/p/HE-R001` set `.stage-track.scrollLeft = clientWidth*2`, expect "Photo 3 of 17";
  click thumb 5, expect "Photo 5 of 17"; `.summary .eyebrow` absent and the place line reads
  "For sale in St Saviour"; the details `<dl>` has no "Operation" term. Update the `:654` assertion.
- [x] **Step 2: Run; expect FAIL.**  - [x] **Step 3: Implement.**
- [x] **Step 4: `npm test` + e2e PASS; screenshots 1280/390 incl. the lightbox.**
- [x] **Step 5: Commit** `git commit -m "Swipeable listing photos and a plainer listing page"`.

### Task 6: Register, Privacy, Not found, header

**Files:**
- Modify: `site/apply.js`, `site/index.html` (not-found `:845-850`, header `:456-460`)

Register was redone on 6-nov (b06a4b2, 42cd0af, caae3fd); this is only the check against the same rules:
no eyebrow, no "·", no dashes, sentence-case headings, honest placeholders (already true; confirm with a
grep and the screenshot script `shot.cjs`). Privacy: H1/H2 sentence case (shared rule from Decision 1).
Not found: keep "Property not found" and its two links. Header nav stays uppercase (brand voice).

- [x] **Step 1:** `node --test tests/design.test.js` stays green with `site/apply.js` included (Task 1).
- [x] **Step 2:** screenshots of every Register step, Privacy and Not found at 1280/390; fix anything off-rule.
- [x] **Step 3: Commit** only if something changed: `git commit -m "Same type rules on Register and Privacy"`.

---

## Part B: staff panel (`admin/src/`), Operate mode

The panel is a work tool: density, scanability and native patterns beat expression (DESIGN.md "Density Split
Rule"). The pass is lighter than the website's and has two shared rules:

- **R1 · Meta lines:** at most one "·" per line. A line joining three or more facts with "·" becomes a
  `<span className="meta">` row (new class: `display:flex;flex-wrap:wrap;gap:4px 12px`, stone, 12px) with
  one `<span>` per fact. Error lines "message · link" become "message" + the link on its own.
- **R2 · Labels:** table headers, `dt` and day heads drop uppercase tracking: 12px, weight 600, stone,
  sentence case (`styles.css:48,81,232,252,291,409,425`). Ranges use a hyphen ("10:00-10:30", "rows 1-500").
  "—" stays for an empty cell only.

Each Part B task: (1) add the e2e or design-test assertion named in the task; (2) run, see it fail;
(3) apply R1/R2 and the listed fixes; (4) `npm test`, `npm run build`, e2e, screenshots 1280/390 of each
screen in the task; (5) commit. The shared CSS (`.meta`, R2 rules) lands in Task 7.

### Task 7: Shell, Login and shared CSS
- Files: `admin/src/App.jsx:127`, `admin/src/Login.jsx`, `admin/src/styles.css`.
- Brand "Hampton Estates · Admin" becomes "Hampton Estates" with a separate muted "Staff" word; Login's arrow
  glyph removed; `.meta` class and R2 label rules added.
- Test: `tests/design.test.js` new test `panel labels are not tracked uppercase` (no `text-transform:uppercase`
  in `styles.css` except `.btn`, `.bar .brand` removed too).

### Task 8: Inbox
- Files: `Inbox.jsx:84` (category · ago: one dot, keep), `HermesDraft.jsx`.
- Check only; screenshot with one item of each category from the seed.

### Task 9: Applicants, applicant page, new applicant, Review queue
- Files: `Applicants.jsx:18,86`, `ApplicantDetail.jsx:106,286,377,380,452,463,478-485`, `ApplicantFields.jsx`,
  `NewApplicant.jsx:44`, `MatchCard.jsx:44,50,52,62`, `Review.jsx:68,123,127-128,156`.
- R1 on the header meta (`Operation · Source · Applied`), timeline lines and viewing lines; Review's
  shortcut help becomes a `<dl>` of `<kbd>` → action, the "1–5" range "1-5"; `→` in the timeline diff
  stays (it means "changed to", with the `sr` text).
- Test: e2e asserts the applicant header meta renders three `.meta > span`.

### Task 10: Listings, editor, new property, media, Properties Queue
- Files: `Listings.jsx:104,116,120`, `ListingEditor.jsx:75,169-177,259,317`, `NewProperty.jsx:10,117,122`,
  `MediaManager.jsx:52,74,77,96`, `Queue.jsx:156,159`.
- R1 on the row meta (`id · operation · beds`); "View on the website ↗" becomes "View on the website"
  (still a new tab); the ★/☆ Featured toggle (`Listings.jsx:102`) stays: it is the control, with its
  `aria-label`; "PDF · open" becomes "Open PDF"; "Private · reference" becomes "Private reference".

### Task 11: Viewings, interest, slot picker, availability, 3D tours
- Files: `Viewings.jsx:165,236,243,251,353`, `Interest.jsx:10-12,63,82,132`, `SlotPicker.jsx:54`,
  `Availability.jsx:8-9,217`, `Tours.jsx`.
- R1 and the hyphen ranges ("Open 09:00-17:00", "10:00-10:30").

### Task 12: Sales and sale page
- Files: `Sales.jsx:217-218,229,281`, `SaleDetail.jsx:40,84-85,91,103`.
- R1 on the sale header and the offer lines; "Overdue · planned" becomes "Overdue, planned 12 Nov".

### Task 13: Rentals, rental page, dialogs, rent import, statement
- Files: `Rentals.jsx` (12 dots: `:83,89,116,186,229,230,241,396,412,422`), `RentalDetail.jsx:54,101,123,139,168,183,225`,
  `RentalDialogs.jsx:69,225,292`, `RentImport.jsx:58,82`, `Statement.jsx:48-49`.
- R1 everywhere; the printed Statement keeps a plain header ("Statement for October 2026", "Hampton Estates"
  on its own line).

### Task 14: Insights, research, owner report
- Files: `Insights.jsx:79-80,123`, `Research.jsx:20`, `OwnerReport.jsx:77,143,178` and its `.eyebrow`
  (`styles.css:405`).
- R1; Insights' demand list becomes a small table (parish, operation, bedrooms, median budget) instead of a
  dotted sentence; the owner report drops its eyebrow (the report title is enough) and keeps print layout.

### Task 15: Users and automations
- Files: `Users.jsx:32`, `Automations.jsx:47,50`.
- Check and R1 only.

### Task 16: Close
- `docs/roadmap/ESTADO.md` and the checklist (`docs/roadmap/checklist-hampton-app.html`) updated in the
  last commit; DESIGN.md "Typography" and "Do's and Don'ts" updated with Decision 1, R1 and R2; the
  independent review (errors, accessibility, design vs DESIGN.md, code-of-more) before the push; push to
  `main` only when Luis says so; republish the private checklist copy.

---

## Execution order and size

Task 2 first (what Luis asked for by name, shippable alone), then 1+3, 4, 5, 6 (website), then 7-15
(panel, each one independent after 7), then 16. The website half is the visible win; the panel half can ship
in any later session.

# PUB-22 · Public website: a Properties page of its own, and 5 newest on the home page

Brainstormed with Luis on 6-nov-2026. Status: design, waiting for Luis's approval (open questions answered 6-nov). Build when he says so.

## Why
On www.hamptonestatesjersey.com the **Properties** button in the menu only scrolls the home page down
to the Portfolio section, so the home page doubles as the catalogue. Luis wants the home page to stay
a landing page and the catalogue to live on its own page, with a clear first choice between renting,
buying and businesses, done in a way that feels like a premium agency.

## What Luis decided
1. **A separate page `/properties`** that holds only properties (no landing-page sections). The menu's
   **Properties** button opens it. The old Wix URL `/properties` (today a 301 to `/#portfolio`) opens it too.
2. **Three big photo buttons at the top: Rent, Buy, Businesses** (mockup option A, chosen by Luis):
   each button is a large photo with the word on it; on hover the photo zooms in slowly and the button
   widens while the others narrow. Must feel very professional.
3. **The catalogue starts mixed**: when the page opens it shows every property (sales, rentals and
   businesses together). The buttons narrow it to one operation.
4. **Each property opens its existing detail page** `/p/<id>` (unchanged).
5. **Home page: the Portfolio section is renamed Properties** and shows **at most 5 properties: the 5
   most recently published, automatically**, plus a **View all** button to `/properties`.
   Luis chose automatic over the panel's manual order.

## My calls (Luis can correct them)
- Rent / Buy / Businesses filter the catalogue **in place**, with no reload. The chosen button stays marked,
  a «Show all» control brings back the mixed list, and the URL changes (`/properties?op=rent`, `…=sale`,
  `…=business`) so a link can be shared; opening such a link starts on that choice. Back/forward work.
- Mapping: Rent = `operation = rent`, Buy = `sale`, Businesses = `business` (residential or commercial use).
- Cards reuse the site's current listing cards (photo, For sale / To let / Business, title, price with
  pcm for rentals, bedrooms, parish). Under offer / Sold / Let agreed stay in the catalogue with their label,
  as the site does today.
- Catalogue order: most recently published first (same rule as the home page's 5).
- **Filters follow the site's existing "few / full" switch** (Luis, 6-nov: they move to `/properties`).
  Today `FEW_MAX = 5` in `site/index.html`: with 5 or fewer published listings the home page is a
  showcase; with 6 or more it gets a quick-search hero (Location, Looking for, Bedrooms, Max price) and
  Portfolio gets Location / Operation tabs and the bedrooms + price line. From now on:
  - the home page always keeps its 5 newest and View all; in full mode its quick-search form
    **submits to `/properties`** with the choices in the URL (`?op=…&region=…&beds=…&max=…`);
  - `/properties` shows the Location tabs and the bedrooms + price line in full mode (6+ listings),
    reusing today's code; the three big buttons replace the Operation tabs. With 5 or fewer, only the buttons.
- **Publish date**: listings have no published date today (only `created_at`, `updated_at`). Migration
  0021 adds `listings.published_at`, set each time a listing goes from hidden to published (unpublish
  keeps it; republishing sets it again). Backfill for listings published now: `updated_at`.
  "Most recently published" orders by it.
- **The panel's drag-to-order (`home_order`) is removed**: nothing uses that order any more
  (Listings › Published loses the ⠿ handle and ↑ ↓ buttons). The ★ Featured star and the Featured
  sections of the home page, and the hero carousel, stay as they are. The `home_order` column stays in the
  database (no destructive migration); a later cleanup can drop it.
- **Button photos** (Luis, 6-nov): each button shows the cover photo of the newest published listing of
  that operation, changing on its own. While an operation has none (today: rentals and businesses), my
  call: the site's own `og-image.jpg`, darkened like the others.
- **No counts on the buttons** (Luis, 6-nov): just the word and «Homes to let», «Homes for sale»,
  «Businesses for sale».
- **Hero carousel and lead listing** (today ordered by `home_order`): newest published first, the
  same order as the 5 cards. The Featured sections keep the ★ order.
- **Home page's 5**: the 5 newest published that are still on the market (For sale, To let, Under offer,
  Lease); Sold and Let agreed stay on `/properties` with their label but don't take a home slot.
- **Old URLs and in-page links follow the new page**: `/properties` and `/residential-properties` →
  `/properties`, `/commercial-properties` → `/properties?op=business` (301, already indexed);
  the not-found page's «See our properties» and the listing breadcrumb's region link → `/properties`.
- Empty state on `/properties` for an operation with nothing published: a short line and the
  «Register your search» button (`#/apply`), which already exists.
- Mobile (390 px): the three photo buttons stack as three wide bands (about 140 px tall each);
  hover effects become a press state; no horizontal scroll.

## Constraints
- Same stack as the site today: `site/index.html` (vanilla JS, pushState routing) on Cloudflare Pages,
  public data from `/api/listings`. `/properties` must be a real path (Pages serves `index.html`, and the
  router knows the route), included in `sitemap.xml`, with its own `<title>` and description.
- DESIGN.md tokens only: ink #151515, paper, mist #f4f3f0, line, stone, bronze #a56b3d;
  Tenor Sans for display words, Montserrat for body; radius 24px (site-r-lg) for the big buttons.
- Accessibility: the buttons are real buttons (or links) with `aria-pressed`, visible focus, 44 px minimum
  targets, text over photos with enough contrast (dark gradient), and `prefers-reduced-motion` turns off
  the zoom and the width change.
- Performance: button photos lazy-sized (`?thumb` or a mid-size variant), no new libraries, no layout shift.
- Privacy and security: public data only, same as `/api/listings` today; no new cookies (PRE-11).
- The public API and listing detail pages keep working for links already shared.

## Not in scope
Search filters by parish, bedrooms or price on the public site; changes to the listing detail page;
the market search by Hermes.

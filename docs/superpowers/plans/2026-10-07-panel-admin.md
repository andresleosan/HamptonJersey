# Panel administrativo y catálogo real — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el demo por el catálogo real de Hampton Estates (D1 + R2), con un panel `/admin` (React, login Google vía Firebase) para gestionar fichas, fotos, solicitudes de visita y usuarios.

**Architecture:** Un solo proyecto Cloudflare Pages (`hamptonjersey`, deploy automático desde `main`). La web pública sigue siendo `site/index.html` (vanilla) y lee `/api/listings`. La API vive en Pages Functions (`functions/`), que delegan en módulos ESM de `server/` (testeables con `node --test` contra un D1 simulado con `node:sqlite`). El panel React+Vite se compila a `site/admin/` en el build de Pages.

**Tech Stack:** Cloudflare Pages Functions, D1, R2, Turnstile · `jose` (JWT de Firebase) · React 19 + Vite + Firebase Auth (solo cliente) · Node 24 (`node:test`, `node:sqlite`) · Python 3 + PIL (importación) · Playwright-core (e2e).

**Spec:** `docs/superpowers/specs/2026-10-07-panel-admin-design.md`

## Global Constraints

- Proyecto Firebase: `hamptonestatesjersey`. App web registrada: `1:760161138036:web:f94005452426188f946821`.
- Proyecto Pages: `hamptonjersey` (repo `HamptonJersey`, rama `main`). **No tocar** el proyecto Pages `hamptonestatesjersey`.
- D1: base `hampton`, binding `DB`. R2: bucket `hampton-media`, binding `MEDIA`.
- Primeros admins: `luismadef45@gmail.com`, `andres.san1404@gmail.com`.
- Precios: `sale_price`, `rent` (+ `rent_period`), `premium` en columnas separadas; desconocido = `NULL`, **nunca 0**.
- Las fotos externas (`origin = 'external'`) **nunca** son públicas; lo garantiza un CHECK en D1 además del código.
- Las fichas importadas quedan publicadas solo si son del "Current requested catalogue" y su disponibilidad es For sale / To let / Lease / Under offer. HE-X001–003 entran archivadas.
- Borrar = archivar. El borrado definitivo solo es posible desde Archivadas y escribiendo la referencia.
- Sesión: cookie `__Host-hs` (HMAC-SHA256, `SESSION_SECRET` ≥ 32 caracteres, 8 h, HttpOnly, Secure, SameSite=Strict). En cada petición se vuelve a comprobar que el email siga en `admins`.
- Toda petición que no sea GET exige que `Origin` coincida con el propio origen.
- Textos: la web pública en inglés; el panel y los errores de la API de admin en español.
- JavaScript ESM sin TypeScript. No se añade ninguna dependencia fuera de las listadas en la Tarea 1.
- Deploy a producción = push a `main`, **solo con confirmación explícita de Luis**.
- Repo actual en `main` sin ramas (lo pidió Luis para sus proyectos); se hace commit por tarea y no se hace push hasta la Tarea 14.

## Review Focus

1. **Ficha publicada sin foto pública:** desaparece de la web en silencio. El editor debe avisarlo; lo comprueba el e2e (Tarea 13).
2. **Sesión caducada a mitad de una edición:** al guardar, debe aparecer el login en un diálogo y conservar lo escrito. Lo comprueba el e2e borrando la cookie (Tarea 13).
3. **Dos admins editando la misma ficha:** el segundo recibe 409 y no pisa al primero. Test en la Tarea 6.
4. **Importación re-ejecutada después de editar en el panel:** no debe pisar las ediciones (listings/media con `ON CONFLICT DO NOTHING`). Test en la Tarea 4.
5. **Solicitud de visita con datos inválidos o Turnstile caducado:** error legible, el formulario conserva los datos y el widget se reinicia. Tests de API en la Tarea 5 y e2e en la Tarea 13.

---

## Estructura de archivos

```
package.json                    deps + scripts (build/test/dev)
wrangler.toml                   Pages: output dir, D1, R2, vars
.node-version  .gitignore  .dev.vars.example
migrations/0001_init.sql        esquema D1 + admins iniciales
server/package.json             {"type":"module"}
server/http.js                  json(), HttpError, fail(), readJson(), now()
server/visibility.js            isPublicMedia(): la única regla de visibilidad
server/listing.js               validateListing(), toPublic(), regionOf(), idPrefix(), nextId()
server/auth.js                  verifyFirebaseToken(), sesión firmada, currentAdmin(), sameOrigin()
server/turnstile.js             verifyTurnstile()
server/viewings.js              validateViewing()
server/media.js                 serveMedia(): GET /media/:id
server/api.js                   router + manejo de errores
server/routes/public.js         /listings, /config, /viewings
server/routes/session.js        /session, /me
server/routes/listings.js       /admin/listings…
server/routes/media.js          /admin/listings/:id/media, /admin/media/:id
server/routes/inbox.js          /admin/viewings…
server/routes/users.js          /admin/users…
functions/api/[[path]].js       → handleApi
functions/media/[id].js         → serveMedia
scripts/import_hampton.py       SQLite de investigación → import.sql + miniaturas + upload.tsv
scripts/upload_r2.sh            sube upload.tsv a R2 (--local/--remote)
admin/                          panel React (vite.config.mjs, index.html, src/*)
site/index.html, site/lib.js    web pública (cambia la fuente de datos, se quita lo inventado)
site/_headers                   cabeceras de seguridad estáticas
tests/server/*.test.mjs         API y lógica (node --test)
tests/server/helpers.mjs        D1 simulado (node:sqlite), R2 simulado, llamadas a la API
tests/lib.test.js               lógica pública (fixtures en línea)
tests/test_import.py            importación (unittest)
tests/fixtures/seed.sql, photo.jpg   datos para el e2e
tests/e2e.cjs                   e2e con wrangler pages dev
```

Se borran: `scrape.py`, `site/data/properties.json` y `site/img/aerial-demo.jpg`.

---

### Tarea 1: Base del proyecto, esquema D1 y recursos de Cloudflare

**Files:**
- Create: `package.json`, `wrangler.toml`, `.node-version`, `.dev.vars.example`, `migrations/0001_init.sql`, `server/package.json`, `tests/server/helpers.mjs`, `tests/server/schema.test.mjs`
- Modify: `.gitignore` (crear si no existe)

**Interfaces:**
- Produces:
  - Tablas `listings`, `media`, `viewing_requests`, `admins` y `research_properties`, `research_sources`, `research_facts`, `research_financial_terms`, `research_issues`, `research_search_log`.
  - `helpers.mjs` exporta:
    - Infraestructura simulada: `makeDb()`, `makeBucket()`, `makeEnv()`.
    - Llamadas y sesión: `call(env, method, path, opts)`, `adminCookie(email?)`, `SECRET`, `ORIGIN`.
    - Datos de prueba: `seedListing(env, over)`, `seedMedia(env, over)`.
  - `call` y `adminCookie` dependen de las Tareas 3 y 5. Se añaden en el paso 7 de la Tarea 5; aquí solo se crean `makeDb`, `makeBucket`, `makeEnv`, `seedListing` y `seedMedia`.

- [ ] **Step 1: Crear los recursos remotos (D1 y R2)**

📍 VPS, `/root/HamptonJersey`:
```bash
npx wrangler d1 create hampton
npx wrangler r2 bucket create hampton-media
```
Esperado: el primer comando imprime un bloque con `database_id = "<uuid>"` y el segundo `Created bucket 'hampton-media'`. Copia el uuid para el paso siguiente.

- [ ] **Step 2: Escribir `wrangler.toml`** (sustituye `<DATABASE_ID>` por el uuid del paso 1)

```toml
name = "hamptonjersey"
pages_build_output_dir = "site"
compatibility_date = "2025-10-01"

[vars]
FIREBASE_PROJECT_ID = "hamptonestatesjersey"
# Clave de prueba de Turnstile; la Tarea 14 la sustituye por la real antes del deploy.
TURNSTILE_SITE_KEY = "1x00000000000000000000AA"

[[d1_databases]]
binding = "DB"
database_name = "hampton"
database_id = "<DATABASE_ID>"
migrations_dir = "migrations"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "hampton-media"
```

- [ ] **Step 3: `package.json`, `.node-version`, `.gitignore`, `.dev.vars.example`, `server/package.json`**

`package.json`:
```json
{
  "name": "hampton-jersey",
  "private": true,
  "scripts": {
    "build": "vite build --config admin/vite.config.mjs",
    "build:watch": "vite build --config admin/vite.config.mjs --watch",
    "dev": "wrangler pages dev --port 8788",
    "test": "node --test tests/*.test.js tests/server/*.test.mjs && python3 -m unittest tests/test_import.py"
  }
}
```

📍 VPS, `/root/HamptonJersey`:
```bash
npm i jose react react-dom firebase
npm i -D vite @vitejs/plugin-react wrangler
```
Esperado: se crean `package-lock.json` y `node_modules/`, sin errores.

`.node-version`:
```
22
```

`.gitignore`:
```
node_modules/
site/admin/
build/
.wrangler/
.dev.vars
test-results/
__pycache__/
```

`.dev.vars.example`:
```
SESSION_SECRET=dev-only-secret-change-me-0123456789abcdef
TURNSTILE_SECRET=1x0000000000000000000000000000000AA
TURNSTILE_SITE_KEY=1x00000000000000000000AA
```
Después: `cp .dev.vars.example .dev.vars`.

`server/package.json`:
```json
{ "type": "module" }
```

- [ ] **Step 4: Escribir `migrations/0001_init.sql`**

```sql
CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  use TEXT NOT NULL CHECK (use IN ('residential','commercial')),
  title TEXT NOT NULL,
  property_type TEXT,
  operation TEXT NOT NULL CHECK (operation IN ('sale','rent','business')),
  availability TEXT NOT NULL CHECK (availability IN ('for_sale','under_offer','sold','to_let','lease','not_stated','withdrawn')),
  country TEXT, location TEXT, road_name TEXT,
  bedrooms INTEGER CHECK (bedrooms IS NULL OR bedrooms >= 0),
  bathrooms INTEGER CHECK (bathrooms IS NULL OR bathrooms >= 0),
  tenure TEXT,
  sale_price REAL CHECK (sale_price IS NULL OR sale_price > 0),
  rent REAL CHECK (rent IS NULL OR rent > 0),
  rent_period TEXT CHECK (rent_period IS NULL OR rent_period IN ('month','year')),
  premium REAL CHECK (premium IS NULL OR premium > 0),
  currency TEXT CHECK (currency IS NULL OR currency IN ('GBP','EUR')),
  price_text TEXT, summary TEXT, description TEXT, tour_url TEXT,
  specs TEXT NOT NULL DEFAULT '[]',
  cover_media_id TEXT,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  archived_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  r2_key TEXT, thumb_key TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('hampton','external','upload')),
  kind TEXT NOT NULL CHECK (kind IN ('photo','floorplan','aerial','document')),
  label TEXT,
  public INTEGER NOT NULL DEFAULT 0 CHECK (public IN (0,1)),
  position INTEGER NOT NULL DEFAULT 0,
  content_type TEXT, width INTEGER, height INTEGER, bytes INTEGER,
  source_url TEXT, provider TEXT, rights_status TEXT,
  created_at TEXT NOT NULL, created_by TEXT,
  CHECK (origin <> 'external' OR public = 0)
);
CREATE INDEX media_listing ON media(listing_id, position);

CREATE TABLE viewing_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  agent TEXT, kind TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  created_at TEXT NOT NULL, updated_at TEXT, updated_by TEXT
);
CREATE INDEX viewing_status ON viewing_requests(status, created_at);

CREATE TABLE admins (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  added_by TEXT, added_at TEXT NOT NULL
);
INSERT INTO admins (email, added_by, added_at) VALUES
  ('luismadef45@gmail.com', 'setup', '2026-10-07T00:00:00.000Z'),
  ('andres.san1404@gmail.com', 'setup', '2026-10-07T00:00:00.000Z');

-- Investigación: copia literal de /root/Hampton_Database/hampton_properties.sqlite, solo lectura.
CREATE TABLE research_properties (
  property_id TEXT PRIMARY KEY, hampton_record_id TEXT, name TEXT, matched_name TEXT, collection TEXT,
  catalogue_scope TEXT, country TEXT, location TEXT, road_name TEXT, property_type TEXT, raw_status TEXT,
  availability TEXT, asking_text TEXT, asking_amount REAL, currency TEXT, price_basis TEXT, bedrooms REAL,
  bathrooms REAL, hampton_source_url TEXT, hampton_summary TEXT, hampton_description TEXT,
  source_updated_date TEXT, raw_numeric_price REAL, match_status TEXT, match_confidence TEXT,
  match_reason TEXT, external_source_count REAL, missing_information TEXT, next_action TEXT,
  research_date TEXT, page_fetch_error TEXT, duplicate_group TEXT, hampton_asset_count REAL,
  external_asset_count REAL, floorplan_reference_count REAL, issue_count REAL,
  advertising_evidence_class TEXT, independent_advertising_match TEXT, evidence_basis TEXT
);
CREATE TABLE research_sources (
  source_id TEXT PRIMARY KEY, property_id TEXT, origin TEXT, title TEXT, url TEXT, accessed_on TEXT,
  source_type TEXT, access_level TEXT, observed_status TEXT, price_text TEXT, source_date TEXT,
  summary TEXT, match_relevance TEXT, agent_or_site TEXT
);
CREATE INDEX research_sources_property ON research_sources(property_id);
CREATE TABLE research_facts (
  fact_id TEXT PRIMARY KEY, property_id TEXT, source_id TEXT, origin TEXT, field TEXT, value TEXT,
  confidence TEXT, context TEXT
);
CREATE INDEX research_facts_property ON research_facts(property_id);
CREATE TABLE research_financial_terms (
  term_id TEXT PRIMARY KEY, property_id TEXT, source_id TEXT, term_type TEXT, amount REAL, currency TEXT,
  period TEXT, qualifier TEXT, notes TEXT, source_url TEXT
);
CREATE INDEX research_terms_property ON research_financial_terms(property_id);
CREATE TABLE research_issues (
  issue_id TEXT PRIMARY KEY, property_ids TEXT, field TEXT, severity TEXT, issue TEXT, evidence TEXT,
  source_urls TEXT, proposed_action TEXT, confidence TEXT
);
CREATE TABLE research_search_log (
  search_id TEXT PRIMARY KEY, property_id TEXT, date TEXT, query TEXT, engine TEXT, outcome TEXT
);
CREATE INDEX research_search_property ON research_search_log(property_id);
```

- [ ] **Step 5: Escribir `tests/server/helpers.mjs`** (versión inicial)

```js
// Test doubles for Cloudflare bindings: D1 on node:sqlite, R2 on a Map.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

const MIG = new URL("../../migrations/", import.meta.url);
export const T0 = "2026-10-07T10:00:00.000Z";

export function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const f of readdirSync(MIG).filter(f => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, MIG), "utf8"));
  const stmt = (sql, args = []) => ({
    sql,
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args), meta: {} }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return {
    raw: db,
    prepare: sql => stmt(sql),
    async batch(stmts) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(/^\s*(SELECT|WITH)/i.test(s.sql) ? await s.all() : await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

export function makeBucket() {
  const store = new Map();
  return {
    store,
    async put(key, body, opts) { store.set(key, { body, type: opts?.httpMetadata?.contentType }); },
    async get(key) {
      const o = store.get(key);
      return o && { body: o.body, httpEtag: '"test"', writeHttpMetadata: h => o.type && h.set("content-type", o.type) };
    },
    async delete(keys) { for (const k of [].concat(keys)) store.delete(k); },
  };
}

export const SECRET = "test-secret-test-secret-test-secret-0123";
export const makeEnv = () => ({
  DB: makeDb(), MEDIA: makeBucket(), SESSION_SECRET: SECRET,
  TURNSTILE_SECRET: "turnstile-test", TURNSTILE_SITE_KEY: "site-key", FIREBASE_PROJECT_ID: "hamptonestatesjersey",
});

const insert = (env, table, row) => {
  const cols = Object.keys(row);
  env.DB.raw.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .run(...cols.map(c => row[c]));
  return row;
};
export const seedListing = (env, over = {}) => insert(env, "listings", {
  id: "HE-R001", use: "residential", title: "Le Bernage", operation: "sale", availability: "for_sale",
  country: "Jersey", location: "St Saviour", sale_price: 779000, currency: "GBP", bedrooms: 3,
  published: 1, specs: "[]", created_at: T0, updated_at: T0, updated_by: "import", ...over,
});
export const seedMedia = (env, over = {}) => insert(env, "media", {
  id: "A00001", listing_id: "HE-R001", r2_key: "media/hampton/a.jpg", thumb_key: "thumbs/hampton/a.jpg",
  origin: "hampton", kind: "photo", label: "Kitchen.png", public: 1, position: 0, content_type: "image/jpeg",
  created_at: T0, ...over,
});
```

- [ ] **Step 6: Escribir el test del esquema `tests/server/schema.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia } from "./helpers.mjs";

test("initial admins are seeded", async () => {
  const env = makeEnv();
  const { results } = await env.DB.prepare("SELECT email FROM admins ORDER BY email").all();
  assert.deepEqual(results.map(r => r.email), ["andres.san1404@gmail.com", "luismadef45@gmail.com"]);
});

test("the database itself refuses public external media and zero prices", () => {
  const env = makeEnv();
  seedListing(env);
  assert.throws(() => seedMedia(env, { id: "A9", origin: "external", public: 1 }), /CHECK/);
  assert.throws(() => seedListing(env, { id: "HE-R002", sale_price: 0 }), /CHECK/);
});
```

- [ ] **Step 7: Ejecutar los tests**

Run: `node --test tests/server/schema.test.mjs`
Esperado: `# pass 2`, `# fail 0` (puede salir un `ExperimentalWarning` de SQLite; es normal).

- [ ] **Step 8: Aplicar la migración en el D1 local**

📍 VPS, `/root/HamptonJersey`:
```bash
npx wrangler d1 migrations apply hampton --local
```
Esperado: `✅ 0001_init.sql` aplicada.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json wrangler.toml .node-version .gitignore .dev.vars.example migrations server/package.json tests/server
git commit -m "Add Pages Functions scaffold and D1 schema"
```

---

### Tarea 2: Lógica de fichas y visibilidad

**Files:**
- Create: `server/http.js`, `server/visibility.js`, `server/listing.js`, `tests/server/listing.test.mjs`

**Interfaces:**
- Produces:
  - `http.js`:
    - `json(data, status = 200, headers = {}) → Response`
    - `class HttpError(status, message)`
    - `fail(status, message)` (lanza `HttpError`)
    - `readJson(request) → Promise<object>` (400 si el cuerpo no es JSON)
    - `now() → ISO string`
  - `visibility.js`: `isPublicMedia(media, listing) → boolean`
  - `listing.js`:
    - `EDITABLE: string[]`, `ENUMS`
    - `validateListing(input, {partial}) → {value} | {errors}`
    - `regionOf(country)`, `idPrefix(use, country)`, `nextId(ids, prefix)`
    - `toPublic(listingRow, mediaRows) → objeto público`

- [ ] **Step 1: Escribir los tests que fallan `tests/server/listing.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { validateListing, toPublic, nextId, idPrefix, regionOf } from "../../server/listing.js";
import { isPublicMedia } from "../../server/visibility.js";

const L = { id: "HE-R001", title: "Le Bernage", use: "residential", operation: "sale", availability: "for_sale",
  country: "Jersey", location: "St Saviour", sale_price: 779000, rent: null, rent_period: null, premium: null,
  currency: "GBP", price_text: "£779,000", bedrooms: 3, bathrooms: 1, property_type: "House", tenure: null,
  summary: "Semi-detached\n\nGarage ", description: "Line one\nLine two", tour_url: null, specs: "[]",
  cover_media_id: "A2", published: 1, archived_at: null };
const M = (o) => ({ id: "A1", origin: "hampton", kind: "photo", public: 1, r2_key: "k", label: "Kitchen.png", ...o });

test("create needs title, use, operation and availability", () => {
  assert.deepEqual(Object.keys(validateListing({}).errors).sort(), ["availability", "operation", "title", "use"]);
  assert.ok(validateListing({ title: "X", use: "commercial", operation: "business", availability: "for_sale" }).value);
});

test("partial update only touches the fields sent and ignores locked ones", () => {
  const r = validateListing({ title: " New ", published: 1, id: "HE-R999" }, { partial: true });
  assert.deepEqual(r.value, { title: "New" });
  assert.equal(validateListing({ title: "" }, { partial: true }).errors.title, "Obligatorio");
});

test("prices: positive or null, never zero; integers for rooms", () => {
  assert.match(validateListing({ sale_price: 0 }, { partial: true }).errors.sale_price, /mayor que 0/);
  assert.equal(validateListing({ sale_price: "" }, { partial: true }).value.sale_price, null);
  assert.ok(validateListing({ bedrooms: 2.5 }, { partial: true }).errors.bedrooms);
  assert.ok(validateListing({ currency: "USD" }, { partial: true }).errors.currency);
});

test("tour must be https and specs need label and value", () => {
  assert.ok(validateListing({ tour_url: "javascript:alert(1)" }, { partial: true }).errors.tour_url);
  assert.equal(validateListing({ tour_url: "https://my.matterport.com/show/?m=x" }, { partial: true }).value.tour_url,
    "https://my.matterport.com/show/?m=x");
  assert.ok(validateListing({ specs: [{ group: "Interior", label: "Heating", value: "" }] }, { partial: true }).errors.specs);
  assert.equal(validateListing({ specs: [{ group: "Interior", label: "Heating", value: "Oil" }] }, { partial: true }).value.specs,
    '[{"group":"Interior","label":"Heating","value":"Oil"}]');
});

test("non-object bodies are treated as empty", () => {
  assert.ok(validateListing(null).errors.title);
  assert.ok(validateListing([1, 2]).errors.title);
});

test("ids: next free number per prefix", () => {
  assert.equal(nextId(["HE-R001", "HE-R026", "HE-C017", "HE-I001"], "HE-R"), "HE-R027");
  assert.equal(nextId([], "HE-C"), "HE-C001");
  assert.equal(idPrefix("commercial", "Jersey"), "HE-C");
  assert.equal(idPrefix("residential", "Portugal"), "HE-I");
  assert.deepEqual(["Jersey", "United Kingdom", "France"].map(regionOf), ["jersey", "uk", "international"]);
});

test("external media are never public, whatever their flag says", () => {
  assert.equal(isPublicMedia(M({ origin: "external", public: 1 }), L), false);
  assert.equal(isPublicMedia(M({}), { ...L, published: 0 }), false);
  assert.equal(isPublicMedia(M({}), { ...L, archived_at: "2026-10-07" }), false);
  assert.equal(isPublicMedia(M({ r2_key: null }), L), false);
  assert.equal(isPublicMedia(M({ origin: "upload" }), L), true);
});

test("toPublic keeps the shape index.html expects", () => {
  const media = [M({ id: "A1" }), M({ id: "A2", label: null }), M({ id: "A3", origin: "external", public: 0 }),
    M({ id: "A4", kind: "floorplan", label: "Ground floor" }), M({ id: "A5", kind: "aerial" })];
  const p = toPublic(L, media);
  assert.equal(p.status, "For Sale");
  assert.equal(p.region, "jersey");
  assert.equal(p.salePrice, 779000);
  assert.equal(p.image, "/media/A2");          // cover_media_id wins
  assert.equal(p.thumb, "/media/A2?thumb");
  assert.deepEqual(p.photos.map(x => x.src), ["/media/A1", "/media/A2"]);
  assert.equal(p.photos[0].alt, "Kitchen");    // extension stripped
  assert.equal(p.photos[1].alt, "Le Bernage");
  assert.deepEqual(p.floorplans, [{ src: "/media/A4", alt: "Ground floor" }]);
  assert.equal(p.aerial.src, "/media/A5");
  assert.deepEqual(p.summary, ["Semi-detached", "Garage"]);
  assert.deepEqual(p.description, ["Line one", "Line two"]);
  assert.deepEqual(p.specs, []);
  assert.ok(!JSON.stringify(p).includes("A3"));
});
```

- [ ] **Step 2: Ejecutarlos y comprobar que fallan**

Run: `node --test tests/server/listing.test.mjs`
Esperado: FAIL con `Cannot find module '.../server/listing.js'`.

- [ ] **Step 3: Escribir `server/http.js`**

```js
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

export async function readJson(request) {
  try { return await request.json(); } catch { fail(400, "Cuerpo JSON no válido"); }
}

export const now = () => new Date().toISOString();
```

- [ ] **Step 4: Escribir `server/visibility.js`**

```js
// The one rule for what the public may see. External reference media never qualify
// (also enforced by a CHECK constraint in D1).
export const isPublicMedia = (m, l) =>
  m.origin !== "external" && m.public === 1 && !!m.r2_key && l.published === 1 && !l.archived_at;
```

- [ ] **Step 5: Escribir `server/listing.js`**

```js
import { isPublicMedia } from "./visibility.js";

export const ENUMS = {
  use: ["residential", "commercial"],
  operation: ["sale", "rent", "business"],
  availability: ["for_sale", "under_offer", "sold", "to_let", "lease", "not_stated", "withdrawn"],
  rent_period: ["month", "year"],
  currency: ["GBP", "EUR"],
};
const TEXT = { title: 200, property_type: 100, country: 100, location: 200, road_name: 200, tenure: 100,
  price_text: 200, summary: 5000, description: 20000, tour_url: 500 };
const INTS = ["bedrooms", "bathrooms"];
const MONEY = ["sale_price", "rent", "premium"];
const REQUIRED = ["title", "use", "operation", "availability"];
export const EDITABLE = [...Object.keys(ENUMS), ...Object.keys(TEXT), ...INTS, ...MONEY, "specs"];

const blank = v => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const bad = msg => { throw new Error(msg); };

function checkSpecs(v) {
  if (!Array.isArray(v) || v.length > 60) bad("Máximo 60 filas");
  return v.map(s => {
    const [group, label, value] = ["group", "label", "value"].map(k => (typeof s?.[k] === "string" ? s[k].trim() : ""));
    if (!label || !value) bad("Cada fila necesita dato y valor");
    if (group.length > 60 || label.length > 100 || value.length > 300) bad("Fila demasiado larga");
    return { group, label, value };
  });
}

function check(k, v) {
  if (blank(v)) return REQUIRED.includes(k) ? bad("Obligatorio") : k === "specs" ? "[]" : null;
  if (k in ENUMS) return ENUMS[k].includes(v) ? v : bad(`Valor no válido (${ENUMS[k].join(", ")})`);
  if (k in TEXT) {
    if (typeof v !== "string") bad("Debe ser texto");
    const s = v.trim();
    if (s.length > TEXT[k]) bad(`Máximo ${TEXT[k]} caracteres`);
    if (k === "tour_url" && !/^https:\/\/\S+$/i.test(s)) bad("Debe empezar por https://");
    return s;
  }
  if (INTS.includes(k)) return Number.isInteger(v) && v >= 0 && v <= 100 ? v : bad("Número entero entre 0 y 100");
  if (MONEY.includes(k)) {
    return typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e10 ? v
      : bad("Importe mayor que 0, o vacío si no se conoce");
  }
  return JSON.stringify(checkSpecs(v)); // specs
}

// Whitelist validation: unknown or locked keys (id, published, archived_at…) are ignored.
export function validateListing(input, { partial = false } = {}) {
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const value = {}, errors = {};
  for (const k of EDITABLE) {
    if (!(k in src)) { if (!partial && REQUIRED.includes(k)) errors[k] = "Obligatorio"; continue; }
    try { value[k] = check(k, src[k]); } catch (e) { errors[k] = e.message; }
  }
  return Object.keys(errors).length ? { errors } : { value };
}

export const regionOf = country => (country === "Jersey" ? "jersey" : country === "United Kingdom" ? "uk" : "international");
export const idPrefix = (use, country) =>
  regionOf(country) === "international" ? "HE-I" : use === "commercial" ? "HE-C" : "HE-R";
export function nextId(ids, prefix) {
  const n = ids.filter(id => id.startsWith(prefix)).map(id => parseInt(id.slice(prefix.length), 10)).filter(Number.isFinite);
  return prefix + String(Math.max(0, ...n) + 1).padStart(3, "0");
}

const STATUS = { for_sale: "For Sale", under_offer: "Under Offer", sold: "Sold", to_let: "To Let", lease: "Lease",
  not_stated: "Enquire", withdrawn: "Withdrawn" };
const lines = s => (s || "").split("\n").map(x => x.trim()).filter(Boolean);
const src = (m, thumb) => `/media/${m.id}${thumb ? "?thumb" : ""}`;
const alt = (m, fallback) => (m.label || "").replace(/\.(png|jpe?g|webp)$/i, "").trim() || fallback;

// Public shape read by site/index.html. Media must be ordered by position.
export function toPublic(l, media) {
  const pub = media.filter(m => isPublicMedia(m, l));
  const photos = pub.filter(m => m.kind === "photo");
  const cover = photos.find(m => m.id === l.cover_media_id) || photos[0];
  const aerial = pub.find(m => m.kind === "aerial");
  return {
    id: l.id, title: l.title, status: STATUS[l.availability], region: regionOf(l.country),
    place: l.location || l.country || "", type: l.property_type, use: l.use, operation: l.operation,
    currency: l.currency, salePrice: l.sale_price, rent: l.rent, rentPeriod: l.rent_period, premium: l.premium,
    priceText: l.price_text, beds: l.bedrooms, baths: l.bathrooms, tenure: l.tenure,
    summary: lines(l.summary), description: lines(l.description),
    image: cover ? src(cover) : null, thumb: cover ? src(cover, true) : null,
    photos: photos.map(m => ({ src: src(m), thumb: src(m, true), alt: alt(m, l.title) })),
    floorplans: pub.filter(m => m.kind === "floorplan").map(m => ({ src: src(m), alt: alt(m, "Floor plan") })),
    aerial: aerial ? { src: src(aerial), alt: alt(aerial, "Aerial view") } : null,
    tourUrl: l.tour_url, specs: JSON.parse(l.specs || "[]"),
  };
}
```

- [ ] **Step 6: Ejecutar los tests**

Run: `node --test tests/server/listing.test.mjs`
Esperado: `# pass 8`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add server/http.js server/visibility.js server/listing.js tests/server/listing.test.mjs
git commit -m "Add listing validation, public shape and media visibility rule"
```

---

### Tarea 3: Autenticación (token de Firebase y sesión firmada)

**Files:**
- Create: `server/auth.js`, `tests/server/auth.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - Token de Firebase: `verifyFirebaseToken(token, projectId, jwks?) → Promise<email en minúsculas>`. Lanza un error si el token no es válido.
  - Sesión:
    - `COOKIE = "__Host-hs"`, `SESSION_HOURS = 8`
    - `signSession(email, secret, nowMs?) → Promise<string>`
    - `readSession(value, secret, nowMs?) → Promise<email|null>`
    - `sessionCookie(value, maxAgeSeconds) → string` (cabecera Set-Cookie)
  - Petición:
    - `getCookie(request, name) → string|null`
    - `currentAdmin(request, env) → Promise<email|null>`
    - `sameOrigin(request) → boolean`

- [ ] **Step 1: Escribir los tests que fallan `tests/server/auth.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { verifyFirebaseToken, signSession, readSession, getCookie, sameOrigin, currentAdmin, COOKIE } from "../../server/auth.js";
import { makeEnv, SECRET } from "./helpers.mjs";

const PROJECT = "hamptonestatesjersey";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
const token = (claims = {}, opts = {}) => new SignJWT({ email: "Luis@Example.com", email_verified: true,
  firebase: { sign_in_provider: "google.com" }, ...claims })
  .setProtectedHeader({ alg: "RS256", kid: "k1" })
  .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`).setAudience(opts.aud ?? PROJECT)
  .setSubject("uid1").setIssuedAt().setExpirationTime(opts.exp ?? "1h").sign(privateKey);

test("a valid Google token yields the lower-cased email", async () => {
  assert.equal(await verifyFirebaseToken(await token(), PROJECT, jwks), "luis@example.com");
});

test("wrong audience, issuer, unverified email or non-Google provider are rejected", async () => {
  for (const t of [await token({}, { aud: "other" }), await token({}, { iss: "https://evil" }),
    await token({ email_verified: false }), await token({ firebase: { sign_in_provider: "password" } }),
    await token({}, { exp: Math.floor(Date.now() / 1000) - 60 })]) {
    await assert.rejects(verifyFirebaseToken(t, PROJECT, jwks));
  }
});

test("session cookie round-trips and rejects tampering or expiry", async () => {
  const v = await signSession("a@b.com", SECRET, 1000);
  assert.equal(await readSession(v, SECRET, 2000), "a@b.com");
  assert.equal(await readSession(v, SECRET, 1000 + 8 * 3600e3 + 1), null);
  assert.equal(await readSession(v.replace(/^./, c => (c === "a" ? "b" : "a")), SECRET, 2000), null);
  assert.equal(await readSession("garbage", SECRET), null);
  assert.equal(await readSession(null, SECRET), null);
  await assert.rejects(signSession("a@b.com", "short"), /SESSION_SECRET/);
});

test("currentAdmin re-checks the admins table on every request", async () => {
  const env = makeEnv();
  const req = async email => new Request("https://h.test/x", { headers: { cookie: `x=1; ${COOKIE}=${await signSession(email, SECRET)}` } });
  assert.equal(await currentAdmin(await req("luismadef45@gmail.com"), env), "luismadef45@gmail.com");
  assert.equal(await currentAdmin(await req("someone@else.com"), env), null);
  await env.DB.prepare("DELETE FROM admins WHERE email = ?").bind("luismadef45@gmail.com").run();
  assert.equal(await currentAdmin(await req("luismadef45@gmail.com"), env), null);
});

test("cookie parsing and same-origin check", () => {
  const r = new Request("https://h.test/api/x", { method: "POST", headers: { cookie: "a=1; __Host-hs=abc.def", origin: "https://h.test" } });
  assert.equal(getCookie(r, "__Host-hs"), "abc.def");
  assert.equal(sameOrigin(r), true);
  assert.equal(sameOrigin(new Request("https://h.test/x", { method: "POST", headers: { origin: "https://evil.test" } })), false);
  assert.equal(sameOrigin(new Request("https://h.test/x", { method: "POST" })), false);
});
```

- [ ] **Step 2: Ejecutarlos y comprobar que fallan**

Run: `node --test tests/server/auth.test.mjs`
Esperado: FAIL con `Cannot find module '.../server/auth.js'`.

- [ ] **Step 3: Escribir `server/auth.js`**

```js
import { jwtVerify, createRemoteJWKSet } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

// Firebase ID token → verified Google email (lower case). Throws on anything else.
export async function verifyFirebaseToken(token, projectId, jwks = GOOGLE_JWKS) {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ["RS256"],
  });
  if (payload.email_verified !== true || payload.firebase?.sign_in_provider !== "google.com" || typeof payload.email !== "string")
    throw new Error("Not a verified Google account");
  return payload.email.toLowerCase();
}

export const COOKIE = "__Host-hs";
export const SESSION_HOURS = 8;
const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
function hmacKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("SESSION_SECRET missing or shorter than 32 characters");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(email, secret, nowMs = Date.now()) {
  const key = await hmacKey(secret);
  const body = b64u(enc.encode(JSON.stringify({ email, exp: nowMs + SESSION_HOURS * 3600e3 })));
  return `${body}.${b64u(await crypto.subtle.sign("HMAC", key, enc.encode(body)))}`;
}

export async function readSession(value, secret, nowMs = Date.now()) {
  const key = await hmacKey(secret); // misconfiguration must fail loudly, not look like "signed out"
  try {
    const [body, sig] = String(value ?? "").split(".");
    if (!body || !sig || !(await crypto.subtle.verify("HMAC", key, unb64u(sig), enc.encode(body)))) return null;
    const { email, exp } = JSON.parse(new TextDecoder().decode(unb64u(body)));
    return typeof email === "string" && exp > nowMs ? email : null;
  } catch { return null; }
}

export const sessionCookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

export const getCookie = (request, name) =>
  (request.headers.get("cookie") || "").split(/;\s*/).find(c => c.startsWith(name + "="))?.slice(name.length + 1) ?? null;

// Signed cookie AND still listed in admins: removing someone takes effect on their next request.
export async function currentAdmin(request, env) {
  const email = await readSession(getCookie(request, COOKIE), env.SESSION_SECRET);
  if (!email) return null;
  return (await env.DB.prepare("SELECT 1 FROM admins WHERE email = ?").bind(email).first()) ? email : null;
}

export const sameOrigin = request => request.headers.get("origin") === new URL(request.url).origin;
```

- [ ] **Step 4: Ejecutar los tests**

Run: `node --test tests/server/auth.test.mjs`
Esperado: `# pass 5`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add server/auth.js tests/server/auth.test.mjs
git commit -m "Add Firebase token verification and signed admin session"
```

---

### Tarea 4: Importación desde la base de investigación

**Files:**
- Create: `scripts/import_hampton.py`, `scripts/upload_r2.sh`, `tests/test_import.py`

**Interfaces:**
- Consumes: esquema de la Tarea 1 (nombres de columnas).
- Produces:
  - `build/import/import.sql` (re-ejecutable: `listings`/`media` con `ON CONFLICT DO NOTHING`; `research_*` se reemplazan enteras).
  - `build/import/thumbs/**.jpg`.
  - `build/import/upload.tsv` (`clave\truta\tcontent-type`).
  - Funciones Python: `q(v)`, `price_fields(row)`, `map_listing(row, tenure, today)`, `media_kind(asset_type, path)`, `map_media(row, position, today)`.

- [ ] **Step 1: Escribir los tests que fallan `tests/test_import.py`**

```python
import os, sqlite3, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import import_hampton as ih

TODAY = "2026-10-07"

def prop(**kw):
    base = dict(property_id="HE-R001", collection="residential", catalogue_scope="Current requested catalogue",
                availability="For sale", price_basis="Sale asking price", asking_amount=779000.0, currency="GBP",
                asking_text="£779,000", name=" Le Bernage ", property_type="House\n", country="Jersey",
                location="St Saviour", road_name="", bedrooms=3.0, bathrooms=1.0, hampton_summary="A\nB\n\n",
                hampton_description="Desc", research_date="2026-10-05")
    base.update(kw)
    return base

def asset(**kw):
    base = dict(asset_id="A00001", property_id="HE-R001", asset_type="photo", local_path="media/hampton/x.jpg",
                provider="Hampton Estates", label="Kitchen.png", url="https://static.wixstatic.com/x",
                rights_status="hampton_source_ownership_to_confirm", width=700.0, height=466.0, bytes=1000.0)
    base.update(kw)
    return base

class ListingMapping(unittest.TestCase):
    def test_sale(self):
        l = ih.map_listing(prop(), None, TODAY)
        self.assertEqual((l["operation"], l["sale_price"], l["rent"], l["premium"], l["currency"]), ("sale", 779000.0, None, None, "GBP"))
        self.assertEqual((l["title"], l["property_type"], l["road_name"], l["summary"]), ("Le Bernage", "House", None, "A\nB"))
        self.assertEqual((l["published"], l["archived_at"], l["availability"]), (1, None, "for_sale"))
        self.assertEqual(l["bedrooms"], 3)

    def test_rent_per_month(self):
        l = ih.map_listing(prop(price_basis="Rent per month", availability="To let", asking_amount=1900.0), None, TODAY)
        self.assertEqual((l["operation"], l["rent"], l["rent_period"], l["sale_price"]), ("rent", 1900.0, "month", None))

    def test_business_premium(self):
        l = ih.map_listing(prop(collection="commercial", price_basis="Business / lease premium; separate rent may apply", asking_amount=90000.0), None, TODAY)
        self.assertEqual((l["use"], l["operation"], l["premium"], l["sale_price"]), ("commercial", "business", 90000.0, None))

    def test_ambiguous_keeps_text_but_no_amount(self):
        l = ih.map_listing(prop(price_basis="Ambiguous rent/price — period and transaction need confirmation", availability="To let", asking_amount=9360.0, asking_text="£9,360"), None, TODAY)
        self.assertEqual((l["operation"], l["sale_price"], l["rent"], l["premium"], l["price_text"]), ("rent", None, None, None, "£9,360"))

    def test_negotiable_without_currency(self):
        l = ih.map_listing(prop(price_basis="Business / lease terms negotiable", currency="", asking_amount=None, asking_text="Negotiable"), None, TODAY)
        self.assertEqual((l["currency"], l["premium"], l["price_text"]), (None, None, "Negotiable"))

    def test_sold_not_published_and_legacy_archived(self):
        self.assertEqual(ih.map_listing(prop(availability="Sold"), None, TODAY)["published"], 0)
        legacy = ih.map_listing(prop(property_id="HE-X002", collection="indexed_legacy", catalogue_scope="Indexed legacy — outside current catalogue",
                                     availability="Indexed legacy — withdrawn page", property_type="Shop"), None, TODAY)
        self.assertEqual((legacy["availability"], legacy["published"], legacy["use"]), ("withdrawn", 0, "commercial"))
        self.assertTrue(legacy["archived_at"].startswith(TODAY))

class MediaMapping(unittest.TestCase):
    def test_hampton_photo_public_with_thumb(self):
        m = ih.map_media(asset(), 0, TODAY)
        self.assertEqual((m["origin"], m["kind"], m["public"], m["thumb_key"]), ("hampton", "photo", 1, "thumbs/hampton/x.jpg"))

    def test_external_never_public(self):
        m = ih.map_media(asset(provider="Livingroom", local_path="media/external/y.jpg"), 0, TODAY)
        self.assertEqual((m["origin"], m["public"]), ("external", 0))

    def test_pdf_and_links_are_documents(self):
        self.assertEqual(ih.map_media(asset(provider="Savills", local_path="media/external/b.pdf", asset_type="brochure_pdf"), 0, TODAY)["kind"], "document")
        link = ih.map_media(asset(provider="Vimeo", local_path="", asset_type="video_tour"), 0, TODAY)
        self.assertEqual((link["kind"], link["r2_key"], link["public"]), ("document", None, 0))

    def test_floorplan(self):
        self.assertEqual(ih.map_media(asset(asset_type="floor_plan"), 0, TODAY)["kind"], "floorplan")

class SqlQuoting(unittest.TestCase):
    def test_literals(self):
        self.assertEqual([ih.q(None), ih.q(3.0), ih.q(2.5), ih.q("O'Neil")], ["NULL", "3", "2.5", "'O''Neil'"])

class Rerun(unittest.TestCase):
    def test_rerun_never_overwrites_panel_edits(self):
        schema = open(os.path.join(os.path.dirname(__file__), "..", "migrations", "0001_init.sql")).read()
        db = sqlite3.connect(":memory:"); db.executescript(schema)
        row = ih.map_listing(prop(), None, TODAY); row["cover_media_id"] = None
        sql = ih.insert("listings", row, "id")
        db.execute(sql)
        db.execute("UPDATE listings SET title = 'Edited in panel' WHERE id = 'HE-R001'")
        db.execute(sql)
        self.assertEqual(db.execute("SELECT title FROM listings").fetchone()[0], "Edited in panel")

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Ejecutarlos y comprobar que fallan**

Run: `python3 -m unittest tests/test_import.py`
Esperado: `ModuleNotFoundError: No module named 'import_hampton'`.

- [ ] **Step 3: Escribir `scripts/import_hampton.py`**

```python
#!/usr/bin/env python3
"""Build the D1 import (SQL), thumbnails and an R2 upload list from the Hampton research SQLite.

Usage: python3 scripts/import_hampton.py [--db PATH] [--out DIR]
Safe to re-run: listings and media use ON CONFLICT DO NOTHING (panel edits are never overwritten);
research_* tables are fully replaced. See docs/superpowers/specs/2026-10-07-panel-admin-design.md §5.
"""
import argparse
import os
import sqlite3
import sys
from datetime import date

AVAIL = {"For sale": "for_sale", "Under offer": "under_offer", "Sold": "sold", "To let": "to_let",
         "Lease": "lease", "Not stated": "not_stated"}
PUBLISH = {"for_sale", "under_offer", "to_let", "lease"}
RESIDENTIAL_TYPES = {"House", "Flat", "Apartment", "Apartment Complex", "Bungalow", "Residential"}
RESEARCH = {"properties": "research_properties", "sources": "research_sources", "facts": "research_facts",
            "financial_terms": "research_financial_terms", "issues": "research_issues",
            "search_log": "research_search_log"}
CONTENT_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf"}


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return str(int(v))
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return str(int(v)) if v.is_integer() else repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def clean(s):
    s = (s or "").strip() if isinstance(s, str) else s
    return s or None


def num(v):
    return int(v) if v not in (None, "") else None


def price_fields(r):
    """Operation + separate price columns. The README warns raw_numeric_price is sometimes wrong,
    so only asking_amount is used, and only when basis and currency are unambiguous."""
    basis = (r["price_basis"] or "").lower()
    out = {"sale_price": None, "rent": None, "rent_period": None, "premium": None}
    if "sale asking price" in basis:
        op, key = "sale", "sale_price"
    elif basis.startswith("rent per"):
        op, key = "rent", "rent"
        out["rent_period"] = "month" if "month" in basis else "year"
    elif "premium" in basis or "business" in basis:
        op, key = "business", "premium"
    else:  # ambiguous / not stated: keep the text, invent nothing
        op, key = ("rent" if r["availability"] in ("To let", "Lease") else "sale"), None
    text = r["asking_text"] or ""
    cur = r["currency"] or ("GBP" if "£" in text else "EUR" if "€" in text else None)
    amt = r["asking_amount"]
    if key and cur and amt and amt > 0:
        out[key] = float(amt)
    return op, cur, out


def use_of(r):
    if r["collection"] == "commercial":
        return "commercial"
    if r["collection"] == "indexed_legacy" and clean(r["property_type"]) not in RESIDENTIAL_TYPES:
        return "commercial"
    return "residential"


def map_listing(r, tenure, today):
    legacy = r["collection"] == "indexed_legacy"
    avail = "withdrawn" if legacy else AVAIL.get(r["availability"], "not_stated")
    op, cur, prices = price_fields(r)
    stamp = f"{r['research_date'] or today}T00:00:00.000Z"
    return {
        "id": r["property_id"], "use": use_of(r), "title": clean(r["name"]) or r["property_id"],
        "property_type": clean(r["property_type"]), "operation": op, "availability": avail,
        "country": clean(r["country"]), "location": clean(r["location"]), "road_name": clean(r["road_name"]),
        "bedrooms": num(r["bedrooms"]), "bathrooms": num(r["bathrooms"]), "tenure": tenure,
        **prices, "currency": cur, "price_text": clean(r["asking_text"]),
        "summary": clean(r["hampton_summary"]), "description": clean(r["hampton_description"]), "specs": "[]",
        "published": int(r["catalogue_scope"] == "Current requested catalogue" and avail in PUBLISH),
        "archived_at": f"{today}T00:00:00.000Z" if legacy else None,
        "created_at": stamp, "updated_at": stamp, "updated_by": "import",
    }


def media_kind(asset_type, path):
    t, p = (asset_type or "").lower(), (path or "").lower()
    if not p or p.endswith(".pdf"):
        return "document"
    if "floor" in t or "plan" in t:
        return "floorplan"
    return "photo"


def map_media(r, position, today):
    path = clean(r["local_path"])
    origin = "hampton" if r["provider"] == "Hampton Estates" else "external"
    kind = media_kind(r["asset_type"], path)
    ext = os.path.splitext(path)[1].lower() if path else ""
    return {
        "id": r["asset_id"], "listing_id": r["property_id"], "r2_key": path,
        "thumb_key": "thumbs/" + path.split("/", 1)[1] if ext in (".jpg", ".jpeg") else None,
        "origin": origin, "kind": kind, "label": clean(r["label"]),
        "public": int(origin == "hampton" and kind in ("photo", "floorplan") and path is not None),
        "position": position, "content_type": CONTENT_TYPES.get(ext),
        "width": num(r["width"]), "height": num(r["height"]), "bytes": num(r["bytes"]),
        "source_url": clean(r["url"]), "provider": clean(r["provider"]), "rights_status": clean(r["rights_status"]),
        "created_at": f"{today}T00:00:00.000Z", "created_by": "import",
    }


def insert(table, row, key):
    cols = list(row)
    return (f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(q(row[c]) for c in cols)}) "
            f"ON CONFLICT({key}) DO NOTHING;")


def make_thumb(src, dst):
    if not os.path.exists(dst):
        from PIL import Image, ImageOps
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((640, 640))
            im.save(dst, "JPEG", quality=80, optimize=True)
    return os.path.abspath(dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="/root/Hampton_Database/hampton_properties.sqlite")
    ap.add_argument("--out", default="build/import")
    a = ap.parse_args()
    root = os.path.dirname(os.path.abspath(a.db))
    con = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    today = date.today().isoformat()
    os.makedirs(a.out, exist_ok=True)
    sql, uploads = [], []

    for src, dst in RESEARCH.items():
        sql.append(f"DELETE FROM {dst};")
        for row in con.execute(f"SELECT * FROM {src}"):
            cols = row.keys()
            sql.append(f"INSERT INTO {dst} ({', '.join(cols)}) VALUES ({', '.join(q(row[c]) for c in cols)});")

    tenure = {}
    for f in con.execute("SELECT property_id, value FROM facts WHERE field = 'tenure' ORDER BY origin != 'Hampton', fact_id"):
        tenure.setdefault(f["property_id"], clean(f["value"]))

    listings = {r["property_id"]: map_listing(r, tenure.get(r["property_id"]), today)
                for r in con.execute("SELECT * FROM properties ORDER BY property_id")}

    media, seen, pos = [], set(), {}
    rows = con.execute("SELECT * FROM media ORDER BY property_id, provider != 'Hampton Estates', asset_id")
    for r in rows:
        if r["property_id"] not in listings:
            continue
        m = map_media(r, pos.get(r["property_id"], 0), today)
        pos[r["property_id"]] = m["position"] + 1
        if m["r2_key"]:
            file = os.path.join(root, m["r2_key"])
            if not os.path.isfile(file):
                print(f"warning: missing file {file}; kept as link only", file=sys.stderr)
                m.update(r2_key=None, thumb_key=None, public=0, kind="document")
            elif m["r2_key"] not in seen:
                seen.add(m["r2_key"])
                uploads.append((m["r2_key"], os.path.abspath(file), m["content_type"] or "application/octet-stream"))
                if m["thumb_key"]:
                    uploads.append((m["thumb_key"], make_thumb(file, os.path.join(a.out, m["thumb_key"])), "image/jpeg"))
        media.append(m)

    for l in listings.values():
        l["cover_media_id"] = next((m["id"] for m in media if m["listing_id"] == l["id"] and m["origin"] == "hampton"
                                    and m["kind"] == "photo" and m["r2_key"]), None)
        sql.append(insert("listings", l, "id"))
    sql.extend(insert("media", m, "id") for m in media)

    with open(os.path.join(a.out, "import.sql"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(sql) + "\n")
    with open(os.path.join(a.out, "upload.tsv"), "w", encoding="utf-8") as fh:
        fh.writelines(f"{k}\t{p}\t{t}\n" for k, p, t in uploads)
    published = sum(l["published"] for l in listings.values())
    print(f"{len(listings)} listings ({published} published), {len(media)} media, {len(uploads)} objects → {a.out}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Ejecutar los tests**

Run: `python3 -m unittest tests/test_import.py -v`
Esperado: `Ran 12 tests` y `OK`.

- [ ] **Step 5: Escribir `scripts/upload_r2.sh`**

```bash
#!/usr/bin/env bash
# Upload every line of an upload.tsv (key<TAB>file<TAB>content-type) to the hampton-media bucket.
# Usage: scripts/upload_r2.sh build/import/upload.tsv --local|--remote [--persist-to DIR]
set -euo pipefail
tsv="${1:?usage: upload_r2.sh FILE.tsv --local|--remote [--persist-to DIR]}"
mode="${2:?pass --local or --remote}"
shift 2
[[ "$mode" == "--local" || "$mode" == "--remote" ]] || { echo "mode must be --local or --remote" >&2; exit 2; }
[[ -f "$tsv" ]] || { echo "not found: $tsv" >&2; exit 2; }
extra=("$@")
mkdir -p build
failed=build/upload_errors.log
: > "$failed"
n=0
# ponytail: batches of 8 with `wait`; a slow upload holds its batch. Use a job pool if this gets too slow.
while IFS=$'\t' read -r key file type; do
  [[ -n "$key" ]] || continue
  ( npx wrangler r2 object put "hampton-media/$key" --file "$file" --content-type "$type" "$mode" "${extra[@]}" >/dev/null 2>&1 \
      || echo "$key" >> "$failed" ) &
  n=$((n + 1))
  if (( n % 8 == 0 )); then wait; fi
done < "$tsv"
wait
if [[ -s "$failed" ]]; then echo "$(wc -l < "$failed") of $n uploads failed; keys in $failed" >&2; exit 1; fi
echo "Uploaded $n objects ($mode)."
```

- [ ] **Step 6: Generar la importación e importarla en el D1 local**

📍 VPS, `/root/HamptonJersey`:
```bash
python3 scripts/import_hampton.py
npx wrangler d1 execute hampton --local --file build/import/import.sql
npx wrangler d1 execute hampton --local --command "SELECT published, archived_at IS NOT NULL AS archived, COUNT(*) n FROM listings GROUP BY 1,2"
```
Esperado:
- La primera línea dice `47 listings (… published), 790 media, … objects`.
- La consulta devuelve 3 filas: publicadas (`published=1, archived=0`), borradores (`0,0`) y archivadas (`0,1`, n=3).

Si sale un aviso `missing file`, anótalo en el commit.

- [ ] **Step 7: Volver a ejecutar la importación (comprueba que se puede repetir)**

```bash
npx wrangler d1 execute hampton --local --file build/import/import.sql
npx wrangler d1 execute hampton --local --command "SELECT COUNT(*) FROM listings; SELECT COUNT(*) FROM media"
```
Esperado: 47 y 790; no se duplica nada.

- [ ] **Step 8: Commit**

```bash
chmod +x scripts/upload_r2.sh
git add scripts/import_hampton.py scripts/upload_r2.sh tests/test_import.py
git commit -m "Add re-runnable import from the Hampton research database"
```

---

### Tarea 5: API pública, medios y solicitudes de visita

**Files:**
- Create:
  - `server/api.js`, `server/turnstile.js`, `server/viewings.js`, `server/media.js`, `server/routes/public.js`
  - `functions/api/[[path]].js`, `functions/media/[id].js`
  - `tests/server/public.test.mjs`
- Modify: `tests/server/helpers.mjs` (añadir `call`, `adminCookie`, `ORIGIN`)

**Interfaces:**
- Consumes: `json`, `fail`, `readJson`, `now`, `HttpError` (Tarea 2); `toPublic`, `isPublicMedia` (Tarea 2); `currentAdmin`, `sameOrigin`, `signSession`, `COOKIE` (Tarea 3).
- Produces:
  - Router:
    - `handleApi(request, env, segments: string[]) → Promise<Response>`.
    - Cada ruta es `[method, RegExp, handler, requiresAdmin?]`.
    - El handler recibe `{request, env, admin, params}`, donde `params` son los grupos capturados por la RegExp.
  - Funciones auxiliares: `verifyTurnstile(token, secret, ip, fetchFn?) → Promise<boolean>` y `validateViewing(body, todayISO) → {value}|{errors}`.
  - Medios: `serveMedia(request, env, id) → Promise<Response>`.
  - Endpoints:
    - `GET /api/listings` (array público)
    - `GET /api/config` (`{turnstileSiteKey}`)
    - `POST /api/viewings` (201 `{ok:true}`)
    - `GET /media/:id[?thumb]`

- [ ] **Step 1: Añadir a `tests/server/helpers.mjs`**

```js
import { handleApi } from "../../server/api.js";
import { signSession, COOKIE } from "../../server/auth.js";

export const ORIGIN = "https://hampton.test";
export async function call(env, method, path, { body, cookie, origin = ORIGIN, form } = {}) {
  const headers = new Headers();
  if (origin && method !== "GET") headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  const req = new Request(ORIGIN + "/api" + path, {
    method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const segments = path.split("?")[0].slice(1).split("/").map(decodeURIComponent); // Pages hands decoded segments
  const res = await handleApi(req, env, segments);
  return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
}
export const adminCookie = async (email = "luismadef45@gmail.com") => `${COOKIE}=${await signSession(email, SECRET)}`;
```

- [ ] **Step 2: Escribir los tests que fallan `tests/server/public.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie, ORIGIN } from "./helpers.mjs";
import { serveMedia } from "../../server/media.js";

const turnstile = ok => { globalThis.fetch = async () => new Response(JSON.stringify({ success: ok })); };
const nextWeekday = () => { const d = new Date(Date.now() + 2 * 864e5); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const nextSunday = () => { const d = new Date(Date.now() + 864e5); while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const booking = (o = {}) => ({ listing_id: "HE-R001", agent: "Gilberto Franco", kind: "In person", date: nextWeekday(),
  time: "11:30", name: "Jane Le Brocq", email: "Jane@Example.je", phone: "", turnstile: "tok", ...o });

function world() {
  const env = makeEnv();
  seedListing(env);
  seedListing(env, { id: "HE-R002", title: "Draft", published: 0 });
  seedListing(env, { id: "HE-X001", title: "Old", published: 0, archived_at: "2026-10-07" });
  seedMedia(env);
  seedMedia(env, { id: "A00002", r2_key: "media/external/e.jpg", thumb_key: null, origin: "external", public: 0 });
  seedMedia(env, { id: "A00003", listing_id: "HE-R002", r2_key: "media/hampton/d.jpg" });
  for (const k of ["media/hampton/a.jpg", "thumbs/hampton/a.jpg", "media/external/e.jpg", "media/hampton/d.jpg"])
    env.MEDIA.store.set(k, { body: k, type: "image/jpeg" });
  return env;
}

test("GET /listings: only published, not archived, public shape, cached 60s", async () => {
  const r = await call(world(), "GET", "/listings");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "public, max-age=60");
  assert.deepEqual(r.data.map(p => p.id), ["HE-R001"]);
  assert.deepEqual(r.data[0].photos.map(p => p.src), ["/media/A00001"]);
});

test("GET /config exposes only the Turnstile site key", async () => {
  assert.deepEqual((await call(world(), "GET", "/config")).data, { turnstileSiteKey: "site-key" });
});

test("media: public photo is cacheable; private or draft media are 404 without a session", async () => {
  const env = world();
  const get = (id, cookie, q = "") => serveMedia(new Request(`${ORIGIN}/media/${id}${q}`, { headers: cookie ? { cookie } : {} }), env, id);
  const pub = await get("A00001");
  assert.equal(pub.status, 200);
  assert.equal(pub.headers.get("cache-control"), "public, max-age=86400");
  assert.equal(await (await get("A00001", null, "?thumb")).text(), "thumbs/hampton/a.jpg");
  assert.equal((await get("A00002")).status, 404);   // external
  assert.equal((await get("A00003")).status, 404);   // draft listing
  assert.equal((await get("NOPE")).status, 404);
  const priv = await get("A00002", await adminCookie());
  assert.equal(priv.status, 200);
  assert.equal(priv.headers.get("cache-control"), "private, no-store");
});

test("POST /viewings stores a valid request", async () => {
  const env = world(); turnstile(true);
  const r = await call(env, "POST", "/viewings", { body: booking() });
  assert.equal(r.status, 201);
  const row = await env.DB.prepare("SELECT * FROM viewing_requests").first();
  assert.equal(row.email, "jane@example.je");
  assert.equal(row.status, "new");
  assert.equal(row.phone, null);
});

test("POST /viewings rejects failed Turnstile, Sundays, past dates, bad email and draft listings", async () => {
  const env = world();
  turnstile(false);
  assert.equal((await call(env, "POST", "/viewings", { body: booking() })).status, 400);
  turnstile(true);
  assert.match((await call(env, "POST", "/viewings", { body: booking({ date: nextSunday() }) })).data.fields.date, /Monday to Saturday/);
  assert.ok((await call(env, "POST", "/viewings", { body: booking({ date: "2020-01-01" }) })).data.fields.date);
  assert.ok((await call(env, "POST", "/viewings", { body: booking({ date: "2026-02-30" }) })).data.fields.date);
  assert.ok((await call(env, "POST", "/viewings", { body: booking({ email: "nope" }) })).data.fields.email);
  assert.ok((await call(env, "POST", "/viewings", { body: booking({ time: "03:00" }) })).data.fields.time);
  assert.equal((await call(env, "POST", "/viewings", { body: booking({ listing_id: "HE-R002" }) })).status, 400);
  assert.equal((await call(env, "POST", "/viewings", { body: booking({ listing_id: null }) })).status, 201);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM viewing_requests").first()).n, 1);
});

test("cross-origin writes are blocked and unknown routes are JSON 404", async () => {
  turnstile(true);
  assert.equal((await call(world(), "POST", "/viewings", { body: booking(), origin: "https://evil.test" })).status, 403);
  const r = await call(world(), "GET", "/nope");
  assert.equal(r.status, 404);
  assert.equal(r.data.error, "Not found");
});
```

- [ ] **Step 3: Ejecutarlos y comprobar que fallan**

Run: `node --test tests/server/public.test.mjs`
Esperado: FAIL con `Cannot find module '.../server/api.js'`.

- [ ] **Step 4: Escribir `server/turnstile.js` y `server/viewings.js`**

`server/turnstile.js`:
```js
export async function verifyTurnstile(token, secret, ip, fetchFn = fetch) {
  if (typeof token !== "string" || !token || !secret) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  const r = await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  return r.ok && (await r.json()).success === true;
}
```

`server/viewings.js`:
```js
export const TIMES = ["10:00", "11:30", "14:00", "15:30", "17:00"];
export const KINDS = ["In person", "Live video call"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (v, max) => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);
const realDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;

// today = "YYYY-MM-DD" (UTC). Viewings: from tomorrow, within a year, Monday–Saturday.
export function validateViewing(b, today) {
  const src = b && typeof b === "object" ? b : {};
  const errors = {}, value = {};
  value.listing_id = src.listing_id || null;
  if (value.listing_id && !/^HE-[A-Z]\d{3,}$/.test(value.listing_id)) errors.listing_id = "Unknown property";
  value.name = text(src.name, 120);
  if (!value.name) errors.name = "Enter your name";
  const email = typeof src.email === "string" ? src.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL.test(email)) errors.email = "Enter a valid email address";
  value.email = email;
  value.phone = src.phone ? text(src.phone, 40) : null;
  if (src.phone && !value.phone) errors.phone = "Phone number is too long";
  value.agent = src.agent ? text(src.agent, 100) : null;
  value.kind = KINDS.includes(src.kind) ? src.kind : (errors.kind = "Choose a viewing type", null);
  value.time = TIMES.includes(src.time) ? src.time : (errors.time = "Choose a time", null);
  const maxDate = new Date(Date.parse(today + "T12:00:00Z") + 365 * 864e5).toISOString().slice(0, 10);
  if (!realDate(src.date) || src.date <= today || src.date > maxDate) errors.date = "Choose a date from tomorrow onwards";
  else if (new Date(src.date + "T12:00:00Z").getUTCDay() === 0) errors.date = "Viewings run Monday to Saturday";
  value.date = src.date;
  return Object.keys(errors).length ? { errors } : { value };
}
```

- [ ] **Step 5: Escribir `server/media.js`, `server/routes/public.js` y `server/api.js`**

`server/media.js`:
```js
import { isPublicMedia } from "./visibility.js";
import { currentAdmin } from "./auth.js";

const notFound = () => new Response("Not found", { status: 404 });

// 404 (not 403) for anything the caller may not see, so private files can't be confirmed to exist.
export async function serveMedia(request, env, id) {
  const row = await env.DB.prepare(
    "SELECT m.*, l.published, l.archived_at FROM media m JOIN listings l ON l.id = m.listing_id WHERE m.id = ?").bind(id).first();
  if (!row?.r2_key) return notFound();
  const pub = isPublicMedia(row, row);
  if (!pub && !(await currentAdmin(request, env))) return notFound();
  const key = new URL(request.url).searchParams.has("thumb") && row.thumb_key ? row.thumb_key : row.r2_key;
  const obj = await env.MEDIA.get(key);
  if (!obj) return notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.get("content-type") && row.content_type) headers.set("content-type", row.content_type);
  headers.set("etag", obj.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", pub ? "public, max-age=86400" : "private, no-store");
  return new Response(obj.body, { headers });
}
```

`server/routes/public.js`:
```js
import { json, fail, readJson, now } from "../http.js";
import { toPublic } from "../listing.js";
import { validateViewing } from "../viewings.js";
import { verifyTurnstile } from "../turnstile.js";

export const groupBy = (rows, key) => rows.reduce((a, r) => ((a[r[key]] ||= []).push(r), a), {});

async function listPublic({ env }) {
  const { results: listings } = await env.DB.prepare(
    "SELECT * FROM listings WHERE published = 1 AND archived_at IS NULL ORDER BY id").all();
  const { results: media } = await env.DB.prepare(
    `SELECT m.* FROM media m JOIN listings l ON l.id = m.listing_id
     WHERE l.published = 1 AND l.archived_at IS NULL AND m.public = 1 ORDER BY m.position, m.id`).all();
  const by = groupBy(media, "listing_id");
  return json(listings.map(l => toPublic(l, by[l.id] || [])), 200, { "cache-control": "public, max-age=60" });
}

const config = ({ env }) => json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY }, 200, { "cache-control": "public, max-age=300" });

async function createViewing({ request, env }) {
  const body = await readJson(request);
  if (!(await verifyTurnstile(body?.turnstile, env.TURNSTILE_SECRET, request.headers.get("cf-connecting-ip"))))
    fail(400, "The anti-spam check expired or failed. Please try again.");
  const r = validateViewing(body, now().slice(0, 10));
  if (r.errors) return json({ error: "Please check the highlighted fields.", fields: r.errors }, 400);
  const v = r.value;
  if (v.listing_id && !(await env.DB.prepare(
    "SELECT 1 FROM listings WHERE id = ? AND published = 1 AND archived_at IS NULL").bind(v.listing_id).first()))
    fail(400, "That property is no longer available. Choose another or send a general enquiry.");
  await env.DB.prepare(
    "INSERT INTO viewing_requests (listing_id, agent, kind, date, time, name, email, phone, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(v.listing_id, v.agent, v.kind, v.date, v.time, v.name, v.email, v.phone, now()).run();
  return json({ ok: true }, 201);
}

export default [
  ["GET", /^\/listings$/, listPublic],
  ["GET", /^\/config$/, config],
  ["POST", /^\/viewings$/, createViewing],
];
```

`server/api.js`:
```js
import { json, fail, HttpError } from "./http.js";
import { currentAdmin, sameOrigin } from "./auth.js";
import publicRoutes from "./routes/public.js";

// [method, path regex, handler, requiresAdmin]
const ROUTES = [...publicRoutes];

export async function handleApi(request, env, segments) {
  const path = "/" + segments.join("/"), method = request.method;
  try {
    if (method !== "GET" && method !== "HEAD" && !sameOrigin(request)) fail(403, "Cross-origin request blocked");
    for (const [m, re, handler, auth] of ROUTES) {
      const hit = m === method && re.exec(path);
      if (!hit) continue;
      const admin = auth ? await currentAdmin(request, env) : null;
      if (auth && !admin) fail(401, "Inicia sesión para continuar");
      return await handler({ request, env, admin, params: hit.slice(1) });
    }
    fail(404, "Not found");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Error del servidor. Inténtalo de nuevo." }, 500);
  }
}
```

- [ ] **Step 6: Escribir las Pages Functions**

`functions/api/[[path]].js`:
```js
import { handleApi } from "../../server/api.js";

export const onRequest = ({ request, env, params }) => handleApi(request, env, params.path ?? []);
```

`functions/media/[id].js`:
```js
import { serveMedia } from "../../server/media.js";

export const onRequestGet = ({ request, env, params }) => serveMedia(request, env, params.id);
```

- [ ] **Step 7: Ejecutar los tests**

Run: `node --test tests/server/*.test.mjs`
Esperado: todos pasan (`# fail 0`).

- [ ] **Step 8: Prueba rápida con el servidor local**

📍 VPS, `/root/HamptonJersey`. Terminal A:
```bash
npx wrangler pages dev --port 8788
```
📍 Terminal B, mismo directorio:
```bash
curl -s localhost:8788/api/listings | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d), d[0]['id'], d[0]['image'])"
curl -s -o /dev/null -w "%{http_code}\n" localhost:8788/media/A00001
```
Esperado: un número de fichas publicadas > 25, `HE-…` y `/media/A…`, y luego `404`. El 404 es correcto: las fotos todavía no están en el R2 local; las sube la Tarea 13. Para el servidor de la Terminal A con Ctrl+C.

- [ ] **Step 9: Commit**

```bash
git add server functions tests/server
git commit -m "Add public listings, media and viewing request API"
```

---

### Tarea 6: API de administración

**Files:**
- Create: `server/routes/session.js`, `server/routes/listings.js`, `server/routes/media.js`, `server/routes/inbox.js`, `server/routes/users.js`, `tests/server/admin.test.mjs`
- Modify: `server/api.js` (registrar las rutas)

**Interfaces:**
- Consumes: Tareas 2, 3 y 5.
- Produces (todas bajo `/api`; respuestas JSON, errores `{error, fields?}`):
  - Sesión:
    - `POST /session {idToken}` → `{email}` + Set-Cookie (400 sin token, 401 token no válido, 403 sin acceso)
    - `DELETE /session`
    - `GET /me` → `{email}`
  - Fichas:
    - `GET /admin/listings` → `{listings: [...fila resumida, cover_id]}`
    - `GET /admin/listings/:id` → `{listing, media, research, sources, facts, terms, issues, searches, duplicates}`
    - `POST /admin/listings` → 201 `{id}`
    - `PUT /admin/listings/:id {…campos, updated_at}` → `{listing}` (409 si `updated_at` no coincide)
    - `POST /admin/listings/:id/(publish|unpublish|archive|restore)` → `{listing}`
    - `DELETE /admin/listings/:id {confirm}` → `{ok}`
  - Medios:
    - `PUT /admin/listings/:id/media {items:[{id,position,public,kind,label}], cover_media_id}` → `{media}`
    - `POST /admin/listings/:id/media` (multipart `file`, `thumb`, `kind`, `label`, `width`, `height`) → 201 `{media}`
    - `DELETE /admin/media/:mediaId` → `{ok}`
  - Solicitudes:
    - `GET /admin/viewings?status=` → `{viewings, counts}`
    - `PUT /admin/viewings/:id {status}`
    - `DELETE /admin/viewings/:id`
  - Usuarios:
    - `GET /admin/users` → `{users}`
    - `POST /admin/users {email}` → 201
    - `DELETE /admin/users/:email`
  - Exporta `loadListing(env, id)` desde `routes/listings.js` (lo usa `routes/media.js`).

- [ ] **Step 1: Escribir los tests que fallan `tests/server/admin.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie, T0 } from "./helpers.mjs";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
async function world() {
  const env = makeEnv();
  seedListing(env);
  seedListing(env, { id: "HE-R026", title: "Brittany", country: "France", published: 0 });
  seedMedia(env);
  seedMedia(env, { id: "A00002", r2_key: "media/external/e.jpg", thumb_key: null, origin: "external", public: 0, position: 1 });
  env.DB.raw.prepare("INSERT INTO research_properties (property_id, match_status, duplicate_group) VALUES ('HE-R001', 'exact_property', 'g1'), ('HE-R013', 'probable', 'g1'), ('HE-R027', 'none', NULL)").run();
  env.DB.raw.prepare("INSERT INTO research_issues (issue_id, property_ids, issue) VALUES ('I1', 'HE-R001; HE-R013', 'Possible duplicate')").run();
  return { env, cookie: await adminCookie() };
}

test("admin routes need a valid session of a listed admin", async () => {
  const { env } = await world();
  assert.equal((await call(env, "GET", "/admin/listings")).status, 401);
  assert.equal((await call(env, "GET", "/admin/listings", { cookie: await adminCookie("intruder@x.com") })).status, 401);
  assert.equal((await call(env, "GET", "/admin/listings", { cookie: "__Host-hs=forged.sig" })).status, 401);
  assert.equal((await call(env, "GET", "/me", { cookie: await adminCookie() })).data.email, "luismadef45@gmail.com");
});

test("session: missing or invalid Google token", async () => {
  const { env } = await world();
  assert.equal((await call(env, "POST", "/session", { body: {} })).status, 400);
  assert.equal((await call(env, "POST", "/session", { body: { idToken: "not-a-jwt" } })).status, 401);
  const out = await call(env, "DELETE", "/session");
  assert.match(out.headers.get("set-cookie"), /__Host-hs=; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=0/);
});

test("list and detail include cover, research, issues and duplicate warning", async () => {
  const { env, cookie } = await world();
  const list = (await call(env, "GET", "/admin/listings", { cookie })).data.listings;
  assert.deepEqual(list.map(l => l.id), ["HE-R001", "HE-R026"]);
  assert.equal(list[0].cover_id, "A00001");
  const d = (await call(env, "GET", "/admin/listings/HE-R001", { cookie })).data;
  assert.deepEqual(d.media.map(m => m.id), ["A00001", "A00002"]);
  assert.equal(d.research.match_status, "exact_property");
  assert.deepEqual(d.duplicates, ["HE-R013"]);
  assert.equal(d.issues.length, 1);
  assert.deepEqual(d.listing.specs, []);
  assert.equal((await call(env, "GET", "/admin/listings/HE-R999", { cookie })).status, 404);
});

test("create assigns the next free id, skipping ids used by research", async () => {
  const { env, cookie } = await world();
  const r = await call(env, "POST", "/admin/listings", { cookie, body: { title: "New home", use: "residential", operation: "sale", availability: "for_sale", country: "Jersey" } });
  assert.equal(r.status, 201);
  assert.equal(r.data.id, "HE-R028");   // HE-R027 exists in research
  const row = await env.DB.prepare("SELECT published, updated_by FROM listings WHERE id = 'HE-R028'").first();
  assert.deepEqual({ ...row }, { published: 0, updated_by: "luismadef45@gmail.com" });
  assert.equal((await call(env, "POST", "/admin/listings", { cookie, body: { title: "" } })).status, 400);
});

test("update: validates, ignores locked fields, and refuses stale saves with 409", async () => {
  const { env, cookie } = await world();
  const ok = await call(env, "PUT", "/admin/listings/HE-R001", { cookie, body: { title: "Renamed", published: 0, updated_at: T0 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.listing.title, "Renamed");
  assert.equal(ok.data.listing.published, 1);
  const stale = await call(env, "PUT", "/admin/listings/HE-R001", { cookie, body: { title: "Other", updated_at: T0 } });
  assert.equal(stale.status, 409);
  const bad = await call(env, "PUT", "/admin/listings/HE-R001", { cookie, body: { sale_price: 0, updated_at: ok.data.listing.updated_at } });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.fields.sale_price);
  assert.equal((await call(env, "PUT", "/admin/listings/HE-R001", { cookie, body: { title: "x" } })).status, 400);
});

test("archive → cannot publish → restore → delete only when archived and confirmed", async () => {
  const { env, cookie } = await world();
  const fd = new FormData();
  fd.append("file", new File([JPEG], "a.jpg")); fd.append("thumb", new File([JPEG], "t.jpg"));
  const up = await call(env, "POST", "/admin/listings/HE-R001/media", { cookie, form: fd });
  assert.equal((await call(env, "DELETE", "/admin/listings/HE-R001", { cookie, body: { confirm: "HE-R001" } })).status, 400);
  const arch = await call(env, "POST", "/admin/listings/HE-R001/archive", { cookie });
  assert.equal(arch.data.listing.published, 0);
  assert.ok(arch.data.listing.archived_at);
  assert.equal((await call(env, "POST", "/admin/listings/HE-R001/publish", { cookie })).status, 400);
  assert.equal((await call(env, "DELETE", "/admin/listings/HE-R001", { cookie, body: { confirm: "nope" } })).status, 400);
  assert.equal((await call(env, "DELETE", "/admin/listings/HE-R001", { cookie, body: { confirm: "HE-R001" } })).status, 200);
  assert.equal(await env.DB.prepare("SELECT 1 FROM listings WHERE id = 'HE-R001'").first(), null);
  assert.equal(env.MEDIA.store.has(up.data.media.r2_key), false);
  const r = await call(env, "POST", "/admin/listings/HE-R026/archive", { cookie });
  assert.equal((await call(env, "POST", "/admin/listings/HE-R026/restore", { cookie })).data.listing.archived_at, null);
  assert.ok(r);
});

test("media: reorder, cover, kinds; external can never be made public", async () => {
  const { env, cookie } = await world();
  const items = [{ id: "A00002", position: 0, public: false, kind: "document", label: "Brochure" },
    { id: "A00001", position: 1, public: true, kind: "photo", label: "Kitchen" }];
  const r = await call(env, "PUT", "/admin/listings/HE-R001/media", { cookie, body: { items, cover_media_id: "A00001" } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.media.map(m => m.id), ["A00002", "A00001"]);
  items[0].public = true;
  assert.match((await call(env, "PUT", "/admin/listings/HE-R001/media", { cookie, body: { items } })).data.error, /externas/);
  assert.equal((await call(env, "PUT", "/admin/listings/HE-R001/media", { cookie, body: { items: [{ ...items[1], id: "ZZZ" }] } })).status, 400);
  assert.equal((await call(env, "PUT", "/admin/listings/HE-R001/media", { cookie, body: { items: [items[1]], cover_media_id: "A00002" } })).status, 400);
});

test("upload accepts real images only; delete only removes uploads", async () => {
  const { env, cookie } = await world();
  const fd = (bytes) => { const f = new FormData(); f.append("file", new File([bytes], "x")); f.append("thumb", new File([bytes], "t")); f.append("label", "Garden"); f.append("width", "1600"); f.append("height", "1067"); return f; };
  const up = await call(env, "POST", "/admin/listings/HE-R001/media", { cookie, form: fd(JPEG) });
  assert.equal(up.status, 201);
  const m = up.data.media;
  assert.deepEqual([m.origin, m.public, m.position, m.width, m.label], ["upload", 1, 2, 1600, "Garden"]);
  assert.ok(env.MEDIA.store.has(m.r2_key) && env.MEDIA.store.has(m.thumb_key));
  assert.equal((await call(env, "POST", "/admin/listings/HE-R001/media", { cookie, form: fd(new TextEncoder().encode("<svg onload=x>")) })).status, 400);
  assert.equal((await call(env, "DELETE", "/admin/media/A00001", { cookie })).status, 400);
  assert.equal((await call(env, "DELETE", `/admin/media/${m.id}`, { cookie })).status, 200);
  assert.equal(env.MEDIA.store.has(m.r2_key), false);
});

test("viewings inbox: list with counts, change status, delete", async () => {
  const { env, cookie } = await world();
  env.DB.raw.prepare("INSERT INTO viewing_requests (listing_id, kind, date, time, name, email, created_at) VALUES ('HE-R001', 'In person', '2030-01-02', '10:00', 'Jane', 'j@x.je', ?)").run(T0);
  const l = (await call(env, "GET", "/admin/viewings?status=new", { cookie })).data;
  assert.equal(l.viewings[0].listing_title, "Le Bernage");
  assert.deepEqual(l.counts, { new: 1, contacted: 0, closed: 0 });
  assert.equal((await call(env, "PUT", "/admin/viewings/1", { cookie, body: { status: "bogus" } })).status, 400);
  assert.equal((await call(env, "PUT", "/admin/viewings/1", { cookie, body: { status: "contacted" } })).status, 200);
  assert.equal((await call(env, "GET", "/admin/viewings?status=contacted", { cookie })).data.viewings.length, 1);
  assert.equal((await call(env, "DELETE", "/admin/viewings/1", { cookie })).status, 200);
  assert.equal((await call(env, "DELETE", "/admin/viewings/1", { cookie })).status, 404);
});

test("users: add, refuse self-removal, remove others", async () => {
  const { env, cookie } = await world();
  assert.equal((await call(env, "POST", "/admin/users", { cookie, body: { email: " New@Hampton.je " } })).status, 201);
  assert.ok((await call(env, "GET", "/admin/users", { cookie })).data.users.some(u => u.email === "new@hampton.je"));
  assert.equal((await call(env, "POST", "/admin/users", { cookie, body: { email: "bad" } })).status, 400);
  assert.equal((await call(env, "DELETE", "/admin/users/luismadef45%40gmail.com", { cookie })).status, 400);
  assert.equal((await call(env, "DELETE", "/admin/users/new%40hampton.je", { cookie })).status, 200);
  assert.equal((await call(env, "DELETE", "/admin/users/new%40hampton.je", { cookie })).status, 404);
});
```

- [ ] **Step 2: Ejecutarlos y comprobar que fallan**

Run: `node --test tests/server/admin.test.mjs`
Esperado: FAIL (las rutas `/admin/*` devuelven 404).

- [ ] **Step 3: Escribir `server/routes/session.js`**

```js
import { json, fail, readJson } from "../http.js";
import { verifyFirebaseToken, signSession, sessionCookie, SESSION_HOURS } from "../auth.js";

async function signIn({ request, env }) {
  const { idToken } = (await readJson(request)) ?? {};
  if (typeof idToken !== "string" || !idToken) fail(400, "Falta el token de Google");
  let email;
  try { email = await verifyFirebaseToken(idToken, env.FIREBASE_PROJECT_ID); }
  catch { fail(401, "No se pudo verificar el acceso con Google. Inténtalo de nuevo."); }
  if (!(await env.DB.prepare("SELECT 1 FROM admins WHERE email = ?").bind(email).first())) fail(403, "Esta cuenta no tiene acceso");
  const value = await signSession(email, env.SESSION_SECRET);
  return json({ email }, 200, { "set-cookie": sessionCookie(value, SESSION_HOURS * 3600) });
}

export default [
  ["POST", /^\/session$/, signIn],
  ["DELETE", /^\/session$/, () => json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) })],
  ["GET", /^\/me$/, ({ admin }) => json({ email: admin }), true],
];
```

- [ ] **Step 4: Escribir `server/routes/listings.js`**

```js
import { json, fail, readJson, now } from "../http.js";
import { validateListing, idPrefix, nextId } from "../listing.js";

const ID = "(HE-[A-Z]\\d{3,})";
const LIST_SQL = `SELECT l.id, l.title, l.use, l.country, l.location, l.availability, l.operation, l.sale_price, l.rent,
  l.rent_period, l.premium, l.currency, l.price_text, l.published, l.archived_at, l.updated_at, l.updated_by,
  COALESCE(l.cover_media_id, (SELECT m.id FROM media m WHERE m.listing_id = l.id AND m.kind = 'photo'
    AND m.r2_key IS NOT NULL ORDER BY m.position LIMIT 1)) AS cover_id
  FROM listings l ORDER BY l.id`;

export async function loadListing(env, id) {
  const l = await env.DB.prepare("SELECT * FROM listings WHERE id = ?").bind(id).first();
  if (!l) fail(404, "Propiedad no encontrada");
  return { ...l, specs: JSON.parse(l.specs || "[]") };
}

const list = async ({ env }) => json({ listings: (await env.DB.prepare(LIST_SQL).all()).results });

async function detail({ env, params: [id] }) {
  const listing = await loadListing(env, id);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  const [media, research, sources, facts, terms, issues, searches] = (await env.DB.batch([
    q("SELECT * FROM media WHERE listing_id = ? ORDER BY position, id", id),
    q("SELECT * FROM research_properties WHERE property_id = ?", id),
    q("SELECT * FROM research_sources WHERE property_id = ? ORDER BY source_id", id),
    q("SELECT * FROM research_facts WHERE property_id = ? ORDER BY field, fact_id", id),
    q("SELECT * FROM research_financial_terms WHERE property_id = ? ORDER BY term_id", id),
    q("SELECT * FROM research_issues WHERE property_ids LIKE ? ORDER BY severity, issue_id", `%${id}%`),
    q("SELECT * FROM research_search_log WHERE property_id = ? ORDER BY date, search_id", id),
  ])).map(r => r.results);
  const group = research[0]?.duplicate_group;
  const duplicates = group ? (await q("SELECT property_id FROM research_properties WHERE duplicate_group = ? AND property_id <> ? ORDER BY property_id", group, id).all())
    .results.map(r => r.property_id) : [];
  return json({ listing, media, research: research[0] ?? null, sources, facts, terms, issues, searches, duplicates });
}

const fieldErrors = errors => json({ error: "Revisa los campos marcados", fields: errors }, 400);

async function create({ request, env, admin }) {
  const r = validateListing(await readJson(request));
  if (r.errors) return fieldErrors(r.errors);
  // Never reuse an id that research rows still point at.
  const { results } = await env.DB.prepare("SELECT id FROM listings UNION SELECT property_id FROM research_properties").all();
  const id = nextId(results.map(x => x.id), idPrefix(r.value.use, r.value.country));
  const ts = now();
  const row = { ...r.value, id, published: 0, created_at: ts, updated_at: ts, updated_by: admin };
  const cols = Object.keys(row); // whitelisted by validateListing
  await env.DB.prepare(`INSERT INTO listings (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .bind(...cols.map(c => row[c])).run();
  return json({ id }, 201);
}

async function update({ request, env, admin, params: [id] }) {
  const body = await readJson(request);
  if (typeof body?.updated_at !== "string") fail(400, "Falta updated_at: recarga la ficha");
  const r = validateListing(body, { partial: true });
  if (r.errors) return fieldErrors(r.errors);
  const cols = Object.keys(r.value);
  if (!cols.length) fail(400, "No hay cambios que guardar");
  const res = await env.DB.prepare(
    `UPDATE listings SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE id = ? AND updated_at = ?`)
    .bind(...cols.map(c => r.value[c]), now(), admin, id, body.updated_at).run();
  if (!res.meta.changes) {
    await loadListing(env, id); // 404 if it no longer exists
    fail(409, "Otra persona guardó cambios en esta ficha. Recarga para verlos (tus cambios no se han guardado).");
  }
  return json({ listing: await loadListing(env, id) });
}

async function setState({ env, admin, params: [id, action] }) {
  const l = await loadListing(env, id);
  if (action === "publish" && l.archived_at) fail(400, "Restaura la ficha antes de publicarla");
  if (action === "archive" && l.archived_at) fail(400, "La ficha ya está archivada");
  if (action === "restore" && !l.archived_at) fail(400, "La ficha no está archivada");
  const ts = now();
  const patch = { publish: { published: 1 }, unpublish: { published: 0 }, archive: { published: 0, archived_at: ts },
    restore: { archived_at: null } }[action];
  const cols = Object.keys(patch);
  await env.DB.prepare(`UPDATE listings SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE id = ?`)
    .bind(...cols.map(c => patch[c]), ts, admin, id).run();
  return json({ listing: await loadListing(env, id) });
}

async function remove({ request, env, params: [id] }) {
  const l = await loadListing(env, id);
  if (!l.archived_at) fail(400, "Solo se pueden borrar fichas archivadas");
  if ((await readJson(request))?.confirm !== id) fail(400, `Escribe ${id} para confirmar el borrado`);
  const { results } = await env.DB.prepare("SELECT r2_key, thumb_key FROM media WHERE listing_id = ? AND origin = 'upload'").bind(id).all();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM media WHERE listing_id = ?").bind(id),
    env.DB.prepare("DELETE FROM listings WHERE id = ?").bind(id),
  ]);
  // Imported files stay in R2 (they also live in /root/Hampton_Database); research rows are kept.
  const keys = results.flatMap(m => [m.r2_key, m.thumb_key]).filter(Boolean);
  if (keys.length) await env.MEDIA.delete(keys);
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/listings$/, list, true],
  ["POST", /^\/admin\/listings$/, create, true],
  ["GET", new RegExp(`^/admin/listings/${ID}$`), detail, true],
  ["PUT", new RegExp(`^/admin/listings/${ID}$`), update, true],
  ["DELETE", new RegExp(`^/admin/listings/${ID}$`), remove, true],
  ["POST", new RegExp(`^/admin/listings/${ID}/(publish|unpublish|archive|restore)$`), setState, true],
];
```

- [ ] **Step 5: Escribir `server/routes/media.js`**

```js
import { json, fail, readJson, now } from "../http.js";
import { loadListing } from "./listings.js";

const KINDS = ["photo", "floorplan", "aerial", "document"];
const MAX_BYTES = 10 * 1024 * 1024;
const ordered = env => id => env.DB.prepare("SELECT * FROM media WHERE listing_id = ? ORDER BY position, id").bind(id).all();

// Content sniffing: the file must really be JPEG, PNG or WebP, whatever its name says.
export function sniff(buf) {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ["image/jpeg", "jpg"];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ["image/png", "png"];
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return ["image/webp", "webp"];
  return null;
}

async function save({ request, env, params: [id] }) {
  await loadListing(env, id);
  const { items, cover_media_id = null } = (await readJson(request)) ?? {};
  if (!Array.isArray(items)) fail(400, "Formato no válido");
  const { results } = await env.DB.prepare("SELECT id, origin, kind FROM media WHERE listing_id = ?").bind(id).all();
  const mine = new Map(results.map(m => [m.id, m]));
  const stmts = items.map(it => {
    const m = mine.get(it?.id);
    if (!m) fail(400, "Una de las fotos no pertenece a esta ficha");
    if (!KINDS.includes(it.kind)) fail(400, "Tipo de archivo no válido");
    if (!Number.isInteger(it.position) || it.position < 0) fail(400, "Orden no válido");
    if (typeof it.public !== "boolean") fail(400, "Visibilidad no válida");
    if (m.origin === "external" && it.public) fail(400, "Las fotos externas son solo de referencia y no pueden publicarse");
    const label = typeof it.label === "string" && it.label.trim() ? it.label.trim().slice(0, 200) : null;
    return env.DB.prepare("UPDATE media SET position = ?, public = ?, kind = ?, label = ? WHERE id = ?")
      .bind(it.position, it.public ? 1 : 0, it.kind, label, it.id);
  });
  if (cover_media_id !== null) {
    const c = mine.get(cover_media_id);
    if (!c || c.origin === "external") fail(400, "La portada debe ser una foto propia de esta ficha");
  }
  stmts.push(env.DB.prepare("UPDATE listings SET cover_media_id = ? WHERE id = ?").bind(cover_media_id, id));
  await env.DB.batch(stmts);
  return json({ media: (await ordered(env)(id)).results });
}

async function upload({ request, env, admin, params: [id] }) {
  await loadListing(env, id);
  let form;
  try { form = await request.formData(); } catch { fail(400, "Formulario no válido"); }
  const file = form.get("file"), thumb = form.get("thumb");
  if (!(file instanceof File) || !(thumb instanceof File)) fail(400, "Falta la foto");
  if (file.size > MAX_BYTES || thumb.size > MAX_BYTES) fail(413, "La foto supera 10 MB");
  const [buf, tbuf] = await Promise.all([file.arrayBuffer(), thumb.arrayBuffer()]);
  const type = sniff(buf), ttype = sniff(tbuf);
  if (!type || !ttype) fail(400, "Solo se aceptan fotos JPG, PNG o WebP");
  const kind = ["photo", "floorplan", "aerial"].includes(form.get("kind")) ? form.get("kind") : "photo";
  const mid = "U" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const key = `uploads/${mid}.${type[1]}`, tkey = `thumbs/uploads/${mid}.${ttype[1]}`;
  await env.MEDIA.put(key, buf, { httpMetadata: { contentType: type[0] } });
  await env.MEDIA.put(tkey, tbuf, { httpMetadata: { contentType: ttype[0] } });
  const pos = (await env.DB.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM media WHERE listing_id = ?").bind(id).first()).p;
  const int = v => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const label = String(form.get("label") || "").trim().slice(0, 200) || null;
  await env.DB.prepare(`INSERT INTO media (id, listing_id, r2_key, thumb_key, origin, kind, label, public, position,
      content_type, width, height, bytes, rights_status, created_at, created_by)
    VALUES (?, ?, ?, ?, 'upload', ?, ?, 1, ?, ?, ?, ?, ?, 'uploaded_by_team', ?, ?)`)
    .bind(mid, id, key, tkey, kind, label, pos, type[0], int(form.get("width")), int(form.get("height")), file.size, now(), admin).run();
  return json({ media: await env.DB.prepare("SELECT * FROM media WHERE id = ?").bind(mid).first() }, 201);
}

async function remove({ env, params: [mid] }) {
  const m = await env.DB.prepare("SELECT * FROM media WHERE id = ?").bind(mid).first();
  if (!m) fail(404, "Foto no encontrada");
  if (m.origin !== "upload") fail(400, "Solo se pueden borrar las fotos subidas desde el panel");
  await env.DB.batch([
    env.DB.prepare("UPDATE listings SET cover_media_id = NULL WHERE cover_media_id = ?").bind(mid),
    env.DB.prepare("DELETE FROM media WHERE id = ?").bind(mid),
  ]);
  await env.MEDIA.delete([m.r2_key, m.thumb_key].filter(Boolean));
  return json({ ok: true });
}

export default [
  ["PUT", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/media$/, save, true],
  ["POST", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/media$/, upload, true],
  ["DELETE", /^\/admin\/media\/([A-Za-z0-9]+)$/, remove, true],
];
```

- [ ] **Step 6: Escribir `server/routes/inbox.js` y `server/routes/users.js`**

`server/routes/inbox.js`:
```js
import { json, fail, readJson, now } from "../http.js";

const STATUSES = ["new", "contacted", "closed"];

async function list({ request, env }) {
  const status = new URL(request.url).searchParams.get("status");
  if (status && !STATUSES.includes(status)) fail(400, "Estado no válido");
  const { results: viewings } = await env.DB.prepare(
    `SELECT v.*, l.title AS listing_title FROM viewing_requests v LEFT JOIN listings l ON l.id = v.listing_id
     ${status ? "WHERE v.status = ?" : ""} ORDER BY v.created_at DESC LIMIT 500`).bind(...(status ? [status] : [])).all();
  const { results } = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM viewing_requests GROUP BY status").all();
  const counts = Object.fromEntries(STATUSES.map(s => [s, results.find(r => r.status === s)?.n ?? 0]));
  return json({ viewings, counts });
}

async function setStatus({ request, env, admin, params: [id] }) {
  const { status } = (await readJson(request)) ?? {};
  if (!STATUSES.includes(status)) fail(400, "Estado no válido");
  const r = await env.DB.prepare("UPDATE viewing_requests SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?")
    .bind(status, now(), admin, Number(id)).run();
  if (!r.meta.changes) fail(404, "Solicitud no encontrada");
  return json({ ok: true });
}

async function remove({ env, params: [id] }) {
  const r = await env.DB.prepare("DELETE FROM viewing_requests WHERE id = ?").bind(Number(id)).run();
  if (!r.meta.changes) fail(404, "Solicitud no encontrada");
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/viewings$/, list, true],
  ["PUT", /^\/admin\/viewings\/(\d+)$/, setStatus, true],
  ["DELETE", /^\/admin\/viewings\/(\d+)$/, remove, true],
];
```

`server/routes/users.js`:
```js
import { json, fail, readJson, now } from "../http.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const list = async ({ env }) => json({ users: (await env.DB.prepare("SELECT * FROM admins ORDER BY email").all()).results });

async function add({ request, env, admin }) {
  const email = String((await readJson(request))?.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) fail(400, "Email no válido");
  await env.DB.prepare("INSERT INTO admins (email, added_by, added_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING")
    .bind(email, admin, now()).run();
  return json({ ok: true }, 201);
}

// ponytail: no "last admin" check — you can't remove yourself and you are always an admin, so one always remains.
async function remove({ env, admin, params: [email] }) {
  if (email.toLowerCase() === admin) fail(400, "No puedes quitarte el acceso a ti mismo");
  const r = await env.DB.prepare("DELETE FROM admins WHERE email = ?").bind(email.toLowerCase()).run();
  if (!r.meta.changes) fail(404, "Ese email no tiene acceso");
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/users$/, list, true],
  ["POST", /^\/admin\/users$/, add, true],
  ["DELETE", /^\/admin\/users\/([^/]+)$/, remove, true],
];
```

- [ ] **Step 7: Registrar las rutas en `server/api.js`**

Sustituye las líneas de importación y `ROUTES`:
```js
import publicRoutes from "./routes/public.js";
import sessionRoutes from "./routes/session.js";
import listingRoutes from "./routes/listings.js";
import mediaRoutes from "./routes/media.js";
import inboxRoutes from "./routes/inbox.js";
import userRoutes from "./routes/users.js";

// [method, path regex, handler, requiresAdmin]
const ROUTES = [...publicRoutes, ...sessionRoutes, ...listingRoutes, ...mediaRoutes, ...inboxRoutes, ...userRoutes];
```

- [ ] **Step 8: Ejecutar todos los tests de servidor**

Run: `node --test tests/server/*.test.mjs`
Esperado: `# fail 0`.

- [ ] **Step 9: Commit**

```bash
git add server tests/server
git commit -m "Add admin API: session, listings, media, viewings inbox and users"
```

---

### Tarea 7: Web pública con datos reales y sin lo inventado

**Files:**
- Modify: `site/index.html`, `site/lib.js`, `tests/lib.test.js`
- Create: `site/_headers`
- Delete: `site/data/properties.json`, `site/img/aerial-demo.jpg`, `scrape.py`

**Interfaces:**
- Consumes: `GET /api/listings`, `GET /api/config` y `POST /api/viewings` (Tarea 5).
- Produces: `lib.js` exporta además `safeMedia(u)`, `safeHttps(u)`, `embedUrl(u)` y `EMBED_HOSTS`, y deja de exportar `SRC_HOST`.

- [ ] **Step 1: Reescribir `tests/lib.test.js`** (fixtures en línea; el archivo de datos se borra)

```js
// Run: node --test tests/lib.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../site/lib.js");

const P = o => ({ id: "HE-R001", title: "Home", status: "For Sale", region: "jersey", use: "residential", operation: "sale",
  currency: "GBP", salePrice: null, rent: null, rentPeriod: null, premium: null, beds: 3, ...o });
const sale = P({ salePrice: 500000 });
const rent = P({ id: "HE-R002", operation: "rent", rent: 1900, rentPeriod: "month" });
const biz = P({ id: "HE-C001", use: "commercial", operation: "business", premium: 90000 });
const eur = P({ id: "HE-I001", region: "international", currency: "EUR", salePrice: 110000 });
const uk = P({ id: "HE-R018", region: "uk", salePrice: 520000 });
const near = P({ id: "HE-R003", salePrice: 600000 });
const sold = P({ id: "HE-R004", salePrice: 550000, status: "Sold" });
const noPrice = P({ id: "HE-R005" });
const ALL = [sale, rent, biz, eur, uk, near, sold, noPrice];

test("unknown prices are labelled, never shown as zero", () => {
  assert.equal(L.priceLabel(noPrice), "Price not published");
  assert.equal(L.amount(noPrice), null);
});

test("sale, rent and business premium are separate fields", () => {
  assert.equal(L.priceLabel(rent), "£1,900 pcm");
  assert.equal(L.priceLabel(biz), "£90,000");
  assert.equal(L.priceLabel(eur), "€110,000");
});

test("comparables never mix operations, uses, regions or currencies, and skip sold", () => {
  assert.deepEqual(L.comparables(sale, ALL).map(x => x.id), ["HE-R003"]);
  assert.deepEqual(L.comparables(uk, ALL), []);
  assert.deepEqual(L.comparables(noPrice, ALL), []);
});

test("max-price filter compares like with like", () => {
  const f = { region: "all", op: "sale", beds: 0, max: 600000 };
  assert.ok(!L.matches(rent, f));
  assert.ok(!L.matches(eur, f), "EUR price is not compared with a GBP limit");
  assert.ok(L.matches(sale, f));
  assert.ok(L.matches(rent, { region: "jersey", op: "rent", beds: 2, max: 2500 }));
});

test("only safe URLs reach attributes", () => {
  assert.equal(L.safeUrl("javascript:alert(1)", L.IMG_HOST), null);
  assert.equal(L.safeUrl("https://evil.example/media/x.jpg", L.IMG_HOST), null);
  assert.equal(L.safeMedia("/media/A00001"), "/media/A00001");
  assert.equal(L.safeMedia("/media/A00001?thumb"), "/media/A00001?thumb");
  for (const bad of ["https://evil/media/A1", "/media/../x", "/media/A1\" onerror=x", null, 5]) assert.equal(L.safeMedia(bad), null);
  assert.equal(L.safeHttps("http://x.com"), null);
  assert.equal(L.safeHttps("https://x.com/a"), "https://x.com/a");
  assert.equal(L.embedUrl("https://my.matterport.com/show/?m=abc"), "https://my.matterport.com/show/?m=abc");
  assert.equal(L.embedUrl("https://spec.co/properties/1"), null);   // offered as a link instead
  assert.equal(L.esc(`"><img onerror=x>`), "&quot;&gt;&lt;img onerror=x&gt;");
});

test("mortgage repayment", () => {
  assert.equal(Math.round(L.pmt(200000, 0.05, 25)), 1169);
  assert.equal(L.pmt(120000, 0, 10), 1000);
});
```

- [ ] **Step 2: Ejecutarlo y comprobar que falla**

Run: `node --test tests/lib.test.js`
Esperado: FAIL en "only safe URLs" (`L.safeMedia is not a function`).

- [ ] **Step 3: Modificar `site/lib.js`**

Sustituye las líneas 4–11 (desde el comentario `// Only https URLs…` hasta el cierre de `safeUrl`) por:
```js
// Only https URLs under a known prefix are allowed into src/href attributes (team photos on Wix).
const IMG_HOST = "https://static.wixstatic.com/media/";
const safeUrl = (u, prefix) => {
  // ' ( ) are percent-encoded too, so a URL can't break out of a CSS url('...') value.
  try { const x = new URL(u); return x.protocol === "https:" && x.href.startsWith(prefix) ? x.href.replace(/['()]/g, c => "%" + c.charCodeAt(0).toString(16)) : null; }
  catch { return null; }
};
// Listing media come from our own /media endpoint.
const safeMedia = u => (typeof u === "string" && /^\/media\/[A-Za-z0-9]+(\?thumb)?$/.test(u) ? u : null);
const safeHttps = u => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : null; } catch { return null; } };
// Tours we embed in an iframe; any other https tour is offered as a link.
const EMBED_HOSTS = ["my.matterport.com", "player.vimeo.com", "www.youtube-nocookie.com"];
const embedUrl = u => { const s = safeHttps(u); return s && EMBED_HOSTS.includes(new URL(s).hostname) ? s : null; };
```
Y cambia la línea `module.exports` final por:
```js
if (typeof module === "object") module.exports = {esc, safeUrl, safeMedia, safeHttps, embedUrl, EMBED_HOSTS, IMG_HOST, money, amount, priceLabel, isSold, matches, comparables, pmt};
```

- [ ] **Step 4: Ejecutar `node --test tests/lib.test.js`**

Esperado: `# pass 6`, `# fail 0`.

- [ ] **Step 5: `site/index.html`: quitar lo inventado (CSS y marcado)**

1. Borra la línea del CSS `.ribbon{…}` (línea 36) y la regla `@media (max-width:640px){.ribbon .wide{display:none}}` (línea 208).
2. Borra las reglas `.drone` (líneas 181–192, desde el comentario `/* aerial: … */`). Cambia la línea 193 por:
   ```css
   @media (max-width:640px){.stage{aspect-ratio:4/3;max-height:none}}
   ```
3. Añade antes de `</style>`:
   ```css
   .thumbs{display:flex;gap:8px;overflow-x:auto;padding-top:10px}
   .thumbs button{all:unset;cursor:pointer;flex:0 0 88px;aspect-ratio:4/3;outline-offset:2px}
   .thumbs button[aria-pressed=true]{outline:2px solid var(--bronze)}
   .thumbs button:focus-visible{outline:2px solid var(--ink)}
   .thumbs img{width:100%;height:100%;object-fit:cover}
   .plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
   .plans img{width:100%;background:#fff;border:1px solid var(--mist)}
   .bullets{margin:0 0 16px;padding-left:18px}
   .form-status{min-height:1.4em}
   ```
4. Borra la línea 247 (`<div class="ribbon">…</div>`).
5. Borra la línea 259 (columna `<div><b>Demo</b>…</div>` del footer).
6. Añade, justo antes de `<script src="lib.js"></script>`:
   ```html
   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstile" async defer></script>
   ```
   Sin `integrity`: Cloudflare actualiza `api.js` sin cambiar la URL y su documentación pide no fijarlo con SRI (un hash rompería el widget en la siguiente actualización).

- [ ] **Step 6: `site/index.html`: helpers y estado**

1. Borra `M2_PER_PX`, `SQFT`, `polyArea` y todo el bloque `// ---------- demo enrichment …` hasta el cierre de `const DEMO = {…};` (líneas 269–270, 277–300).
2. Tras `const short = …` añade:
   ```js
   // Turnstile loads async; forms render the widget once it is ready.
   let TS_KEY = null;
   const tsReady = new Promise(r => { window.onTurnstile = r; });
   ```
3. En `card()`, sustituye `${esc(wix(p.image, 640, 480))}` por `${esc(p.thumb || p.image)}` y `${DEMO[p.id] ? '<span class="pill tour">3D tour</span>' : ""}` por `${p.tourUrl ? '<span class="pill tour">3D tour</span>' : ""}`.

- [ ] **Step 7: `site/index.html`: el formulario de visita envía de verdad**

En `bookingForm()`, sustituye la línea del botón (`<div><button class="btn" type="submit">Request viewing</button> <span class="hint">Demo: nothing is sent or booked.</span></div>`) por:
```js
    ${TS_KEY ? `<div class="ts"></div>` : ""}
    <div><button class="btn" type="submit" ${TS_KEY ? "" : "disabled"}>Request viewing</button>
      <p class="hint form-status" role="status" aria-live="polite">${TS_KEY ? "" : "Online booking is unavailable right now. Please call 01534 727582."}</p></div>
```
Sustituye el cuerpo completo de `mountBooking()` por:
```js
function mountBooking(slot, pre = {}) {
  slot.innerHTML = bookingForm(pre);
  const form = $("form", slot), el = form.elements, status = $(".form-status", slot), btn = $("button[type=submit]", form);
  let widget = null;
  if (TS_KEY) tsReady.then(() => { if ($(".ts", slot)) widget = turnstile.render($(".ts", slot), {sitekey: TS_KEY}); });
  const sunday = () => el.date.setCustomValidity(el.date.value && new Date(el.date.value + "T12:00").getDay() === 0
    ? "Viewings run Monday to Saturday. Please choose another day." : "");
  el.date.addEventListener("input", sunday);
  form.addEventListener("submit", async e => {
    e.preventDefault(); sunday();
    if (!form.reportValidity() || btn.disabled) return;
    const v = n => form.querySelector(`[name=${n}]:checked`)?.value;
    const agent = TEAM[+v("agent")] || null, prop = PUB.find(p => p.id === el.prop.value);
    const token = form.querySelector('[name="cf-turnstile-response"]')?.value;
    if (!token) { status.textContent = "Please complete the anti-spam check above."; return; }
    btn.disabled = true; status.textContent = "Sending…";
    try {
      const r = await fetch("/api/viewings", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({
        listing_id: el.prop.value || null, agent: agent?.name || null, kind: v("kind"), date: el.date.value, time: v("time"),
        name: el.name.value, email: el.email.value, phone: el.phone.value || null, turnstile: token})});
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.fields ? Object.values(data.fields).join(". ") + "." : data.error || "Something went wrong.");
    } catch (err) {
      status.textContent = `${err instanceof TypeError ? "We couldn't reach our server." : err.message} Your details are still here — please try again.`;
      btn.disabled = false; if (widget != null) turnstile.reset(widget);
      return;
    }
    const when = new Date(el.date.value + "T12:00").toLocaleDateString("en-GB", {weekday: "long", day: "numeric", month: "long"});
    const keep = {prop: el.prop.value, agent: agent ? TEAM.indexOf(agent) : 0};
    slot.innerHTML = `<div class="confirm" role="status" tabindex="-1"><h3>Request received</h3>
      <p>${agent ? esc(agent.name) : "Our team"} will contact you to confirm the viewing.</p>
      <dl><dt>Property</dt><dd>${esc(prop ? prop.title : "General enquiry / valuation")}</dd><dt>When</dt><dd>${esc(when)}, ${esc(v("time"))}</dd>
      <dt>Type</dt><dd>${esc(v("kind"))}</dd><dt>Agent</dt><dd>${agent ? `${esc(agent.name)} · ${esc(agent.office)}` : "First available"}</dd>
      <dt>Name</dt><dd>${esc(el.name.value)}</dd></dl>
      <div class="actions"><button class="btn" type="button" data-again>Book another viewing</button></div></div>`;
    $(".confirm", slot).focus();
    $("[data-again]", slot).addEventListener("click", () => { mountBooking(slot, keep); $("select", slot).focus(); });
  });
}
```

- [ ] **Step 8: `site/index.html`: home con datos reales**

En `home()`:
1. Sustituye `const feat = PUB.find(p => DEMO[p.id]) || PUB[0];` por:
   ```js
   const feat = PUB.find(p => p.tourUrl || p.aerial) || PUB[0];
   const featChips = [feat.tourUrl && "3D tour", feat.aerial && "Aerial view", feat.floorplans.length && "Floor plans",
     feat.operation === "sale" && feat.salePrice != null && "Mortgage calculator", "Book with an agent"].filter(Boolean);
   ```
2. Hero: `${esc(wix(feat.image, 1800, 1000))}` → `${esc(feat.image)}`.
3. `<p><span id="count" class="num"></span> listings · snapshot of the Hampton website.</p>` → `<p><span id="count" class="num"></span> listings.</p>`.
4. Sustituye el bloque `${DEMO[feat.id] ? `<section class="feature">…</section>` : ""}` por:
   ```js
   ${feat.tourUrl || feat.aerial ? `<section class="feature"><img src="${esc(feat.image)}" alt="${esc(feat.title)}">
     <div class="txt"><div class="eyebrow">Featured · ${esc(feat.place)}</div><h2>${esc(feat.title)}</h2>
       <p>See more of this property before you visit, then book a viewing with our team.</p>
       <div class="chips">${featChips.map(c => `<span>${c}</span>`).join("")}</div>
       <div><a class="btn" href="#/p/${feat.id}">Explore the property</a></div></div>
   </section>` : ""}
   ```
5. `<span>Listings in this snapshot</span>` → `<span>Listings available now</span>`.

- [ ] **Step 9: `site/index.html`: ficha de detalle con datos reales**

1. Borra la función `droneView()` entera.
2. En `detail()`, sustituye las líneas desde `const d = DEMO[p.id], …` hasta `const tabs = …` por:
   ```js
   const agent = agentFor(p);
   const canCalc = p.operation === "sale" && p.salePrice != null;
   const cur = p.currency || "GBP", money0 = n => money(n, cur);
   const desc = p.description.filter(l => l.toLowerCase() !== p.title.toLowerCase());
   const similar = comparables(p, PUB);
   const facts = [["Type", p.type], ["Location", p.place], ["Market", REGIONS[p.region]], ["Operation", OP_ONE[p.operation]],
     ["Price as listed", p.priceText || "Not published"], ["Tenure", p.tenure]].filter(([, v]) => v);
   const tour = embedUrl(p.tourUrl);
   const groups = p.specs.reduce((a, s) => ((a[s.group || "Details"] ||= []).push(s), a), {});
   const tabs = [["photo", "Photos"], ...(p.tourUrl ? [["tour", "3D tour"]] : []), ...(p.aerial ? [["aerial", "Aerial"]] : [])];
   ```
3. Tras `<div class="stage-note" id="stage-note" aria-live="polite"></div>` añade `<div class="thumbs" id="thumbs"></div>`.
4. En el `<aside>`: `${d ? `<button class="btn ghost" type="button" data-go="tour">Open the 3D tour</button>` : ""}` → `${p.tourUrl ? `…mismo botón…` : ""}`. Borra la línea `${p.source.retrieved ? `<p class="src">…` : ""}`.
5. "About this property": sustituye el contenido de `.prose` por:
   ```js
   ${p.summary.length ? `<ul class="bullets">${p.summary.map(l => `<li>${esc(l.replace(/^[-•]\s*/, ""))}</li>`).join("")}</ul>` : ""}
   ${desc.map(l => `<p>${esc(l)}</p>`).join("") || (p.summary.length ? "" : "<p>Full particulars available from our office.</p>")}
   ```
6. "Listing details": `<dd>${k === "Source" ? v : esc(v)}</dd>` → `<dd>${esc(v)}</dd>`, y borra la línea `${p.notes.map(…)}`.
7. Sustituye el bloque `${d ? `<div class="full"><h2 class="sub">Example details …</div>` : ""}` por:
   ```js
   ${p.specs.length ? `<div class="full"><h2 class="sub">Property details</h2>
     <div class="specs">${Object.entries(groups).map(([g, rows]) => `<div><h4>${esc(g)}</h4><dl>${rows.map(s =>
       `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join("")}</dl></div>`).join("")}</div></div>` : ""}
   ${p.floorplans.length ? `<div class="full"><h2 class="sub">Floor plans</h2><div class="plans">${p.floorplans.map(f =>
     `<a href="${esc(f.src)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(f.src)}" alt="${esc(f.alt)}"></a>`).join("")}</div></div>` : ""}
   ```
8. En `fail()`, sustituye el enlace a `TOUR` por `<a href="${esc(p.tourUrl)}" target="_blank" rel="noopener noreferrer">Open the tour in a new tab ↗</a>`.
9. Sustituye el cuerpo de `show(v)` desde `if (v === "photo") {` hasta el cierre del `if (v === "drone") {…}` por:
   ```js
   $("#thumbs").innerHTML = "";
   if (v === "photo") {
     const ph = p.photos[idx] || {src: p.image, alt: p.title};
     stage.innerHTML = `<img src="${esc(ph.src)}" alt="${esc(ph.alt)}">`;
     note.innerHTML = p.photos.length > 1 ? `<span>Photo ${idx + 1} of ${p.photos.length}</span>` : "";
     if (p.photos.length > 1) $("#thumbs").innerHTML = p.photos.map((f, i) =>
       `<button type="button" data-i="${i}" aria-label="Show photo ${i + 1} of ${p.photos.length}" aria-pressed="${i === idx}"><img src="${esc(f.thumb)}" alt="" loading="lazy"></button>`).join("");
   }
   if (v === "tour") {
     note.innerHTML = `<span>3D tour · drag to look around.</span><a href="${esc(p.tourUrl)}" target="_blank" rel="noopener noreferrer">Open in a new tab ↗</a>`;
     stage.innerHTML = "";
     if (!tour) return fail("This tour opens on the provider's website.");
     if (!webgl()) return fail("This browser can't show 3D content (WebGL is off or unsupported).");
     if (!navigator.onLine) return fail("You appear to be offline. The 3D tour needs a connection.", true);
     stage.innerHTML = `<iframe src="${esc(tour)}" title="3D tour of ${esc(p.title)}" allow="fullscreen; xr-spatial-tracking" allowfullscreen></iframe>`;
     timer = setTimeout(() => fail("The 3D tour is taking longer than usual to load.", true), 20000);
     $("iframe", stage).addEventListener("load", () => { clearTimeout(timer); $(".stage-msg", stage)?.remove(); });
   }
   if (v === "aerial") {
     stage.innerHTML = `<img src="${esc(p.aerial.src)}" alt="${esc(p.aerial.alt)}">`;
     note.innerHTML = `<span>Aerial view</span>`;
   }
   ```
   y declara `let idx = 0;` junto a `let timer;`.
10. Sustituye el listener `stage.addEventListener("click", …)` (el que maneja `[data-retry]` y la leyenda) por:
   ```js
   stage.addEventListener("click", e => { if (e.target.closest("[data-retry]")) show("tour"); });
   $("#thumbs").addEventListener("click", e => {
     const b = e.target.closest("[data-i]"); if (!b) return;
     idx = +b.dataset.i; show("photo"); $(`#thumbs [data-i="${idx}"]`).focus();
   });
   ```

- [ ] **Step 10: `site/index.html`: navegación y carga de datos**

1. En `route()`: `/^#\/p\/([0-9a-f]{8})$/` → `/^#\/p\/(HE-[A-Z]\d{3,})$/`.
2. Sustituye el bloque desde `Promise.allSettled([getJSON("data/properties.json"), …` hasta el final del `.catch(…)` por:
   ```js
   const arr = v => (Array.isArray(v) ? v.filter(x => typeof x === "string") : []);
   Promise.allSettled([getJSON("/api/listings"), getJSON("data/team.json"), getJSON("/api/config")]).then(([p, t, c]) => {
     if (p.status !== "fulfilled" || !Array.isArray(p.value)) throw p.reason || new Error("bad data");
     TS_KEY = c.status === "fulfilled" && typeof c.value?.turnstileSiteKey === "string" ? c.value.turnstileSiteKey : null;
     const order = {jersey: 0, uk: 1, international: 2};
     PROPS = p.value.filter(x => x && /^HE-[A-Z]\d{3,}$/.test(x.id) && x.title && x.region in order && x.operation in OP_ONE)
       .map(x => ({...x, ...Object.fromEntries(["beds", "baths", "salePrice", "rent", "premium"].map(k => [k, Number.isFinite(x[k]) ? x[k] : null])),
         use: x.use === "commercial" ? "commercial" : "residential", image: safeMedia(x.image), thumb: safeMedia(x.thumb),
         photos: (Array.isArray(x.photos) ? x.photos : []).filter(f => safeMedia(f?.src) && safeMedia(f?.thumb)),
         floorplans: (Array.isArray(x.floorplans) ? x.floorplans : []).filter(f => safeMedia(f?.src)),
         aerial: x.aerial && safeMedia(x.aerial.src) ? x.aerial : null, tourUrl: safeHttps(x.tourUrl),
         specs: (Array.isArray(x.specs) ? x.specs : []).filter(s => s && typeof s.label === "string" && typeof s.value === "string"),
         summary: arr(x.summary), description: arr(x.description)}))
       .sort((a, b) => order[a.region] - order[b.region] || (a.use === "commercial") - (b.use === "commercial"));
     PUB = PROPS.filter(x => x.image); // without a public photo a listing stays out of the public pages
     TEAM = (t.status === "fulfilled" && Array.isArray(t.value) ? t.value : []).filter(a => a && a.name)
       .map(a => ({...a, photo: safeUrl(a.photo, IMG_HOST)}));
     if (!PUB.length) throw new Error("no listings");
     route();
   }).catch(() => {
     $("#app").innerHTML = `<div class="wrap empty" style="margin-block:80px" role="alert"><p>We couldn't load our properties right now.</p>
       <button class="btn ghost" type="button" onclick="location.reload()">Try again</button></div>`;
   });
   ```
3. Comprueba que no queda ninguna referencia a lo eliminado:
   ```bash
   grep -nE "DEMO|PLOT|TOUR\b|droneView|wix\(p\.|wix\(feat|captured|snapshot|Illustrative|demo|Demo|SRC_HOST|source\.url|notes" site/index.html
   ```
   Esperado: sin resultados, salvo `wix(t.photo…` / `wix(agent.photo…` (las fotos del equipo siguen en Wix y son reales).

- [ ] **Step 11: `site/_headers` y borrado de archivos del demo**

`site/_headers`:
```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/admin/*
  X-Frame-Options: DENY
  X-Robots-Tag: noindex
```

```bash
git rm site/data/properties.json site/img/aerial-demo.jpg scrape.py
```

- [ ] **Step 12: Verificación manual con datos locales**

📍 Terminal A (`/root/HamptonJersey`): `npx wrangler pages dev --port 8788`. Abre `http://localhost:8788/` (por túnel o Playwright).
Esperado:
- Las tarjetas muestran fichas `HE-…`; sin fotos todavía (el R2 local está vacío) se ve el gris de "sin imagen".
- No aparece la cinta ni la columna "Demo".
- Un hash `#/p/HE-R001` abre la ficha.
- La consola del navegador no muestra errores de JS.

La prueba completa con fotos y envío de solicitudes la hace la Tarea 13.

- [ ] **Step 13: Commit**

```bash
git add site tests/lib.test.js
git commit -m "Serve real listings from the API and remove invented demo content"
```

---

### Tarea 8: Panel — base, login y usuarios

**Files:**
- Create: `admin/vite.config.mjs`, `admin/index.html`, `admin/src/main.jsx`, `admin/src/firebase.js`, `admin/src/api.js`, `admin/src/format.js`, `admin/src/App.jsx`, `admin/src/Login.jsx`, `admin/src/Users.jsx`, `admin/src/styles.css`

**Interfaces:**
- Consumes: `/api/session`, `/api/me`, `/api/admin/users`.
- Produces:
  - Cliente de la API: `api(path, {method, body, form}) → Promise<data>`. Lanza `ApiError {status, message, data}`; un 401 emite el evento `window` `hs:signed-out`.
  - `format.js`:
    - Etiquetas: `AVAILABILITY`, `OPERATION`, `USE`, `KIND`, `STATUS_LABEL`
    - Funciones: `priceText(row)`, `fmtDate(iso)`, `safeHref(url)`
  - Rutas hash del panel:
    - `#/` → `Listings`
    - `#/p/<id>` → `ListingEditor`
    - `#/solicitudes` → `Viewings`
    - `#/usuarios` → `Users`
  - Los componentes `Listings`, `ListingEditor` y `Viewings` se crean en las Tareas 9–12. En esta tarea `App.jsx` los importa desde archivos provisionales de una línea, que esas tareas sustituyen.

- [ ] **Step 1: `admin/vite.config.mjs` e `admin/index.html`**

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Built into site/admin and served by Pages next to the API (same origin, no CORS, no dev proxy).
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/admin/",
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL("../site/admin", import.meta.url)), emptyOutDir: true },
});
```

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Panel · Hampton Estates</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tenor+Sans&family=Montserrat:wght@400;500;600&display=swap">
</head>
<body><div id="root"></div><script type="module" src="./src/main.jsx"></script></body>
</html>
```

- [ ] **Step 2: `main.jsx`, `firebase.js`, `api.js`, `format.js`**

`admin/src/main.jsx`:
```jsx
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
```

`admin/src/firebase.js`:
```js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

// Public web config (not a secret). Firebase is used only to obtain a Google ID token;
// the server verifies it and issues its own session cookie.
const app = initializeApp({
  apiKey: "AIzaSyC9b93limwBk0cyDU3MEEu-9QKk1ubjLGo",
  authDomain: "hamptonestatesjersey.firebaseapp.com",
  projectId: "hamptonestatesjersey",
  appId: "1:760161138036:web:f94005452426188f946821",
});
const auth = getAuth(app);

export async function googleIdToken() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const { user } = await signInWithPopup(auth, provider);
  return user.getIdToken();
}
export const firebaseSignOut = () => signOut(auth);
```

`admin/src/api.js`:
```js
export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data; }
}

export async function api(path, { method = "GET", body, form } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method, credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch { throw new ApiError(0, "Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo."); }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== "/session") window.dispatchEvent(new Event("hs:signed-out"));
    throw new ApiError(res.status, data?.error || `Error ${res.status}`, data);
  }
  return data;
}
```

`admin/src/format.js`:
```js
export const AVAILABILITY = { for_sale: "En venta", under_offer: "Oferta aceptada", sold: "Vendida", to_let: "En alquiler",
  lease: "Arrendamiento", not_stated: "Sin indicar", withdrawn: "Retirada" };
export const OPERATION = { sale: "Venta", rent: "Alquiler", business: "Traspaso / negocio" };
export const USE = { residential: "Residencial", commercial: "Comercial" };
export const KIND = { photo: "Foto", floorplan: "Plano", aerial: "Aérea", document: "Documento" };
export const STATUS_LABEL = { published: "Publicada", draft: "Borrador", archived: "Archivada" };
export const stateOf = l => (l.archived_at ? "archived" : l.published ? "published" : "draft");

const SYM = { GBP: "£", EUR: "€" };
export function priceText(l) {
  const a = { sale: l.sale_price, rent: l.rent, business: l.premium }[l.operation];
  if (a == null) return l.price_text || "—";
  const per = l.operation === "rent" ? (l.rent_period === "year" ? " /año" : " /mes") : "";
  return `${SYM[l.currency] ?? ""}${Math.round(a).toLocaleString("en-GB")}${per}`;
}
export const fmtDate = iso => (iso ? new Date(iso).toLocaleString("es-ES",
  { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const safeHref = u => (/^https?:\/\//i.test(u || "") ? u : undefined);
```

- [ ] **Step 3: `App.jsx` y `Login.jsx`**

`admin/src/App.jsx`:
```jsx
import { useEffect, useState } from "react";
import { api } from "./api.js";
import { firebaseSignOut } from "./firebase.js";
import Login from "./Login.jsx";
import Listings from "./Listings.jsx";
import ListingEditor from "./ListingEditor.jsx";
import Viewings from "./Viewings.jsx";
import Users from "./Users.jsx";

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return hash;
}

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = checking, null = signed out
  const [expired, setExpired] = useState(false);
  const hash = useHash();
  useEffect(() => {
    api("/me").then(d => setMe(d.email), () => setMe(null));
    const f = () => setExpired(true);
    addEventListener("hs:signed-out", f);
    return () => removeEventListener("hs:signed-out", f);
  }, []);

  const signedIn = email => { setMe(email); setExpired(false); };
  if (me === undefined) return <p className="center">Cargando…</p>;
  if (me === null) return <main className="center"><Login onSignedIn={signedIn} /></main>;

  const [section, arg] = hash.replace(/^#\/?/, "").split("/");
  const page = section === "p" && arg ? <ListingEditor key={arg} id={decodeURIComponent(arg)} />
    : section === "solicitudes" ? <Viewings /> : section === "usuarios" ? <Users me={me} /> : <Listings />;
  const current = section === "solicitudes" || section === "usuarios" ? section : "";
  const logout = async () => {
    await api("/session", { method: "DELETE" }).catch(() => {});
    await firebaseSignOut().catch(() => {});
    setMe(null);
  };
  return <>
    <header className="bar">
      <a href="#/" className="brand">Hampton Estates · Panel</a>
      <nav aria-label="Secciones">
        <a href="#/" aria-current={current === "" ? "page" : undefined}>Propiedades</a>
        <a href="#/solicitudes" aria-current={current === "solicitudes" ? "page" : undefined}>Solicitudes</a>
        <a href="#/usuarios" aria-current={current === "usuarios" ? "page" : undefined}>Usuarios</a>
      </nav>
      <span className="who">{me}</span>
      <button type="button" className="btn ghost sm" onClick={logout}>Salir</button>
    </header>
    <main className="page">{page}</main>
    {/* Session expired mid-task: sign in again on top of the page so nothing typed is lost. */}
    {expired && <div className="modal" role="dialog" aria-modal="true" aria-label="Sesión caducada">
      <Login title="Tu sesión ha caducado" note="Vuelve a entrar; lo que estabas editando sigue aquí." onSignedIn={signedIn} />
    </div>}
  </>;
}
```

`admin/src/Login.jsx`:
```jsx
import { useState } from "react";
import { googleIdToken, firebaseSignOut } from "./firebase.js";
import { api } from "./api.js";

export default function Login({ onSignedIn, title = "Panel de Hampton Estates", note = "Entra con tu cuenta de Google autorizada." }) {
  const [state, setState] = useState({});
  const go = async () => {
    setState({ busy: true });
    try {
      const idToken = await googleIdToken();
      const { email } = await api("/session", { method: "POST", body: { idToken } });
      onSignedIn(email);
    } catch (e) {
      if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return setState({});
      if (e.status === 403) { await firebaseSignOut().catch(() => {}); return setState({ denied: true }); }
      setState({ error: e.status != null ? e.message
        : "No se pudo abrir el acceso con Google. Permite las ventanas emergentes para este sitio e inténtalo de nuevo." });
    }
  };
  return <section className="card login" aria-labelledby="login-title">
    <h1 id="login-title">{title}</h1>
    {state.denied ? <>
      <p role="alert">Esta cuenta no tiene acceso. Pide a un administrador que añada tu email.</p>
      <button type="button" className="btn" onClick={() => setState({})}>Salir</button>
    </> : <>
      <p>{note}</p>
      <button type="button" className="btn" onClick={go} disabled={state.busy}>{state.busy ? "Entrando…" : "Entrar con Google"}</button>
      {state.error && <p role="alert" className="err">{state.error}</p>}
    </>}
  </section>;
}
```

- [ ] **Step 4: `Users.jsx`**

```jsx
import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";

export default function Users({ me }) {
  const [users, setUsers] = useState(null), [email, setEmail] = useState(""), [msg, setMsg] = useState(null);
  const load = () => api("/admin/users").then(d => setUsers(d.users), e => setMsg({ text: e.message }));
  useEffect(() => { load(); }, []);
  const add = async e => {
    e.preventDefault();
    try { await api("/admin/users", { method: "POST", body: { email } }); setMsg({ ok: true, text: `${email.trim()} ya puede entrar.` }); setEmail(""); load(); }
    catch (err) { setMsg({ text: err.message }); }
  };
  const remove = async u => {
    if (!confirm(`¿Quitar el acceso a ${u}?`)) return;
    try { await api(`/admin/users/${encodeURIComponent(u)}`, { method: "DELETE" }); setMsg({ ok: true, text: `${u} ya no tiene acceso.` }); load(); }
    catch (err) { setMsg({ text: err.message }); }
  };
  return <section aria-labelledby="t-users">
    <h1 id="t-users">Usuarios con acceso</h1>
    <form className="inline" onSubmit={add}>
      <label htmlFor="new-email">Email de Google</label>
      <input id="new-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@gmail.com" />
      <button className="btn">Dar acceso</button>
    </form>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    {!users ? <p>Cargando…</p> : <table className="list">
      <thead><tr><th scope="col">Email</th><th scope="col">Añadido</th><th scope="col"><span className="sr">Acciones</span></th></tr></thead>
      <tbody>{users.map(u => <tr key={u.email}>
        <td>{u.email}{u.email === me && <span className="muted"> (tú)</span>}</td>
        <td className="muted">{fmtDate(u.added_at)} · {u.added_by}</td>
        <td>{u.email !== me && <button type="button" className="btn ghost sm danger" onClick={() => remove(u.email)}>Quitar acceso</button>}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}
```

- [ ] **Step 5: Componentes provisionales (las Tareas 9–12 los sustituyen)**

`admin/src/Listings.jsx`: `export default function Listings() { return <p>Propiedades</p>; }`
`admin/src/ListingEditor.jsx`: `export default function ListingEditor({ id }) { return <p>{id}</p>; }`
`admin/src/Viewings.jsx`: `export default function Viewings() { return <p>Solicitudes</p>; }`

- [ ] **Step 6: `admin/src/styles.css`**

```css
:root{--ink:#141414;--stone:#6b665e;--mist:#f2efe9;--line:#e2ddd4;--bronze:#8a6a3b;--ok:#1f6b3a;--err:#a32020;--paper:#fff;
  --display:"Tenor Sans",Georgia,serif;--body:Montserrat,system-ui,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--mist);color:var(--ink);font:14px/1.5 var(--body)}
h1,h2,h3{font-family:var(--display);font-weight:400;margin:0 0 12px}
h1{font-size:26px} h2{font-size:19px}
a{color:var(--ink)} a:hover{color:var(--bronze)}
:focus-visible{outline:2px solid var(--bronze);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.center{min-height:100vh;display:grid;place-items:center;padding:16px}
.bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;padding:12px 24px;background:var(--ink);color:#fff}
.bar a{color:#fff;text-decoration:none} .bar .brand{font-family:var(--display);letter-spacing:.12em;text-transform:uppercase;margin-right:auto}
.bar nav{display:flex;gap:16px} .bar nav a[aria-current=page]{border-bottom:2px solid var(--bronze)}
.bar .who{opacity:.75;font-size:12px}
.page{max-width:1240px;margin:0 auto;padding:24px 16px 120px}
.card{background:var(--paper);border:1px solid var(--line);padding:24px}
.login{max-width:420px;width:100%;display:grid;gap:12px}
.btn{font:600 12px var(--body);letter-spacing:.08em;text-transform:uppercase;background:var(--ink);color:#fff;border:1px solid var(--ink);padding:10px 16px;cursor:pointer}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn.ghost{background:transparent;color:var(--ink)} .btn.sm{padding:6px 10px;font-size:11px}
.btn.danger,.danger{color:var(--err);border-color:var(--err)}
.bar .btn.ghost{color:#fff;border-color:#fff}
.err{color:var(--err)} .ok{color:var(--ok)} .muted{color:var(--stone);font-size:12px}
.head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.seg{display:flex;flex-wrap:wrap;gap:0;margin:8px 0 12px;border:1px solid var(--line);width:fit-content;background:var(--paper)}
.seg button{all:unset;cursor:pointer;padding:8px 14px} .seg button[aria-pressed=true]{background:var(--ink);color:#fff}
.seg .count{opacity:.7;margin-left:4px}
.filters,.inline{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-bottom:12px}
label{display:grid;gap:4px;font-size:12px;color:var(--stone)}
input,select,textarea{font:14px var(--body);color:var(--ink);background:#fff;border:1px solid var(--line);padding:8px 10px;min-width:0}
input[aria-invalid=true],select[aria-invalid=true],textarea[aria-invalid=true]{border-color:var(--err)}
textarea{min-height:120px;resize:vertical;width:100%}
table.list{width:100%;border-collapse:collapse;background:var(--paper);border:1px solid var(--line)}
.list th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--stone);padding:10px 12px;border-bottom:1px solid var(--line)}
.list td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle}
.thumb{width:72px;height:54px;object-fit:cover;display:block;background:var(--mist)}
.badge{font-size:11px;padding:3px 8px;border:1px solid currentColor;white-space:nowrap}
.badge.published{color:var(--ok)} .badge.draft{color:var(--stone)} .badge.archived{color:var(--bronze)}
.num{font-variant-numeric:tabular-nums}
.empty{padding:32px;text-align:center;color:var(--stone)}
.modal{position:fixed;inset:0;z-index:20;background:rgba(20,20,20,.55);display:grid;place-items:center;padding:16px}
@media (max-width:760px){.list thead{display:none}.list tr{display:grid;grid-template-columns:72px 1fr;gap:4px 12px;padding:10px}.list td{border:0;padding:0}.list td:first-child{grid-row:span 6}}
```

- [ ] **Step 7: Compilar**

Run: `npm run build`
Esperado: `✓ built in …`, y existe `site/admin/index.html`.

- [ ] **Step 8: Comprobación local**

📍 Terminal A: `npx wrangler pages dev --port 8788`. Abre `http://localhost:8788/admin/`.
Esperado: tarjeta "Panel de Hampton Estates" con el botón "Entrar con Google" y la consola sin errores. El login real se prueba en la Tarea 14; la sesión simulada, en la Tarea 13.

- [ ] **Step 9: Commit**

```bash
git add admin
git commit -m "Add admin panel shell with Google sign-in and user management"
```

---

### Tarea 9: Panel — listado de propiedades

**Files:**
- Modify: `admin/src/Listings.jsx` (sustituye el provisional), `admin/src/styles.css` (añadir al final)

**Interfaces:**
- Consumes: `GET /api/admin/listings`, `POST /api/admin/listings`; `api`, `AVAILABILITY`, `OPERATION`, `USE`, `STATUS_LABEL`, `stateOf`, `priceText` y `fmtDate` de `format.js`.
- Produces: la ruta `#/` y la creación de borradores (navega a `#/p/<nuevo id>`).

- [ ] **Step 1: Escribir `admin/src/Listings.jsx`**

```jsx
import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { AVAILABILITY, OPERATION, USE, STATUS_LABEL, stateOf, priceText, fmtDate } from "./format.js";

const TABS = [["published", "Publicadas"], ["draft", "Borradores"], ["archived", "Archivadas"], ["all", "Todas"]];
const REGIONS = { jersey: "Jersey", uk: "Reino Unido", international: "Internacional" };
const regionOf = c => (c === "Jersey" ? "jersey" : c === "United Kingdom" ? "uk" : "international");

export default function Listings() {
  const [rows, setRows] = useState(null), [error, setError] = useState(null), [creating, setCreating] = useState(false);
  const [tab, setTab] = useState("published"), [q, setQ] = useState(""), [use, setUse] = useState(""),
    [region, setRegion] = useState(""), [avail, setAvail] = useState("");
  useEffect(() => { api("/admin/listings").then(d => setRows(d.listings), e => setError(e.message)); }, []);
  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) =>
    [k, (rows || []).filter(l => k === "all" || stateOf(l) === k).length])), [rows]);
  if (error) return <p role="alert" className="err">{error}</p>;
  if (!rows) return <p>Cargando propiedades…</p>;
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(l => (tab === "all" || stateOf(l) === tab) && (!use || l.use === use)
    && (!region || regionOf(l.country) === region) && (!avail || l.availability === avail)
    && (!needle || `${l.id} ${l.title} ${l.location ?? ""}`.toLowerCase().includes(needle)));

  return <section aria-labelledby="t-props">
    <div className="head"><h1 id="t-props">Propiedades</h1>
      <button type="button" className="btn" onClick={() => setCreating(true)}>Nueva propiedad</button></div>
    {creating && <NewListing onClose={() => setCreating(false)} />}
    <div className="seg" role="group" aria-label="Estado">{TABS.map(([k, t]) =>
      <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{t}<span className="count">{counts[k]}</span></button>)}</div>
    <div className="filters">
      <label>Buscar<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Título, HE-R001 o localidad" /></label>
      <label>Uso<select value={use} onChange={e => setUse(e.target.value)}><option value="">Todos</option>
        {Object.entries(USE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Región<select value={region} onChange={e => setRegion(e.target.value)}><option value="">Todas</option>
        {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Disponibilidad<select value={avail} onChange={e => setAvail(e.target.value)}><option value="">Todas</option>
        {Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    </div>
    <p className="muted" aria-live="polite">{shown.length} {shown.length === 1 ? "propiedad" : "propiedades"}</p>
    {shown.length ? <table className="list">
      <thead><tr><th scope="col"><span className="sr">Foto</span></th><th scope="col">Propiedad</th><th scope="col">Ubicación</th>
        <th scope="col">Precio</th><th scope="col">Disponibilidad</th><th scope="col">Visibilidad</th><th scope="col">Última edición</th></tr></thead>
      <tbody>{shown.map(l => <tr key={l.id}>
        <td>{l.cover_id ? <img className="thumb" src={`/media/${l.cover_id}?thumb`} alt="" loading="lazy" /> : <span className="thumb" />}</td>
        <td><a href={`#/p/${l.id}`}>{l.title}</a><div className="muted">{l.id} · {OPERATION[l.operation]}</div></td>
        <td>{l.location || l.country || "—"}</td>
        <td className="num">{priceText(l)}</td>
        <td>{AVAILABILITY[l.availability]}</td>
        <td><span className={`badge ${stateOf(l)}`}>{STATUS_LABEL[stateOf(l)]}</span></td>
        <td className="muted">{fmtDate(l.updated_at)}<br />{l.updated_by}</td>
      </tr>)}</tbody>
    </table> : <p className="empty">No hay propiedades con estos filtros.</p>}
  </section>;
}

function NewListing({ onClose }) {
  const [f, setF] = useState({ title: "", use: "residential", operation: "sale", availability: "for_sale", country: "Jersey" });
  const [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const { id } = await api("/admin/listings", { method: "POST", body: f }); location.hash = `#/p/${id}`; }
    catch (x) { setErr(x.data?.fields ? Object.entries(x.data.fields).map(([k, v]) => `${k}: ${v}`).join(". ") : x.message); setBusy(false); }
  };
  return <form className="card new" onSubmit={submit} aria-labelledby="t-new">
    <h2 id="t-new">Nueva propiedad (borrador)</h2>
    <label>Título<input required maxLength={200} value={f.title} onChange={set("title")} autoFocus /></label>
    <div className="filters">
      <label>Uso<select value={f.use} onChange={set("use")}>{Object.entries(USE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Operación<select value={f.operation} onChange={set("operation")}>{Object.entries(OPERATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Disponibilidad<select value={f.availability} onChange={set("availability")}>{Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>País<input value={f.country} onChange={set("country")} maxLength={100} /></label>
    </div>
    {err && <p role="alert" className="err">{err}</p>}
    <div className="filters"><button className="btn" disabled={busy}>{busy ? "Creando…" : "Crear borrador"}</button>
      <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
  </form>;
}
```

- [ ] **Step 2: Añadir a `admin/src/styles.css`**

```css
.new{display:grid;gap:12px;margin-bottom:16px}
```

- [ ] **Step 3: Compilar** — `npm run build`. Esperado: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add admin/src/Listings.jsx admin/src/styles.css
git commit -m "Add admin listings table with tabs, search, filters and draft creation"
```

---

### Tarea 10: Panel — editor de ficha e investigación

**Files:**
- Modify: `admin/src/ListingEditor.jsx` (sustituye el provisional), `admin/src/styles.css` (añadir al final)
- Create: `admin/src/Research.jsx`, `admin/src/MediaManager.jsx` (provisional; la Tarea 11 lo sustituye)

**Interfaces:**
- Consumes:
  - `GET/PUT/DELETE /api/admin/listings/:id`
  - `POST /api/admin/listings/:id/(publish|unpublish|archive|restore)`
  - Las etiquetas y funciones de `format.js`.
- Produces:
  - `MediaManager` recibe las props `{listingId, media, coverId, onChange(media, coverId)}` (Tarea 11).
  - `Research` recibe las props `{data}`.

- [ ] **Step 1: `admin/src/MediaManager.jsx` provisional**

```jsx
export default function MediaManager({ media }) { return <p>{media.length} archivos</p>; }
```

- [ ] **Step 2: Escribir `admin/src/Research.jsx`**

```jsx
import { safeHref } from "./format.js";

const Table = ({ rows, cols, caption }) => rows.length ? <table className="list small">
  <caption>{caption}</caption>
  <thead><tr>{cols.map(([k, t]) => <th key={k} scope="col">{t}</th>)}</tr></thead>
  <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(([k]) => <td key={k}>{k === "title"
    ? (safeHref(r.url) ? <a href={safeHref(r.url)} target="_blank" rel="noopener noreferrer">{r.title || r.url}</a> : r.title)
    : r[k] ?? "—"}</td>)}</tr>)}</tbody>
</table> : null;

export default function Research({ data }) {
  const r = data.research;
  if (!r) return <p className="muted">Esta ficha no viene de la investigación.</p>;
  const facts = [["Coincidencia", r.match_status], ["Confianza", r.match_confidence], ["Motivo", r.match_reason],
    ["Evidencia publicitaria", r.advertising_evidence_class], ["Qué falta", r.missing_information], ["Siguiente acción", r.next_action],
    ["Base de la evidencia", r.evidence_basis], ["Fecha de investigación", r.research_date]].filter(([, v]) => v);
  return <div className="research">
    <dl className="kv">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {data.issues.length > 0 && <><h3>Issues ({data.issues.length})</h3><ul className="issues">{data.issues.map(i =>
      <li key={i.issue_id}><b>{i.severity}</b> · {i.field}: {i.issue}{i.proposed_action && <div className="muted">→ {i.proposed_action}</div>}</li>)}</ul></>}
    <Table caption="Fuentes" rows={data.sources} cols={[["title", "Fuente"], ["origin", "Origen"], ["source_type", "Tipo"], ["observed_status", "Estado visto"], ["price_text", "Precio visto"], ["source_date", "Fecha"]]} />
    <Table caption="Datos (facts)" rows={data.facts} cols={[["field", "Campo"], ["value", "Valor"], ["confidence", "Confianza"], ["origin", "Origen"]]} />
    <Table caption="Términos financieros" rows={data.terms} cols={[["term_type", "Tipo"], ["amount", "Importe"], ["currency", "Moneda"], ["period", "Periodo"], ["qualifier", "Matiz"]]} />
    <details><summary>Búsquedas realizadas ({data.searches.length})</summary>
      <Table caption="Búsquedas" rows={data.searches} cols={[["date", "Fecha"], ["query", "Consulta"], ["outcome", "Resultado"]]} /></details>
  </div>;
}
```

- [ ] **Step 3: Escribir `admin/src/ListingEditor.jsx`**

```jsx
import { useEffect, useState } from "react";
import { api } from "./api.js";
import { AVAILABILITY, OPERATION, USE, STATUS_LABEL, stateOf, fmtDate, safeHref } from "./format.js";
import MediaManager from "./MediaManager.jsx";
import Research from "./Research.jsx";

const FIELDS = ["title", "use", "property_type", "operation", "availability", "country", "location", "road_name", "bedrooms",
  "bathrooms", "tenure", "sale_price", "rent", "rent_period", "premium", "currency", "price_text", "summary", "description",
  "tour_url", "specs"];
const NUMERIC = ["bedrooms", "bathrooms", "sale_price", "rent", "premium"];
const toForm = l => Object.fromEntries(FIELDS.map(k => [k, k === "specs" ? l.specs : l[k] ?? ""]));
const toBody = f => Object.fromEntries(FIELDS.map(k => [k,
  NUMERIC.includes(k) ? (f[k] === "" ? null : Number(f[k]))
    : k === "specs" ? f.specs.filter(s => s.label.trim() || s.value.trim())
    : f[k] === "" ? null : f[k]]));
const SECTIONS = [["datos", "Datos"], ["precio", "Precio"], ["descripcion", "Descripción"], ["fotos", "Fotos"],
  ["tour", "Tour y especificación"], ["investigacion", "Investigación"]];
const DONE = { publish: "Publicada: ya se ve en la web (puede tardar 1 minuto).", unpublish: "Despublicada: ya no se ve en la web.",
  archive: "Archivada. Puedes restaurarla desde Archivadas.", restore: "Restaurada como borrador." };

export default function ListingEditor({ id }) {
  const [data, setData] = useState(null), [form, setForm] = useState(null), [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [loadErr, setLoadErr] = useState(null), [confirmDel, setConfirmDel] = useState("");
  const load = () => api(`/admin/listings/${id}`).then(d => { setData(d); setForm(toForm(d.listing)); setErrors({}); }, e => setLoadErr(e.message));
  useEffect(() => { load(); }, [id]);
  const dirty = !!data && !!form && JSON.stringify(toBody(form)) !== JSON.stringify(toBody(toForm(data.listing)));
  useEffect(() => {
    const f = e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", f);
    return () => removeEventListener("beforeunload", f);
  }, [dirty]);

  if (loadErr) return <p role="alert" className="err">{loadErr} · <a href="#/">Volver al listado</a></p>;
  if (!data) return <p>Cargando ficha…</p>;
  const l = data.listing, state = stateOf(l);
  const setListing = listing => { setData(d => ({ ...d, listing })); setForm(toForm(listing)); setErrors({}); };

  const save = async () => {
    setBusy(true); setMsg(null);
    try { setListing((await api(`/admin/listings/${id}`, { method: "PUT", body: { ...toBody(form), updated_at: l.updated_at } })).listing); setMsg({ ok: true, text: "Cambios guardados." }); }
    catch (e) { setErrors(e.data?.fields || {}); setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  const act = async action => {
    if (action === "archive" && !confirm("¿Archivar esta ficha? Saldrá de la web; podrás restaurarla.")) return;
    setBusy(true); setMsg(null);
    try { setListing((await api(`/admin/listings/${id}/${action}`, { method: "POST" })).listing); setMsg({ ok: true, text: DONE[action] }); }
    catch (e) { setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  const destroy = async e => {
    e.preventDefault(); setBusy(true);
    try { await api(`/admin/listings/${id}`, { method: "DELETE", body: { confirm: confirmDel } }); location.hash = "#/"; }
    catch (x) { setMsg({ text: x.message }); setBusy(false); }
  };

  const ctl = (k, extra = {}) => ({
    id: `f-${k}`, value: form[k], "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `e-${k}` : undefined,
    onChange: e => setForm(f => ({ ...f, [k]: e.target.value })), ...extra });
  const field = (k, label, input) => <div className="field" key={k}><label htmlFor={`f-${k}`}>{label}</label>{input}
    {errors[k] && <small id={`e-${k}`} className="err">{errors[k]}</small>}</div>;
  const options = obj => Object.entries(obj).map(([k, v]) => <option key={k} value={k}>{v}</option>);
  const publicPhoto = data.media.some(m => m.public && m.kind === "photo" && m.r2_key && m.origin !== "external");
  const cover = data.media.find(m => m.id === l.cover_media_id) || data.media.find(m => m.kind === "photo" && m.r2_key);

  return <div className="editor">
    <aside className="side card">
      {cover ? <img src={`/media/${cover.id}?thumb`} alt="" /> : <div className="thumb big" />}
      <h1>{l.title}</h1>
      <p className="muted">{l.id} · <span className={`badge ${state}`}>{STATUS_LABEL[state]}</span></p>
      <p className="muted">Editada {fmtDate(l.updated_at)} por {l.updated_by}</p>
      {l.published === 1 && !publicPhoto && <p className="warn" role="note">Publicada, pero sin foto pública: no aparece en la web hasta que tenga una.</p>}
      {data.duplicates.length > 0 && <p className="warn" role="note">Posible duplicado de {data.duplicates.map((d, i) =>
        <span key={d}>{i ? ", " : ""}<a href={`#/p/${d}`}>{d}</a></span>)} según la investigación.</p>}
      <nav aria-label="Secciones de la ficha">{SECTIONS.map(([k, t]) =>
        <button key={k} type="button" className="linkish" onClick={() => document.getElementById(`s-${k}`).scrollIntoView({ behavior: "smooth" })}>{t}</button>)}</nav>
      <a href="#/">← Volver al listado</a>
    </aside>

    <div className="sections">
      <section id="s-datos" className="card" aria-labelledby="h-datos"><h2 id="h-datos">Datos</h2><div className="grid2">
        {field("title", "Título", <input {...ctl("title")} maxLength={200} required />)}
        {field("property_type", "Tipo (casa, piso, restaurante…)", <input {...ctl("property_type")} maxLength={100} />)}
        {field("use", "Uso", <select {...ctl("use")}>{options(USE)}</select>)}
        {field("operation", "Operación", <select {...ctl("operation")}>{options(OPERATION)}</select>)}
        {field("availability", "Disponibilidad", <select {...ctl("availability")}>{options(AVAILABILITY)}</select>)}
        {field("tenure", "Tenencia", <input {...ctl("tenure")} maxLength={100} />)}
        {field("country", "País", <input {...ctl("country")} maxLength={100} />)}
        {field("location", "Localidad", <input {...ctl("location")} maxLength={200} />)}
        {field("road_name", "Calle", <input {...ctl("road_name")} maxLength={200} />)}
        {field("bedrooms", "Dormitorios", <input {...ctl("bedrooms")} type="number" min="0" max="100" step="1" inputMode="numeric" />)}
        {field("bathrooms", "Baños", <input {...ctl("bathrooms")} type="number" min="0" max="100" step="1" inputMode="numeric" />)}
      </div></section>

      <section id="s-precio" className="card" aria-labelledby="h-precio"><h2 id="h-precio">Precio</h2>
        <p className="muted">Deja vacío lo que no se conozca: nunca se muestra 0. Venta, alquiler y premium no se mezclan.</p><div className="grid2">
        {form.operation === "sale" && field("sale_price", "Precio de venta", <input {...ctl("sale_price")} type="number" min="1" step="any" />)}
        {form.operation === "rent" && field("rent", "Alquiler", <input {...ctl("rent")} type="number" min="1" step="any" />)}
        {form.operation === "rent" && field("rent_period", "Periodo", <select {...ctl("rent_period")}><option value="">—</option><option value="month">Al mes</option><option value="year">Al año</option></select>)}
        {form.operation === "business" && field("premium", "Premium del negocio", <input {...ctl("premium")} type="number" min="1" step="any" />)}
        {field("currency", "Moneda", <select {...ctl("currency")}><option value="">—</option><option value="GBP">GBP £</option><option value="EUR">EUR €</option></select>)}
        {field("price_text", "Texto mostrado (si no hay importe)", <input {...ctl("price_text")} maxLength={200} placeholder="p. ej. Negotiable" />)}
      </div></section>

      <section id="s-descripcion" className="card" aria-labelledby="h-desc"><h2 id="h-desc">Descripción</h2>
        {field("summary", "Resumen (una viñeta por línea)", <textarea {...ctl("summary")} maxLength={5000} />)}
        {field("description", "Descripción larga (un párrafo por línea)", <textarea {...ctl("description")} maxLength={20000} rows={10} />)}
      </section>

      <section id="s-fotos" className="card" aria-labelledby="h-fotos"><h2 id="h-fotos">Fotos</h2>
        <MediaManager listingId={id} media={data.media} coverId={l.cover_media_id}
          onChange={(media, coverId) => setData(d => ({ ...d, media, listing: { ...d.listing, cover_media_id: coverId } }))} />
      </section>

      <section id="s-tour" className="card" aria-labelledby="h-tour"><h2 id="h-tour">Tour y especificación</h2>
        {field("tour_url", "URL del tour 3D o vídeo (https://)", <input {...ctl("tour_url")} type="url" maxLength={500} placeholder="https://my.matterport.com/show/?m=…" />)}
        <p className="muted">Se incrusta si es de Matterport, Vimeo (player.vimeo.com) o YouTube (youtube-nocookie.com); otros se muestran como enlace. Usa solo tours vuestros o con permiso.</p>
        <h3>Especificación</h3>
        <Specs value={form.specs} onChange={specs => setForm(f => ({ ...f, specs }))} />
        {errors.specs && <p className="err">{errors.specs}</p>}
        {data.media.some(m => !m.r2_key && m.source_url) && <details><summary>Enlaces de referencia de la investigación (no publicables sin permiso)</summary>
          <ul>{data.media.filter(m => !m.r2_key && m.source_url).map(m => <li key={m.id}>
            <a href={safeHref(m.source_url)} target="_blank" rel="noopener noreferrer">{m.label || m.source_url}</a> · {m.provider}</li>)}</ul></details>}
      </section>

      <section id="s-investigacion" className="card" aria-labelledby="h-inv"><h2 id="h-inv">Investigación <span className="muted">(solo lectura)</span></h2>
        <Research data={data} />
      </section>
    </div>

    <div className="actionbar" role="region" aria-label="Acciones">
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
      <button type="button" className="btn" onClick={save} disabled={!dirty || busy}>{busy ? "Guardando…" : "Guardar"}</button>
      {state !== "archived" && <button type="button" className="btn ghost" disabled={dirty || busy} title={dirty ? "Guarda primero" : undefined}
        onClick={() => act(l.published ? "unpublish" : "publish")}>{l.published ? "Despublicar" : "Publicar"}</button>}
      {state !== "archived" && <button type="button" className="btn ghost" disabled={dirty || busy} onClick={() => act("archive")}>Archivar</button>}
      {state === "archived" && <button type="button" className="btn ghost" disabled={busy} onClick={() => act("restore")}>Restaurar</button>}
      {state === "archived" && <form className="inline" onSubmit={destroy}>
        <label htmlFor="del-confirm">Para borrar para siempre, escribe {l.id}</label>
        <input id="del-confirm" value={confirmDel} onChange={e => setConfirmDel(e.target.value)} autoComplete="off" />
        <button className="btn ghost danger" disabled={confirmDel !== l.id || busy}>Borrar definitivamente</button></form>}
      {dirty && <span className="muted">Cambios sin guardar</span>}
    </div>
  </div>;
}

function Specs({ value, onChange }) {
  const upd = (i, k, v) => onChange(value.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  return <div className="specs-ed">
    {value.map((s, i) => <div className="spec-row" key={i}>
      <input aria-label={`Grupo, fila ${i + 1}`} placeholder="Grupo (Interior…)" value={s.group} maxLength={60} onChange={e => upd(i, "group", e.target.value)} />
      <input aria-label={`Dato, fila ${i + 1}`} placeholder="Dato (Calefacción…)" value={s.label} maxLength={100} onChange={e => upd(i, "label", e.target.value)} />
      <input aria-label={`Valor, fila ${i + 1}`} placeholder="Valor" value={s.value} maxLength={300} onChange={e => upd(i, "value", e.target.value)} />
      <button type="button" className="btn ghost sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>Quitar<span className="sr"> fila {i + 1}</span></button>
    </div>)}
    <button type="button" className="btn ghost sm" onClick={() => onChange([...value, { group: "", label: "", value: "" }])}>Añadir fila</button>
  </div>;
}
```

- [ ] **Step 4: Añadir a `admin/src/styles.css`**

```css
.editor{display:grid;grid-template-columns:280px 1fr;gap:20px;align-items:start}
.side{position:sticky;top:72px;display:grid;gap:10px}
.side img,.thumb.big{width:100%;aspect-ratio:4/3;object-fit:cover;background:var(--mist)}
.side nav{display:grid;gap:4px}
.linkish{all:unset;cursor:pointer;color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.sections{display:grid;gap:16px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.field{display:grid;gap:4px}
.warn{background:#fff6e5;border-left:3px solid var(--bronze);padding:8px 10px;margin:0}
.actionbar{position:fixed;left:0;right:0;bottom:0;z-index:4;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 24px;background:var(--paper);border-top:1px solid var(--line)}
.actionbar p{margin:0;flex-basis:100%}
.spec-row{display:grid;grid-template-columns:1fr 1fr 2fr auto;gap:8px;margin-bottom:8px}
.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px 16px}
.kv dt{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--stone)} .kv dd{margin:0}
.list.small{font-size:13px;margin:12px 0} .list caption{text-align:left;font-family:var(--display);font-size:16px;padding:8px 0}
.issues{padding-left:18px}
@media (max-width:900px){.editor{grid-template-columns:1fr}.side{position:static}.spec-row{grid-template-columns:1fr}}
```

- [ ] **Step 5: Compilar** — `npm run build`. Esperado: `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add admin/src
git commit -m "Add admin listing editor with publish, archive, delete and research view"
```

---

### Tarea 11: Panel — gestor de fotos

**Files:**
- Modify: `admin/src/MediaManager.jsx` (sustituye el provisional), `admin/src/styles.css` (añadir al final)
- Create: `admin/src/image.js`

**Interfaces:**
- Consumes: `PUT/POST /api/admin/listings/:id/media`, `DELETE /api/admin/media/:id`; `KIND`, `safeHref`.
- Produces: `resizeImage(file, maxSide, quality?) → Promise<{blob, width, height}>`.

- [ ] **Step 1: `admin/src/image.js`**

```js
// Downscale in the browser before upload: the server stores what it gets (max 10 MB) and never re-encodes.
export async function resizeImage(file, max, quality = 0.85) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("no se pudo leer la imagen (usa JPG, PNG o WebP)"); }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return { blob: await canvas.convertToBlob({ type: "image/jpeg", quality }), width: canvas.width, height: canvas.height };
}
```

- [ ] **Step 2: `admin/src/MediaManager.jsx`**

```jsx
import { useState } from "react";
import { api } from "./api.js";
import { KIND, safeHref } from "./format.js";
import { resizeImage } from "./image.js";

const pick = m => ({ id: m.id, public: !!m.public, kind: m.kind, label: m.label ?? "" });

export default function MediaManager({ listingId, media, coverId, onChange }) {
  const [saved, setSaved] = useState(media);         // last state the server confirmed
  const [items, setItems] = useState(media), [cover, setCover] = useState(coverId);
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [drag, setDrag] = useState(null);
  const visual = items.filter(m => m.r2_key), links = items.filter(m => !m.r2_key);
  const dirty = JSON.stringify(items.map(pick)) !== JSON.stringify(saved.map(pick)) || cover !== coverId;

  const move = (from, to) => {
    if (from == null || to < 0 || to >= visual.length || from === to) return;
    const v = [...visual]; const [x] = v.splice(from, 1); v.splice(to, 0, x);
    setItems([...v, ...links]);
  };
  const patch = (id, p) => setItems(list => list.map(m => (m.id === id ? { ...m, ...p } : m)));
  const commit = (list, c) => { setSaved(list); setItems(list); onChange(list, c); };

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const body = { items: items.map((m, i) => ({ id: m.id, position: i, public: !!m.public, kind: m.kind, label: m.label ?? "" })), cover_media_id: cover ?? null };
      commit((await api(`/admin/listings/${listingId}/media`, { method: "PUT", body })).media, cover ?? null);
      setMsg({ ok: true, text: "Fotos guardadas." });
    } catch (e) { setMsg({ text: e.message }); } finally { setBusy(false); }
  };

  const upload = async files => {
    setBusy(true); setMsg(null);
    const added = [], failed = [];
    for (const file of files) {
      try {
        if (file.size > 40 * 1024 * 1024) throw new Error("pesa más de 40 MB");
        const [big, small] = await Promise.all([resizeImage(file, 1600), resizeImage(file, 640, 0.8)]);
        const form = new FormData();
        form.append("file", big.blob, "photo.jpg"); form.append("thumb", small.blob, "thumb.jpg");
        form.append("label", file.name.replace(/\.[^.]+$/, "")); form.append("kind", "photo");
        form.append("width", big.width); form.append("height", big.height);
        added.push((await api(`/admin/listings/${listingId}/media`, { method: "POST", form })).media);
      } catch (e) { failed.push(`${file.name}: ${e.message}`); }
    }
    if (added.length) {
      // New uploads are saved server-side; keep any unsaved local reorder on top of them.
      setItems(list => [...list.filter(m => m.r2_key), ...added, ...list.filter(m => !m.r2_key)]);
      setSaved(list => [...list, ...added]);
      onChange([...saved, ...added], coverId);
    }
    setMsg(failed.length ? { text: `No se subieron: ${failed.join(" · ")}` } : { ok: true, text: `${added.length} foto(s) subida(s).` });
    setBusy(false);
  };

  const remove = async m => {
    if (!confirm(`¿Borrar "${m.label || m.id}"? No se puede deshacer.`)) return;
    try {
      await api(`/admin/media/${m.id}`, { method: "DELETE" });
      const keep = saved.filter(x => x.id !== m.id);
      setItems(list => list.filter(x => x.id !== m.id)); setSaved(keep);
      const c = cover === m.id ? null : cover; setCover(c); onChange(keep, c);
    } catch (e) { setMsg({ text: e.message }); }
  };

  return <div className="media">
    <p className="muted">Arrastra para ordenar (o usa ↑ ↓). Solo las fotos de Hampton y las subidas aquí pueden verse en la web; las externas son referencia privada.</p>
    <ol className="media-grid">{visual.map((m, i) => <li key={m.id} draggable
      onDragStart={() => setDrag(i)} onDragOver={e => e.preventDefault()} onDrop={() => { move(drag, i); setDrag(null); }}
      className={m.id === cover ? "is-cover" : undefined}>
      <div className="ph">
        {m.content_type === "application/pdf"
          ? <a className="doc" href={`/media/${m.id}`} target="_blank" rel="noopener noreferrer">PDF · abrir</a>
          : <img src={`/media/${m.id}?thumb`} alt={m.label || ""} loading="lazy" />}
        {m.id === cover && <span className="tag">Portada</span>}
        {m.origin === "external" && <span className="tag priv">Privada · referencia</span>}
      </div>
      <input aria-label={`Descripción de la foto ${i + 1}`} value={m.label ?? ""} maxLength={200} onChange={e => patch(m.id, { label: e.target.value })} />
      <div className="ctl">
        <button type="button" className="btn ghost sm" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Mover la foto ${i + 1} antes`}>↑</button>
        <button type="button" className="btn ghost sm" onClick={() => move(i, i + 1)} disabled={i === visual.length - 1} aria-label={`Mover la foto ${i + 1} después`}>↓</button>
        <select aria-label={`Tipo de la foto ${i + 1}`} value={m.kind} onChange={e => patch(m.id, { kind: e.target.value })}>
          {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="ctl">
        {m.origin !== "external" && <label className="check"><input type="checkbox" checked={!!m.public} onChange={e => patch(m.id, { public: e.target.checked ? 1 : 0 })} /> Visible en la web</label>}
        {m.origin !== "external" && m.kind === "photo" && <label className="check"><input type="radio" name="cover" checked={m.id === cover} onChange={() => setCover(m.id)} /> Portada</label>}
        {m.origin === "upload" && <button type="button" className="btn ghost sm danger" onClick={() => remove(m)}>Borrar</button>}
      </div>
    </li>)}</ol>
    {!visual.length && <p className="empty">Sin fotos todavía.</p>}
    {links.length > 0 && <details><summary>{links.length} enlace(s) de referencia sin descargar</summary>
      <ul>{links.map(m => <li key={m.id}><a href={safeHref(m.source_url)} target="_blank" rel="noopener noreferrer">{m.label || m.source_url}</a> · {m.provider}</li>)}</ul></details>}
    <div className="filters">
      <button type="button" className="btn" onClick={save} disabled={!dirty || busy}>Guardar fotos</button>
      <label className="btn ghost upload">Subir fotos
        <input className="sr" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy}
          onChange={e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) upload(f); }} /></label>
      {busy && <span className="muted">Trabajando…</span>}
      {dirty && <span className="muted">Orden o visibilidad sin guardar</span>}
    </div>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </div>;
}
```

- [ ] **Step 3: Añadir a `admin/src/styles.css`**

```css
.media-grid{list-style:none;padding:0;margin:12px 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.media-grid li{border:1px solid var(--line);background:#fff;padding:8px;display:grid;gap:6px;cursor:grab}
.media-grid li.is-cover{border-color:var(--bronze)}
.media-grid .ph{position:relative;aspect-ratio:4/3;background:var(--mist)}
.media-grid .ph img{width:100%;height:100%;object-fit:cover}
.media-grid .doc{display:grid;place-items:center;height:100%}
.tag{position:absolute;left:6px;top:6px;background:var(--ink);color:#fff;font-size:10px;padding:2px 6px}
.tag.priv{left:auto;right:6px;background:var(--bronze)}
.ctl{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.check{display:flex;gap:6px;align-items:center;color:var(--ink);font-size:12px}
.upload:focus-within{outline:2px solid var(--bronze);outline-offset:2px}
```

- [ ] **Step 4: Compilar** — `npm run build`. Esperado: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add admin/src
git commit -m "Add admin photo manager: order, cover, kind, visibility, upload and delete"
```

---

### Tarea 12: Panel — bandeja de solicitudes de visita

**Files:**
- Modify: `admin/src/Viewings.jsx` (sustituye el provisional)

**Interfaces:**
- Consumes: `GET /api/admin/viewings?status=`, `PUT/DELETE /api/admin/viewings/:id`.

- [ ] **Step 1: Escribir `admin/src/Viewings.jsx`**

```jsx
import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";

const TABS = { new: "Nuevas", contacted: "Contactadas", closed: "Cerradas" };
const ONE = { new: "Nueva", contacted: "Contactada", closed: "Cerrada" };

export default function Viewings() {
  const [status, setStatus] = useState("new"), [data, setData] = useState(null), [counts, setCounts] = useState({}), [msg, setMsg] = useState(null);
  const load = () => api(`/admin/viewings?status=${status}`).then(d => { setData(d); setCounts(d.counts); }, e => setMsg(e.message));
  useEffect(() => { setData(null); load(); }, [status]);
  const change = async (v, s) => { try { await api(`/admin/viewings/${v.id}`, { method: "PUT", body: { status: s } }); load(); } catch (e) { setMsg(e.message); } };
  const remove = async v => {
    if (!confirm(`¿Borrar la solicitud de ${v.name}? No se puede deshacer.`)) return;
    try { await api(`/admin/viewings/${v.id}`, { method: "DELETE" }); load(); } catch (e) { setMsg(e.message); }
  };
  return <section aria-labelledby="t-views">
    <h1 id="t-views">Solicitudes de visita</h1>
    <div className="seg" role="group" aria-label="Estado">{Object.entries(TABS).map(([k, t]) =>
      <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}>{t}<span className="count">{counts[k] ?? ""}</span></button>)}</div>
    {msg && <p role="alert" className="err">{msg}</p>}
    {!data ? <p>Cargando…</p> : !data.viewings.length ? <p className="empty">No hay solicitudes {TABS[status].toLowerCase()}.</p> :
      <table className="list">
        <thead><tr><th scope="col">Recibida</th><th scope="col">Propiedad</th><th scope="col">Visita</th><th scope="col">Contacto</th><th scope="col">Estado</th><th scope="col"><span className="sr">Acciones</span></th></tr></thead>
        <tbody>{data.viewings.map(v => <tr key={v.id}>
          <td className="muted">{fmtDate(v.created_at)}</td>
          <td>{v.listing_id ? <a href={`#/p/${v.listing_id}`}>{v.listing_title || v.listing_id}</a> : "Consulta general / tasación"}</td>
          <td className="num">{v.date} · {v.time}<div className="muted">{v.kind}{v.agent ? ` · con ${v.agent}` : ""}</div></td>
          <td>{v.name}<div><a href={`mailto:${v.email}`}>{v.email}</a>{v.phone && <> · <a href={`tel:${v.phone.replace(/[^\d+]/g, "")}`}>{v.phone}</a></>}</div></td>
          <td><select aria-label={`Estado de la solicitud de ${v.name}`} value={v.status} onChange={e => change(v, e.target.value)}>
            {Object.entries(ONE).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
          <td><button type="button" className="btn ghost sm danger" onClick={() => remove(v)}>Borrar</button></td>
        </tr>)}</tbody>
      </table>}
  </section>;
}
```

- [ ] **Step 2: Compilar** — `npm run build`. Esperado: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add admin/src/Viewings.jsx
git commit -m "Add admin viewing requests inbox"
```

---

### Tarea 13: Prueba de extremo a extremo en local

**Files:**
- Create: `tests/fixtures/seed.sql`, `tests/fixtures/photo.jpg`
- Modify: `tests/e2e.cjs` (se reescribe entero)

**Interfaces:**
- Consumes: todo lo anterior. `signSession`, `COOKIE` (Tarea 3) para la sesión de prueba.

- [ ] **Step 1: Fixtures**

```bash
mkdir -p tests/fixtures
python3 -c "from PIL import Image; Image.new('RGB',(800,600),(180,170,150)).save('tests/fixtures/photo.jpg', quality=80)"
```

`tests/fixtures/seed.sql`:
```sql
INSERT INTO listings (id, use, title, property_type, operation, availability, country, location, bedrooms, bathrooms,
  sale_price, rent, rent_period, premium, currency, price_text, summary, description, tour_url, specs, published, archived_at, created_at, updated_at, updated_by) VALUES
('HE-R001','residential','Le Bernage','House','sale','for_sale','Jersey','St Saviour',3,1,779000,NULL,NULL,NULL,'GBP','£779,000',
 'Semi-detached home\nGarage and parking','A quiet private development.\nClose to town.','https://my.matterport.com/show/?m=TEST',
 '[{"group":"Interior","label":"Heating","value":"Oil-fired"}]',1,NULL,'2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z','import'),
('HE-R002','residential','Trinity rental','Flat','rent','to_let','Jersey','Trinity',2,1,NULL,1900,'month',NULL,'GBP','£1,900 pcm',NULL,'Bright flat.',NULL,'[]',1,NULL,'2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z','import'),
('HE-R018','residential','Pathfield Road','House','sale','for_sale','United Kingdom','London',4,2,520000,NULL,NULL,NULL,'GBP','£520,000',NULL,'London home.',NULL,'[]',1,NULL,'2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z','import'),
('HE-C001','commercial','Café and Accommodation','Cafe','business','for_sale','Jersey','St Helier',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Negotiable',NULL,'Going concern.',NULL,'[]',1,NULL,'2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z','import'),
('HE-R003','residential','Hidden draft','House','sale','sold','Jersey','St Brelade',3,2,650000,NULL,NULL,NULL,'GBP','£650,000',NULL,'Draft.',NULL,'[]',0,NULL,'2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z','import');
INSERT INTO media (id, listing_id, r2_key, thumb_key, origin, kind, label, public, position, content_type, created_at) VALUES
('A00001','HE-R001','media/hampton/p1.jpg','thumbs/hampton/p1.jpg','hampton','photo','Front',1,0,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00002','HE-R001','media/hampton/p2.jpg','thumbs/hampton/p2.jpg','hampton','photo','Kitchen.png',1,1,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00003','HE-R001','media/hampton/p3.jpg','thumbs/hampton/p3.jpg','hampton','aerial','From above',1,2,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00004','HE-R001','media/hampton/p4.jpg','thumbs/hampton/p4.jpg','hampton','floorplan','Ground floor',1,3,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00005','HE-R001','media/external/x1.jpg','thumbs/external/x1.jpg','external','photo','Other agency',0,4,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00006','HE-R002','media/hampton/p5.jpg','thumbs/hampton/p5.jpg','hampton','photo','Flat',1,0,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00007','HE-R018','media/hampton/p6.jpg','thumbs/hampton/p6.jpg','hampton','photo','London',1,0,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00008','HE-C001','media/hampton/p7.jpg','thumbs/hampton/p7.jpg','hampton','photo','Café',1,0,'image/jpeg','2026-10-07T00:00:00.000Z'),
('A00009','HE-R003','media/hampton/p8.jpg','thumbs/hampton/p8.jpg','hampton','photo','Draft photo',1,0,'image/jpeg','2026-10-07T00:00:00.000Z');
```

- [ ] **Step 2: Preparar el estado local aislado del e2e**

📍 VPS, `/root/HamptonJersey`:
```bash
rm -rf .wrangler/e2e
npx wrangler d1 migrations apply hampton --local --persist-to .wrangler/e2e
npx wrangler d1 execute hampton --local --persist-to .wrangler/e2e --file tests/fixtures/seed.sql
for k in hampton/p1 hampton/p2 hampton/p3 hampton/p4 external/x1 hampton/p5 hampton/p6 hampton/p7 hampton/p8; do
  printf 'media/%s.jpg\t%s\timage/jpeg\nthumbs/%s.jpg\t%s\timage/jpeg\n' "$k" "$PWD/tests/fixtures/photo.jpg" "$k" "$PWD/tests/fixtures/photo.jpg"
done > build/e2e-upload.tsv
scripts/upload_r2.sh build/e2e-upload.tsv --local --persist-to .wrangler/e2e
npm run build
```
Esperado: la migración y el seed se aplican sin errores, se suben 18 objetos sin fallos y `✓ built`.

- [ ] **Step 3: Localizar Chrome y playwright-core**

```bash
ls /opt/google/chrome/chrome 2>/dev/null || which chromium chromium-browser google-chrome
find / -path /proc -prune -o -type d -name playwright-core -print 2>/dev/null | grep node_modules | head -3
```
Anota ambas rutas: son `CHROME` y `PW` en el paso 5. Si no aparece `playwright-core`, ejecuta `npm i --no-save playwright-core` y usa `PW=playwright-core`.

- [ ] **Step 4: Reescribir `tests/e2e.cjs`**

```js
// End-to-end check against `wrangler pages dev` with the fixture database (see Task 13 of the plan):
//   npx wrangler pages dev --port 8788 --persist-to .wrangler/e2e     (terminal A)
//   PW=<playwright-core> CHROME=<chrome> node tests/e2e.cjs [screenshot-dir]   (terminal B)
// Matterport is never contacted: its requests are aborted.
const {chromium} = require(process.env.PW || "playwright-core");
const assert = require("node:assert/strict");
const {execFileSync} = require("node:child_process");
const {readFileSync} = require("node:fs");
const BASE = process.env.BASE || "http://localhost:8788/";
const SHOTS = process.argv[2];
const shot = (page, name) => SHOTS && page.screenshot({path: `${SHOTS}/${name}.png`, fullPage: true});
const secret = readFileSync(".dev.vars", "utf8").match(/^SESSION_SECRET=(.+)$/m)[1].trim();
const d1 = sql => execFileSync("npx", ["wrangler", "d1", "execute", "hampton", "--local", "--persist-to", ".wrangler/e2e", "--json", "--command", sql], {encoding: "utf8"});

async function newPage(ctx, viewport) {
  const page = await ctx.newPage({viewport});
  page.errors = [];
  page.on("pageerror", e => page.errors.push(e.message));
  page.on("console", m => m.type() === "error" && !/Failed to load resource|turnstile|challenges/i.test(m.text()) && page.errors.push(m.text()));
  await page.route(/matterport\.com/, r => r.abort());
  return page;
}

async function publicSite(browser) {
  const ctx = await browser.newContext();
  const page = await newPage(ctx, {width: 1280, height: 800});
  await page.goto(BASE);
  await page.waitForSelector("#grid .card");
  await shot(page, "home");
  const body = await page.textContent("body");
  for (const word of ["Demo", "demo", "Illustrative", "snapshot", "Matterport sample"]) assert.ok(!body.includes(word), `no "${word}" on the public site`);
  const hrefs = await page.$$eval("#grid .card", cs => cs.map(c => c.getAttribute("href")));
  assert.ok(!hrefs.includes("#/p/HE-R003"), "drafts are not public");
  await page.click("#tabs-region [data-region=uk]");
  assert.deepEqual(await page.$$eval("#grid .card", cs => cs.map(c => c.getAttribute("href"))), ["#/p/HE-R018"]);
  await page.click("#tabs-region [data-region=all]");
  await page.click("#tabs-op [data-op=rent]");
  assert.match(await page.textContent("#grid .price"), /£1,900 pcm/);

  await page.goto(BASE + "#/p/HE-R001");
  await page.waitForSelector(".summary h1");
  assert.deepEqual(await page.$$eval(".media-tabs button", bs => bs.map(b => b.textContent)), ["Photos", "3D tour", "Aerial"]);
  assert.equal(await page.$$eval("#thumbs button", b => b.length), 2, "two public photos; external one hidden");
  await page.click('#thumbs [data-i="1"]');
  assert.match(await page.getAttribute("#stage img", "src"), /\/media\/A00002$/);
  assert.equal(await page.getAttribute("#stage img", "alt"), "Kitchen");
  await page.click("#tab-tour");
  assert.match(await page.getAttribute("#stage iframe", "src"), /my\.matterport\.com\/show\/\?m=TEST/);
  await page.click("#tab-aerial");
  assert.match(await page.getAttribute("#stage img", "src"), /A00003/);
  assert.match(await page.textContent(".detail"), /Floor plans[\s\S]*Property details[\s\S]*Oil-fired/);
  assert.ok(await page.$("#calc"));
  assert.equal((await page.request.get(BASE + "media/A00005")).status(), 404, "external photo is private");
  assert.equal((await page.request.get(BASE + "media/A00009")).status(), 404, "draft photo is private");
  await page.goto(BASE + "#/p/HE-R003");
  await page.waitForFunction(() => location.hash === "#/");

  // Booking: real request, Turnstile test key passes automatically.
  await page.goto(BASE + "#/p/HE-R002");
  await page.waitForSelector("#detail-slot form");
  await page.waitForFunction(() => document.querySelector('#detail-slot [name="cf-turnstile-response"]')?.value, null, {timeout: 20000});
  await page.fill("#detail-slot input[name=name]", "Jane Le Brocq");
  await page.fill("#detail-slot input[name=email]", "jane@example.je");
  await page.click("#detail-slot button[type=submit]");
  await page.waitForSelector("#detail-slot .confirm");
  assert.match(await page.textContent("#detail-slot .confirm"), /Request received[\s\S]*Trinity rental/);
  assert.match(d1("SELECT name, listing_id FROM viewing_requests"), /Jane Le Brocq[\s\S]*HE-R002/);
  assert.deepEqual(page.errors, []);

  const m = await newPage(ctx, {width: 390, height: 844});
  await m.goto(BASE + "#/p/HE-R001");
  await m.waitForSelector(".summary h1");
  assert.equal(await m.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, "no horizontal scroll on mobile");
  await shot(m, "detail-mobile");
  await ctx.close();
}

async function admin(browser) {
  const {signSession, COOKIE} = await import("../server/auth.js");
  const ctx = await browser.newContext();
  const page = await newPage(ctx, {width: 1280, height: 900});
  await page.goto(BASE + "admin/");
  await page.waitForSelector("text=Entrar con Google");
  await ctx.addCookies([{name: COOKIE, value: await signSession("luismadef45@gmail.com", secret), url: BASE, secure: true, httpOnly: true, sameSite: "Strict"}]);
  await page.reload();
  await page.waitForSelector("text=Propiedades");
  assert.match(await page.textContent(".seg"), /Publicadas4[\s\S]*Borradores1/);
  await shot(page, "admin-list");

  await page.click('a[href="#/p/HE-R001"]');
  await page.waitForSelector("#f-title");
  assert.ok(await page.isVisible("text=Privada · referencia"));
  await page.fill("#f-title", "Le Bernage (edited)");
  // Review focus 2: session lost mid-edit → login dialog, typed text kept.
  await ctx.clearCookies();
  await page.click("text=Guardar");
  await page.waitForSelector('[role=dialog] >> text=Tu sesión ha caducado');
  assert.equal(await page.inputValue("#f-title"), "Le Bernage (edited)");
  // Signing in again needs Google; simulate it with a fresh cookie and a reload.
  await ctx.addCookies([{name: COOKIE, value: await signSession("luismadef45@gmail.com", secret), url: BASE, secure: true, httpOnly: true, sameSite: "Strict"}]);
  await page.reload();
  await page.waitForSelector("#f-title");
  await page.fill("#f-title", "Le Bernage (edited)");
  await page.click("text=Guardar");
  await page.waitForSelector("text=Cambios guardados.");
  const pub = await (await page.request.get(BASE + "api/listings")).json();
  assert.equal(pub.find(p => p.id === "HE-R001").title, "Le Bernage (edited)");

  // Review focus 1: a published listing with no public photo warns.
  await page.goto(BASE + "admin/#/p/HE-C001");
  await page.waitForSelector("#f-title");
  await page.uncheck(".media-grid li >> text=Visible en la web");
  await page.click("text=Guardar fotos");
  await page.waitForSelector("text=Fotos guardadas.");
  await page.reload();
  await page.waitForSelector("text=sin foto pública");

  await page.goto(BASE + "admin/#/p/HE-R002");
  await page.waitForSelector("#f-title");
  page.once("dialog", d => d.accept());
  await page.click("text=Archivar");
  await page.waitForSelector("text=Archivada.");
  const after = await (await page.request.get(BASE + "api/listings")).json();
  assert.ok(!after.some(p => p.id === "HE-R002"), "archived listing leaves the public site");
  await page.click("text=Restaurar");
  await page.waitForSelector("text=Restaurada como borrador.");

  await page.goto(BASE + "admin/#/solicitudes");
  await page.waitForSelector("text=Jane Le Brocq");
  await page.goto(BASE + "admin/#/usuarios");
  await page.waitForSelector("text=andres.san1404@gmail.com");
  await shot(page, "admin-users");
  assert.deepEqual(page.errors, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME});
  try { await publicSite(browser); await admin(browser); console.log("e2e OK"); }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
```

Nota sobre la prueba de sesión caducada: lo que se comprueba es que aparece el diálogo de login y que el texto escrito se conserva. El nuevo login real exige Google, así que el test lo simula con una cookie y recarga la página.

- [ ] **Step 5: Ejecutar el e2e**

📍 Terminal A (`/root/HamptonJersey`):
```bash
npx wrangler pages dev --port 8788 --persist-to .wrangler/e2e
```
📍 Terminal B (`/root/HamptonJersey`):
```bash
mkdir -p build/shots
PW=<ruta a playwright-core del paso 3> CHROME=<ruta a chrome del paso 3> node tests/e2e.cjs build/shots
```
Esperado: `e2e OK`. Revisa las capturas de `build/shots/` (home, ficha en móvil, listado del panel y usuarios).
Si falla un paso de Turnstile por falta de red hacia `challenges.cloudflare.com`, dilo en el informe; no lo simules.

- [ ] **Step 6: Ejecutar toda la suite unitaria**

Run: `npm test`
Esperado: todo en verde (node y python).

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures tests/e2e.cjs
git commit -m "Add end-to-end test for public site, booking and admin panel"
```

---

### Tarea 14: Puesta en marcha en Cloudflare (requiere confirmación de Luis para el push)

**Files:**
- Modify: `wrangler.toml` (site key real de Turnstile)

- [ ] **Step 1: Migración e importación en remoto**

📍 VPS, `/root/HamptonJersey`:
```bash
npx wrangler d1 migrations apply hampton --remote
scripts/upload_r2.sh build/import/upload.tsv --remote
npx wrangler d1 execute hampton --remote --file build/import/import.sql -y
npx wrangler d1 execute hampton --remote --command "SELECT published, archived_at IS NOT NULL a, COUNT(*) FROM listings GROUP BY 1,2; SELECT COUNT(*) FROM media"
```
Esperado: las mismas cifras que en local (47 fichas, 790 medios) y `build/upload_errors.log` vacío.

- [ ] **Step 2: Widget de Turnstile** (MCP de Cloudflare)

`POST /accounts/05fb22c155667de064b55c4e287b21d8/challenges/widgets`, cuerpo: `{"name":"hamptonjersey viewings","domains":["hamptonjersey.pages.dev"],"mode":"managed"}`.
Del resultado: copia `sitekey` en `wrangler.toml` → `TURNSTILE_SITE_KEY = "<sitekey>"`. El `secret` va al paso 3 y **no se escribe en ningún archivo**.

- [ ] **Step 3: Secretos de Pages**

```bash
openssl rand -base64 48 | tr -d '\n' | npx wrangler pages secret put SESSION_SECRET --project-name hamptonjersey
printf %s '<secret del paso 2>' | npx wrangler pages secret put TURNSTILE_SECRET --project-name hamptonjersey
```
Esperado: `✨ Success! Uploaded secret` dos veces.

- [ ] **Step 4: Comando de build de Pages** (MCP de Cloudflare)

`PATCH /accounts/05fb22c155667de064b55c4e287b21d8/pages/projects/hamptonjersey` con `{"build_config":{"build_command":"npm ci && npm run build","destination_dir":"site","root_dir":""}}`. Comprueba con un `GET` que quedó guardado.

- [ ] **Step 5: Pasos de Firebase para Luis** (los ejecuta él; dárselos con su regla de oro)

1. 📍 Navegador → https://console.firebase.google.com/project/hamptonestatesjersey/authentication/providers → Google → **Habilitar** → elegir el email de asistencia → Guardar.
2. 📍 Misma consola → Authentication → **Settings** → **Authorized domains** → **Add domain** → `hamptonjersey.pages.dev`.
   Esperado: aparecen `localhost`, `hamptonestatesjersey.firebaseapp.com` y `hamptonjersey.pages.dev`.

- [ ] **Step 6: Commit y PEDIR CONFIRMACIÓN antes del push**

```bash
git add wrangler.toml && git commit -m "Set production Turnstile site key"
git log --oneline origin/main..main
```
Enseña a Luis la lista de commits y pregunta: "¿Hago push a main? Esto despliega producción en hamptonjersey.pages.dev". **No hagas push sin un sí explícito.**

- [ ] **Step 7: Push y seguimiento del deploy** (solo tras el sí)

```bash
git push origin main
git rev-parse main origin/main
```
Esperado: los dos SHA son iguales. Luego consulta con el MCP de Cloudflare `GET /accounts/…/pages/projects/hamptonjersey/deployments?per_page=1` cada ~60 s hasta que `latest_stage.status` sea `success`. Si es `failure`, revisa el log del build (`…/deployments/<id>/history/logs`).

- [ ] **Step 8: Verificación en producción**

```bash
curl -s https://hamptonjersey.pages.dev/api/listings | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d), 'published')"
curl -s -o /dev/null -w "public photo %{http_code}\n" "https://hamptonjersey.pages.dev$(curl -s https://hamptonjersey.pages.dev/api/listings | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['image'])")"
curl -s -o /dev/null -w "external photo %{http_code}\n" https://hamptonjersey.pages.dev/media/$(npx wrangler d1 execute hampton --remote --json --command "SELECT id FROM media WHERE origin='external' AND r2_key IS NOT NULL LIMIT 1" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['results'][0]['id'])")
curl -s -o /dev/null -w "cross-origin POST %{http_code}\n" -X POST -H "Origin: https://evil.example" -H "content-type: application/json" -d '{}' https://hamptonjersey.pages.dev/api/viewings
curl -s -o /dev/null -w "admin %{http_code}\n" https://hamptonjersey.pages.dev/admin/
curl -s -o /dev/null -w "admin api without session %{http_code}\n" https://hamptonjersey.pages.dev/api/admin/listings
```
Esperado: `N published` (el mismo N que en local), `public photo 200`, `external photo 404`, `cross-origin POST 403`, `admin 200`, `admin api without session 401`.

- [ ] **Step 9: Prueba de Luis (no automatizable)**

Pídele que:
1. abra https://hamptonjersey.pages.dev/admin/ y pulse "Entrar con Google" con `luismadef45@gmail.com`; debe ver el listado;
2. edite el título de una ficha, guarde y lo vea en la web pública en menos de un minuto (y después lo deje como estaba);
3. pruebe con una cuenta de Google que no esté autorizada; debe ver "Esta cuenta no tiene acceso";
4. envíe una solicitud desde "Book a viewing" y la vea en Solicitudes.

---

## Cobertura de la spec (auto-revisión)

| Spec | Tarea |
|---|---|
| §3 Arquitectura (Pages Functions, wrangler.toml, server/, secretos, Firebase) | 1, 5, 8, 14 |
| §4 Modelo de datos (incl. CHECK de externas, investigación) | 1 |
| §5 Importación re-ejecutable, precios, publicación D11, legacy D17, miniaturas, R2 | 4, 14 |
| §6 API pública, sesión, admin (409, borrado confirmado, medios, solicitudes, usuarios) | 5, 6 |
| §7 Panel: login, propiedades, ficha, fotos, tour/specs, investigación, solicitudes, usuarios | 8–12 |
| §8 Web pública sin lo inventado, secciones condicionales, Turnstile, lib.js | 7 |
| §9 Seguridad (validación, CSRF por Origin, XSS, 404 en privados, secretos) | 2, 3, 5, 6, 7, 14 |
| §10 Errores (mensajes, 401 sin perder el formulario, 409, fallo de carga pública) | 6, 7, 8, 10, 13 |
| §11 Pruebas | 1–7, 13 |
| §12 Puesta en marcha y pasos de Luis | 14 |

Desviaciones menores respecto a la spec, todas a favor de la seguridad o la simplicidad:
- Las tablas de investigación llevan el prefijo `research_`.
- La importación no sobrescribe fichas ya existentes. La spec decía "sobrescribe sin duplicar"; así no se pisan las ediciones del panel.
- No hay comprobación de "último admin": la regla "no puedes quitarte a ti mismo" ya la garantiza.
- La site key de Turnstile se sirve en `/api/config`, así que no hay que editar `index.html` al cambiarla.

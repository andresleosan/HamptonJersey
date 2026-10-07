# Panel administrativo y catálogo real — Hampton Jersey

Fecha: 2026-10-07 · Estado: borrador para revisión de Luis

## 1. Objetivo

Sustituir el demo por el catálogo real de Hampton Estates. El equipo entra con Google en `/admin`, gestiona fichas, fotos, solicitudes de visita y usuarios. La web pública muestra solo lo publicado y nada inventado.

**Éxito:**
- Un admin autorizado entra con Google, edita una ficha y la web pública muestra el cambio (en ≤ 60 s, por la caché).
- Cualquier otra cuenta de Google ve "sin acceso" y la API le devuelve 401/403.
- Una solicitud de visita enviada desde la web aparece en el panel.
- Las fotos externas nunca se sirven sin sesión de admin.

## 2. Decisiones (trazables)

| # | Decisión | Quién | Dónde |
|---|---|---|---|
| D1 | Login con Google vía Firebase Auth, proyecto `hamptonestatesjersey` | Luis | Mensaje inicial + respuesta "ya lo acabo de crear" |
| D2 | Datos en Cloudflare: D1 para datos, R2 para archivos | Luis (BD Cloudflare) + Claude (D1/R2) | Mensaje inicial; arquitectura aprobada |
| D3 | Fuente de los datos: `/root/Hampton_Database/hampton_properties.sqlite` | Luis | Mensaje inicial |
| D4 | El panel edita el catálogo; la investigación (fuentes, facts, términos, issues, búsquedas, match) se importa y es solo lectura | Luis | Pregunta "Alcance datos" |
| D5 | Se suben a R2 las 749 fotos. Las externas son privadas (solo con sesión admin); las de Hampton son públicas cuando su ficha está publicada | Luis | Pregunta "Fotos" |
| D6 | Acceso: lista de emails en D1, un solo rol con todos los permisos; usuarios gestionables desde el panel | Luis | Pregunta "Acceso" |
| D7 | Primeros admins: `luismadef45@gmail.com`, `andres.san1404@gmail.com` | Luis | Pregunta "Admins" |
| D8 | Panel en React + Vite | Luis | Pregunta "Stack" |
| D9 | Borrar = archivar (recuperable). El borrado definitivo solo desde Archivadas y escribiendo la referencia | Luis | Pregunta "Borrar" |
| D10 | Enfoque A: Pages Functions en este repo, sobre el proyecto Pages `hamptonjersey` (deploy automático desde GitHub `main`) | Luis | "si, vamos con A" |
| D11 | Al importar quedan publicadas las fichas del catálogo actual con disponibilidad For sale / To let / Lease / Under offer | Luis | Pregunta "Publicación" |
| D12 | Pantallas del panel según la sección 2 aprobada | Luis | Pregunta "Pantallas" |
| D13 | API, seguridad y pruebas según la sección 3 aprobada | Luis | Pregunta "Sección 3" |
| D14 | Se quita todo lo inventado de la web pública y se mantiene la estructura: tour 3D, vista aérea, planos y especificación se rellenan por ficha desde el panel y se ocultan si no hay dato | Luis | "quitar datos inventados, pero estructura mantener" + confirmación |
| D15 | "Book a viewing" guarda la solicitud en D1, protegida con Turnstile; el panel tiene bandeja de solicitudes | Luis | Pregunta "Reservas" |
| D16 | Los tours y fotos de otras agencias (Vimeo HE-R001, spec.co HE-R018) no se publican; solo aparecen como referencia en el panel | Claude (por el README: derechos sin verificar) | Este documento |
| D17 | Los 3 registros legacy (HE-X001–003) entran archivados; HE-R007/HE-R013 muestran aviso de posible duplicado | Claude, sección 2 aprobada | Sección 2 |
| D18 | El otro proyecto Pages `hamptonestatesjersey` (repo `Hampton`) no se toca | Claude (supuesto avisado, sin objeción) | Mensaje de enfoques |
| D19 | Todo en inglés: el panel `/admin` y los mensajes de la API de admin también (cambia lo que decía "panel en español") | Luis | "el idioma de la web debe ser ingles" (2026-10-07) |

## 3. Arquitectura

```
GitHub main ──push──▶ Cloudflare Pages "hamptonjersey"
                      build: npm ci && npm run build   →  site/  (+ site/admin/ compilado)
hamptonjersey.pages.dev
├─ /             site/index.html: web pública (vanilla, como hoy)
├─ /admin/       panel React+Vite (fuente en admin/, salida en site/admin/, ignorada en git)
├─ /api/*        functions/api/[[path]].js  → D1 "hampton"
└─ /media/:id    functions/media/[id].js    → R2 "hampton-media"
```

- `wrangler.toml` en el repo: `pages_build_output_dir = "site"` y los bindings `DB` (D1 `hampton`) y `MEDIA` (R2 `hampton-media`).
- Código compartido de servidor en `server/`, fuera de `functions/` para que no se convierta en rutas.
- JavaScript (ESM) en todo el proyecto, sin TypeScript, igual que el repo actual.
- Dependencias nuevas: `jose` para verificar el JWT de Firebase; `react`, `react-dom`, `firebase` y `vite` (+ `@vitejs/plugin-react`) para el panel; `wrangler` (dev) para desarrollo local e importación.
- Secretos de Pages: `SESSION_SECRET` (32 bytes aleatorios) y `TURNSTILE_SECRET`.
- Valores públicos en el código: la config web de Firebase y la site key de Turnstile.

## 4. Modelo de datos (D1)

**`listings`** (editable)
- `id` TEXT PK: referencia `HE-R001`.
- `use`: residential | commercial.
- `title`, `property_type`.
- `operation`: sale | rent | business.
- `availability`: for_sale | under_offer | sold | to_let | lease | not_stated | withdrawn.
- `country`, `location`, `road_name`, `bedrooms` INT, `bathrooms` INT, `tenure`.
- Precio:
  - `sale_price`, `rent`, `rent_period` (month | year), `premium`: REAL, NULL si se desconoce y **nunca 0**.
  - `currency`: GBP | EUR.
  - `price_text`.
- `summary` (una viñeta por línea) y `description`.
- `tour_url`, `specs` (JSON `[{group,label,value}]`, por defecto `[]`), `cover_media_id`.
- `published` INT 0/1, `archived_at` TEXT NULL.
- `created_at`, `updated_at`, `updated_by`.

**`media`**
- `id` TEXT PK y `listing_id` (FK).
- `r2_key` y `thumb_key`: NULL si es un enlace no descargado.
- `origin`: hampton | external | upload.
- `kind`: photo | floorplan | aerial | document.
- `label`, `public` INT, `position` INT, `content_type`, `width`, `height`, `bytes`.
- `source_url`, `provider`, `rights_status`, `created_at`, `created_by`.
- **Regla pública (una sola función, `server/visibility.js`):** `origin ∈ {hampton, upload}` AND `public = 1` AND la ficha está publicada y no archivada. `origin = external` nunca es pública: el servidor rechaza cambiarla.

**`viewing_requests`**
- `id` INTEGER PK y `listing_id` NULL.
- Datos de la solicitud: `agent`, `kind`, `date`, `time`, `name`, `email`, `phone`.
- Gestión: `status` (new | contacted | closed), `created_at`, `updated_at`, `updated_by`.

**`admins`**: `email` PK (en minúsculas), `added_by`, `added_at`.

**Investigación** (solo lectura, copia literal de las tablas del SQLite): `research_properties` (tabla `properties` original), `sources`, `facts`, `financial_terms`, `issues`, `search_log`. Se enlaza con las fichas porque `property_id = listings.id`.

## 5. Importación (`scripts/import_hampton.py`, re-ejecutable)

Python, porque `sqlite3` y PIL ya están instalados.

1. Lee el SQLite y convierte cada ficha:
   - `use` sale de `collection`; el internacional suplementario es residential.
   - **Operación y precio**, según `price_basis`:
     - "Sale/Property sale asking price…" → `sale` + `sale_price`.
     - "Rent per month/year…" → `rent` + `rent` + `rent_period`.
     - "Business/lease premium…" → `business` + `premium`.
     - Ambiguo / Not stated / terms negotiable → precio NULL; se conserva `price_text`.
   - Se usa `asking_amount`, no `raw_numeric_price` (el README avisa de que este último a veces está mal).
   - Si la moneda viene vacía y hay importe → GBP solo si `asking_text` lleva "£"; si no, el importe queda NULL.
   - `availability` normalizada al enum.
   - `published = 1` si el registro es del "Current requested catalogue" y su disponibilidad es For sale / To let / Lease / Under offer (D11).
   - `archived_at` = fecha de importación para HE-X001–003 (D17).
2. Medios:
   - Hampton descargadas → `origin = hampton`, `kind = photo`, `public = 1`.
   - Externas descargadas → `origin = external`, `public = 0`. `kind` = floorplan / document según `asset_type`; el resto, photo.
   - `linked_only` → fila sin `r2_key`, solo con `source_url`.
   - Portada = primera foto de Hampton.
   - Varias referencias que apuntan al mismo archivo comparten `r2_key`.
3. Genera miniaturas JPEG de 640 px con PIL; los originales ya miden como mucho 1600/1800 px.
4. Escribe `import.sql`: borra y reinserta todas las filas de origen importado, sin tocar `upload` ni `viewing_requests`, y siembra `admins` con D7.
5. Sube a R2 los originales y las miniaturas con `wrangler r2 object put`, en paralelo.
6. Aplica el SQL con `wrangler d1 execute hampton --remote --file import.sql`.

## 6. API

**Pública**
- `GET /api/listings`:
  - Devuelve las fichas publicadas y no archivadas, en el formato que ya usa `index.html` (`id, title, status, region, place, type, use, operation, currency, salePrice, rent, rentPeriod, premium, priceText, beds, baths, tenure, description[]`).
  - Añade `image` (portada), `photos[]`, `floorplans[]`, `aerial`, `tourUrl` y `specs[]`, todos con URLs `/media/:id` o `/media/:id?thumb`.
  - `region` sale de `country`: Jersey → jersey; United Kingdom → uk; resto → international.
  - Cabecera `Cache-Control: public, max-age=60`.
- `GET /media/:id`:
  - Visible según la regla pública → sirve el objeto de R2 con caché de 1 día.
  - Si no, solo con sesión de admin (`private, no-store`).
  - Sin permiso → **404**.
- `POST /api/viewings`:
  - Comprueba el token de Turnstile en el servidor (siteverify con la IP del cliente).
  - Valida los campos: email con formato, fecha futura que no sea domingo, hora de la lista, longitudes máximas y `listing_id` existente y publicado (o vacío).
  - Inserta con `status = new`.

**Sesión**
- `POST /api/session` con `{idToken}`. El servidor verifica con `jose` contra el JWKS de `securetoken@system.gserviceaccount.com`:
  - `iss = https://securetoken.google.com/hamptonestatesjersey`, `aud = hamptonestatesjersey`;
  - `email_verified = true` y `firebase.sign_in_provider = google.com`;
  - el email está en `admins`.
  - Si todo cuadra → cookie `__Host-hs` (HMAC-SHA256 con `SESSION_SECRET`, payload `{email, exp: 8h}`; HttpOnly, Secure, SameSite=Strict, Path=/).
- `DELETE /api/session`: cierra la sesión.
- `GET /api/me`: devuelve el email del usuario o 401.
- En cada petición de admin se comprueba la firma y la caducidad, **y además que el email siga en `admins`**: quitar a alguien tiene efecto inmediato.

**Admin** (todas exigen sesión)
- Fichas:
  - `GET /api/admin/listings`: todas, con contadores por pestaña.
  - `GET /api/admin/listings/:id`: ficha + medios + investigación + aviso de duplicado.
  - `POST /api/admin/listings`: crea la ficha; el id es el siguiente libre `HE-R`/`HE-C`/`HE-I` según use/region.
  - `PUT /api/admin/listings/:id`: acepta solo los campos editables y exige `updated_at`; si no coincide → 409.
  - `POST /api/admin/listings/:id/{publish|unpublish|archive|restore}`.
  - `DELETE /api/admin/listings/:id`: solo si está archivada y el cuerpo trae `{confirm: "<id>"}`. Borra la ficha, sus filas de media y sus objetos R2 de origen `upload`. Los importados se quedan en R2, porque también existen en `/root/Hampton_Database`. La investigación no se borra.
- Medios:
  - `PUT /api/admin/listings/:id/media`: `[{id, position, public, kind, label}]` + `cover_media_id`.
  - `POST /api/admin/listings/:id/media`: multipart con original + miniatura, que genera el navegador con canvas (máx. 1600 px y 640 px). Hasta 10 MB; el tipo se valida por cabecera mágica (JPEG/PNG/WebP).
  - `DELETE /api/admin/media/:id`: solo si es de origen `upload`.
- Solicitudes:
  - `GET /api/admin/viewings?status=`.
  - `PUT /api/admin/viewings/:id` con `{status}`.
  - `DELETE /api/admin/viewings/:id`.
- Usuarios:
  - `GET/POST /api/admin/users`.
  - `DELETE /api/admin/users/:email`: no permite borrarse a uno mismo ni dejar la lista vacía.

## 7. Panel (`/admin`)

Se usan como referencia de estructura Stripe Product catalogue, Squarespace Products, Turo y Airbnb (Mobbin). Router por hash, sin librería; CSS propio que reusa los tokens de la web; formularios con `<label>` y estados de error anunciados (`aria-live`).

1. **Entrar:**
   - Botón "Entrar con Google" (`signInWithPopup`).
   - Si la cuenta no tiene acceso: "Esta cuenta no tiene acceso" + "Salir".
2. **Propiedades:**
   - Pestañas Publicadas · Borradores · Archivadas · Todas, con contador.
   - Buscador (título/referencia/localidad) y filtros por uso, región y disponibilidad.
   - Tabla: miniatura, título + ref, ubicación, precio, disponibilidad, visibilidad, última edición (fecha · quién).
   - Botón "Nueva propiedad".
3. **Ficha:** tarjeta lateral con portada, estado y menú de secciones; barra fija con Guardar · Publicar/Despublicar · Archivar (Restaurar y "Borrar definitivamente" si está archivada).
   - **Datos:** título, uso, tipo, operación, disponibilidad, país, localidad, calle, dormitorios, baños y tenencia.
   - **Precio:** venta / alquiler + periodo / premium (se muestra el que corresponde a la operación), moneda y texto mostrado.
   - **Descripción:** resumen y descripción larga.
   - **Fotos:**
     - Cuadrícula con la portada marcada; orden por arrastre (HTML5) o con botones ↑/↓.
     - Tipo de cada foto: foto / plano / aérea.
     - Interruptor "visible en la web" solo en las de Hampton y las subidas.
     - Las externas llevan la etiqueta "Privada · referencia".
     - Subir fotos y borrar las subidas.
   - **Tour y especificación:** URL del tour y tabla grupo/etiqueta/valor. Al lado, los facts y las URLs de tour de la investigación, como ayuda (solo lectura).
   - **Investigación** (solo lectura): match status, confianza y motivo; issues; fuentes con enlace; facts; términos financieros; qué falta y siguiente acción.
4. **Solicitudes:** bandeja con Nuevas · Contactadas · Cerradas. Cada fila muestra ficha, fecha/hora, tipo, agente y contacto (enlaces `mailto:`/`tel:`); se puede cambiar el estado y borrar.
5. **Usuarios:** lista de emails, añadir y quitar.

## 8. Web pública (cambios en `site/`)

- **Datos:** `fetch("/api/listings")` sustituye a `data/properties.json`. `team.json` se queda (es real).
- **Se elimina:** la cinta "Demo prototype", `DEMO`, `PLOT`, el tour Matterport de ejemplo, la imagen `img/aerial-demo.jpg`, la especificación inventada, los textos "demo/illustrative/sample", el enlace a la fuente de Wix, "Listing snapshot captured", `site/data/properties.json` y `scrape.py`.
- **Se mantiene, condicionado a datos reales:**
  - Galería: todas las fotos públicas.
  - Pestaña "3D tour": solo si hay `tourUrl`. Se incrusta en iframe únicamente si el host es `my.matterport.com`, `player.vimeo.com` o `www.youtube-nocookie.com`; si no, se muestra como enlace externo.
  - Pestaña "Aerial": solo con foto `aerial`, sin contornos.
  - Sección "Floor plans": solo si hay planos.
  - Sección "Details": solo si hay `specs`.
  - La calculadora hipotecaria y las comparables se quedan.
- **Book a viewing:** mismo formulario + widget Turnstile; envía a `POST /api/viewings`. La confirmación dice "Request received. We will contact you to confirm." Se quitan "Cancel this request" (ya no puede cancelarse) y los textos de demo.
- **`lib.js`:** `safeUrl` acepta también rutas `/media/` del mismo origen; `wix()` las deja pasar sin tocar.

## 9. Seguridad

- **Validación:** en el servidor, con lista de campos permitidos, tipos, enums, rangos (≥ 0 o NULL) y longitudes máximas (título 200, descripción 20 000…).
- **CSRF:** cookie SameSite=Strict + toda petición que no sea GET exige `Origin` igual al propio origen.
- **XSS:** la web pública escapa todo con `esc()` (ya es así); React escapa por defecto en el panel; los enlaces externos solo se aceptan si son `https:`.
- **Fotos externas y datos personales:** `/media` responde 404 a quien no tiene permiso. Las solicitudes de visita solo son visibles para admins.
- **Secretos:** solo como secretos de Pages, nunca en el repo.

## 10. Errores

- La API responde `{error: "<mensaje legible>"}` con su código (400 validación, 401 sin sesión, 403 sin acceso, 404, 409 conflicto, 413 archivo grande).
- El panel muestra el mensaje junto al campo o en un aviso. Un 401 lleva a la pantalla de entrar sin perder el formulario. Un 409 dice "Otra persona guardó cambios; recarga para verlos".
- Web pública: si `/api/listings` falla, muestra "No hemos podido cargar las propiedades. Recarga la página." Si Turnstile o el envío fallan, muestra el error y conserva los datos del formulario.
- Recuperación: D1 Time Travel (30 días) y rollback de deploys en Pages.

## 11. Pruebas

- `node --test`:
  - conversión ficha → formato público;
  - regla de visibilidad de medios;
  - validación de campos y de solicitudes;
  - verificación de claims del token con un JWKS falso (iss/aud/email_verified/proveedor);
  - firma y caducidad de la cookie;
  - conversión de precios en la importación.
- **Local de extremo a extremo:** `wrangler pages dev` con D1 local sembrado. Se prueban la web pública (listado, ficha, solicitud con la clave de prueba de Turnstile) y la API de admin con una sesión de prueba firmada.
- **Se actualizan** `tests/lib.test.js` y `tests/e2e.cjs` a los datos nuevos.
- **No automatizable:** el popup real de Google. Lo probarán Luis y Andrés tras el deploy.

## 12. Puesta en marcha

**Lo hace Claude** (MCP de Cloudflare/Firebase y wrangler):
- crear D1 `hampton` y R2 `hampton-media`;
- poner el build command de Pages y los secretos;
- crear el widget de Turnstile (dominios `hamptonjersey.pages.dev` y `localhost`);
- importar;
- registrar la app web de Firebase si no existe y obtener su config.

**Lo hace Luis en la consola de Firebase** (se le guiará paso a paso):
- comprobar que el proveedor Google está habilitado;
- añadir `hamptonjersey.pages.dev` a dominios autorizados.

**El deploy a producción ocurre al hacer push a `main`. Solo con confirmación explícita de Luis.**

## 13. Fuera de alcance

- Gestionar el equipo (`team.json`) desde el panel.
- Dominio propio.
- Avisos por email de solicitudes nuevas.
- Historial de cambios por campo (solo se guarda quién editó por última vez).
- Varios idiomas.
- Edición de la investigación.

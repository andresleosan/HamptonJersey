# Hampton App · Google y vistas previas al compartir

Fecha: 2026-10-25 · Estado: decisiones de Claude (Luis: «si, sigamos con lo de Google y WhatsApp»; antes delegó las decisiones) · Base: `main` en producción (`7ff3158`)
Prepara el cambio de dominio (hamptonestatesjersey.com pasará a esta app). Donde este documento no dice nada, mandan el spec de F0 y `DESIGN.md`.

## 1. Intención

Hoy cada casa vive en `#/p/HE-R001`. Google no indexa lo que va detrás de `#` y WhatsApp, Facebook o iMessage no ejecutan JavaScript, así que un enlace compartido sale sin foto ni título, y ninguna casa aparece por separado en Google. Con las ventas cayendo, cada casa compartida por WhatsApp o encontrada en Google es un comprador más.

**Éxito (verificable):**
- `/p/HE-R001` abre la ficha directamente, y su HTML, sin ejecutar JavaScript, ya trae título, descripción, foto (`og:image` absoluta), URL canónica y datos estructurados de la casa.
- Un enlace a una casa pegado en WhatsApp muestra foto, título y precio (se comprueba con el HTML que recibe un robot; la vista real se prueba tras publicar).
- `/sitemap.xml` lista la portada y todas las fichas publicadas; `/robots.txt` lo anuncia y deja fuera `/admin/` y `/api/`.
- Dentro de la web, ir de una ficha a otra no recarga la página y el botón Atrás funciona como hoy.
- Los enlaces viejos `#/p/HE-R001` (y las redirecciones de Wix) siguen funcionando y acaban en `/p/HE-R001`.

**No-objetivos:** cambiar el dominio (lo hace Luis cuando tenga acceso); rutas propias para `#/apply`, `#/privacy` o las secciones de la portada; Google Business Profile; analítica nueva.

**Anti-objetivos:**
- Que el título o la descripción de una ficha puedan inyectar HTML o romper el JSON-LD (todo se escapa; `<` en el JSON-LD como `<`).
- Que una ficha no publicada o archivada salga en el sitemap o con vista previa.
- Que la web vaya más lenta: la página de una ficha hace una sola lectura de D1.

## 2. Decisiones (todas de Claude; revisables)

| # | Decisión | Por qué |
|---|---|---|
| S1 | **URL real por casa**: `/p/HE-R001`. El router de `site/index.html` lee la ruta o el `#`; los enlaces a fichas pasan a `/p/<id>` y se navegan con `history.pushState` (sin recargar); `popstate` vuelve atrás. Un `#/p/<id>` heredado se cambia por `/p/<id>` con `replaceState`. `#/apply`, `#/privacy` y las secciones siguen con `#` | Lo mínimo para que cada casa tenga su URL; el resto no necesita indexarse aparte |
| S2 | **Function `functions/p/[id].js`**: lee la ficha publicada (una consulta, reutilizando la forma pública de `server/listing.js`), toma `index.html` de los assets y le inyecta con `HTMLRewriter`: `<title>` («Título · Precio · Hampton Estates Jersey»), `meta description` (resumen, recortado a unos 160 caracteres), `link rel=canonical`, `og:type`, `og:title`, `og:description`, `og:image` (absoluta) con su `og:image:alt`, `og:url`, `og:site_name`, `twitter:card=summary_large_image` y un JSON-LD Schema.org `RealEstateListing` con `offers` (precio y moneda), dirección (parroquia o localidad, Jersey) e imágenes. Ficha inexistente, no publicada o archivada: el mismo `index.html` con estado 404 y `noindex`. `cache-control: public, max-age=300` | Los robots de WhatsApp y Facebook solo leen el HTML |
| S3 | **Imagen de la vista previa**: la portada de la ficha. Se usa la miniatura (`?thumb`) si mide al menos 600 px de ancho; si no, la imagen completa. Quien construye comprueba tamaños y formatos reales de R2 y lo deja escrito | WhatsApp descarta imágenes pequeñas o muy pesadas |
| S4 | **Portada (`/`)**: metadatos fijos en `index.html` (título, descripción, `og:*` con una foto de la propia web) y un JSON-LD `RealEstateAgent`: Hampton Estates, 42 Bath Street, St Helier, Jersey JE2 4ST, 01534 727582, francopropertiesjersey@gmail.com, fundada en 1982, `sameAs` Facebook e Instagram (los de la web oficial) | Así sale bien al compartir la web y en la ficha de empresa de Google |
| S5 | **`SITE_URL`** en `wrangler.toml` (`https://hamptonjersey.pages.dev` hoy): canónicas, `og:url`, sitemap y robots lo usan. El día del cambio de dominio se cambia una vez. Si la petición llega por otro host, la respuesta añade `X-Robots-Tag: noindex` | Evita contenido duplicado entre pages.dev y el dominio |
| S6 | **`/sitemap.xml`** (Function): la portada y `/p/<id>` de cada ficha publicada y no archivada, con `lastmod` = `updated_at`. **`/robots.txt`** (Function): permite todo salvo `/admin/` y `/api/`, y enlaza el sitemap con `SITE_URL` | Deben llevar URLs absolutas del host bueno |
| S7 | **Compartir**: en la ficha, un botón **Share** que usa el menú de compartir del móvil (`navigator.share`) o, si no existe, copia el enlace; al lado, **WhatsApp** (`https://wa.me/?text=<título> <url>`). Siempre comparte la URL `/p/<id>` con `SITE_URL` | Lo que Luis pidió: que el equipo y los clientes manden casas por WhatsApp |
| S8 | **Título de la pestaña** por ruta en el cliente («Título · Hampton Estates Jersey» en una ficha; el de la portada en el resto) | Coherente con lo que ve Google |
| S9 | **Rutas absolutas** para los recursos de `index.html` (`/lib.js`, `import("/apply.js")`, etc.), para que funcionen desde `/p/<id>` | Hoy son relativas |
| S10 | **`site/_redirects`**: los destinos `/#/p/<id>` de Wix pasan a `/p/<id>` | Un salto menos y la URL buena desde el primer clic |
| S11 | Textos en inglés (D19) | |

## 3. Lo que decide quien construye

- Cómo se comparte la forma pública de la ficha entre `server/routes/public.js` y la Function sin duplicar la consulta.
- El diseño de los botones Share y WhatsApp según `DESIGN.md` y la ficha actual.
- Qué foto concreta va en el `og:image` de la portada.

## 4. Despliegue

Sin migración. Tras publicar: comprobar con `curl -A WhatsApp` el HTML de una ficha, pegar un enlace en WhatsApp y enviar el sitemap a Google Search Console cuando el dominio esté en esta app.

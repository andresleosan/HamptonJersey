---
name: Hampton Estates Jersey
description: Public property site and staff panel of a family estate agency in St Helier, Jersey.
colors:
  # Existe hoy. Two copies of the palette drift apart; see "Colors" for the recommended single set.
  site-ink: "#151515"
  site-paper: "#ffffff"
  site-mist: "#f4f3f0"
  site-line: "#e3e0da"
  site-stone: "#77736c"
  site-bronze: "#a56b3d"
  site-bronze-dk: "#86542d"
  site-ok: "#2f6b4f"
  site-field-bg: "#fbfaf8"
  site-team-bg: "#1f1f1f"
  panel-ink: "#141414"
  panel-paper: "#ffffff"
  panel-mist: "#f2efe9"
  panel-line: "#e2ddd4"
  panel-stone: "#6b665e"
  panel-bronze: "#8a6a3b"
  panel-ok: "#1f6b3a"
  panel-err: "#a32020"
  panel-warn-bg: "#fff6e5"
typography:
  display:
    fontFamily: "Tenor Sans, Gill Sans, Optima, sans-serif"
    fontSize: "clamp(34px, 6vw, 72px)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "0.06em"
  headline:
    fontFamily: "Tenor Sans, Gill Sans, Optima, sans-serif"
    fontSize: "clamp(24px, 3vw, 34px)"
    fontWeight: 400
    letterSpacing: "0.06em"
  title:
    fontFamily: "Tenor Sans, Gill Sans, Optima, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.3
  body:
    fontFamily: "Montserrat, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Montserrat, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.22em"
  panel-body:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  panel-h1:
    fontFamily: "Tenor Sans, Georgia, serif"
    fontSize: "26px"
    fontWeight: 400
rounded:
  pill: "999px"
  site-r: "16px"
  site-r-lg: "24px"
  site-field: "12px"
  panel-r: "14px"
  panel-r-sm: "10px"
  thumb: "8px"
spacing:
  wrap: "1240px"
  gutter: "clamp(16px, 4vw, 40px)"
  section: "clamp(56px, 8vw, 104px)"
  panel-page: "24px 16px 120px"
components:
  button-primary:
    backgroundColor: "{colors.site-ink}"
    textColor: "{colors.site-paper}"
    rounded: "{rounded.pill}"
    padding: "13px 28px"
  button-primary-hover:
    backgroundColor: "{colors.site-bronze}"
  panel-button-primary:
    backgroundColor: "{colors.panel-ink}"
    textColor: "{colors.panel-paper}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  field:
    backgroundColor: "{colors.site-field-bg}"
    rounded: "{rounded.site-field}"
    padding: "13px 14px"
  panel-card:
    backgroundColor: "{colors.panel-paper}"
    rounded: "{rounded.panel-r}"
    padding: "24px"
---

# Design System: Hampton Estates Jersey

Documento de referencia para todo plan de implementación. Describe lo que **existe hoy** en el código (con `archivo:línea`) y separa lo que es **propuesta**. Si una regla no lleva la marca *Propuesta*, existe en el código. Nunca cites un token propuesto como si ya estuviera en el CSS: primero hay que añadirlo.

Fuentes: web pública `site/index.html` (CSS en líneas 12-321, JS en 341-841) y `site/lib.js`; panel `admin/src/styles.css` y `admin/src/*.jsx`. Ignora `site/admin/` (es el build).

Regla D19: todo texto visible (web, panel, mensajes de la API) va en inglés. Este documento explica en español; tokens, clases y ejemplos de copy van en inglés.

## Overview

**Creative North Star: "The Bath Street Gallery"**

El comentario de cabecera del CSS lo dice (`site/index.html:13`): galería monocroma estilo Heider, imagen a sangre, titulares en mayúsculas con Tenor Sans y el bronce reservado para la acción y el precio. Es una agencia familiar desde 1982: la sensación es discreta, cálida y de oficio, no de portal inmobiliario. La foto de la casa es la protagonista; la interfaz se aparta.

Dos superficies, un mismo mundo:

- **Web pública (modo Persuade/Experience):** aireada, fotos grandes, tarjetas redondeadas (16-24px), botones píldora en mayúsculas espaciadas, revelado suave al hacer scroll. Densidad baja.
- **Panel `/admin` (modo Operate):** misma tipografía y paleta, sin mayúsculas en titulares, cuerpo 14px, tablas y listas densas, fondo `mist` con tarjetas blancas. El último restyle (commit `3818771`) lo acercó a la web: píldoras, sombras suaves, barra de guardado flotante.

**Key Characteristics:**
- Neutros cálidos (ink, paper, mist, line, stone) más **un** acento: bronce.
- Tenor Sans para display, Montserrat para todo lo demás. Nada más.
- Interactivos en píldora (`999px`); contenedores con radio medio; fotos siempre recortadas con `object-fit:cover`.
- Movimiento corto y con propósito; todo se apaga con `prefers-reduced-motion`.
- Solo tema claro (`color-scheme:light`, `site/index.html:17`). No hay modo oscuro.

## Colors

Paleta cálida de galería: casi negro, blanco, un gris piedra y un bronce. El verde y el rojo solo comunican estado.

### Primary
- **Bronce Bath Street** (`site-bronze`, `site/index.html:15`; `panel-bronze`, `admin/src/styles.css:1`): hover de botones, precio, foco, pestaña activa, pill "Under offer". **Ojo:** la web y el panel usan dos bronces distintos (#a56b3d cobrizo frente a #8a6a3b dorado-oliva).
- **Bronce profundo** (`site-bronze-dk`, `site/index.html:15`): definido pero hoy no se usa en ninguna regla.

### Neutral
- **Ink** (`site-ink` / `panel-ink`): texto, botón primario, fondos de chip seleccionado, pill "Sold".
- **Paper** (#ffffff): fondo de la web; tarjetas del panel.
- **Mist** (`site-mist` / `panel-mist`): bandas alternas de la web (reserva, calculadora, footer); fondo de página del panel.
- **Line** (`site-line` / `panel-line`): bordes de 1px, separadores, borde de inputs.
- **Stone** (`site-stone` / `panel-stone`): texto secundario, etiquetas, metadatos.
- **Field bg** (#fbfaf8): fondo de inputs en ambas apps (`site/index.html:193`, `admin/src/styles.css:37`).

### Estado
- **OK** (`site-ok`, `panel-ok`): confirmación de reserva (`site/index.html:221`), badge Published, switch activo.
- **Error** (`panel-err`, `admin/src/styles.css:1`): solo existe en el panel. La web muestra errores en texto `stone` dentro de `.form-status`.
- **Aviso** (`panel-warn-bg` #fff6e5 + borde izquierdo bronce, `admin/src/styles.css:65`): color suelto, no tokenizado.
- Colores sueltos sin token: `#cfcac2` / `#cfc9bf` (hover de input), `#faf8f4` (hover de fila), `#fbf6ee` y `#c9c3b8` (dropzone), `#a9a49b`, `#cfcac2`, `#2b2b2b` (sección Team oscura, `site/index.html:148-165`).

### Contraste medido (WCAG 2.2, texto normal necesita 4.5:1)
| Par | Ratio | Uso real | Veredicto |
|---|---|---|---|
| site-stone sobre paper | 4.72 | hints, meta | pasa |
| site-stone sobre site-mist | **4.25** | footer 13px (`:292`), hints de `#book` | **falla AA** |
| site-bronze sobre paper | **4.40** | `.price` 20px, `.specs h4` 11px, pestaña activa | **falla AA** (20px regular no es "texto grande") |
| blanco sobre site-bronze | **4.40** | hover de `.btn`, `.pill.offer` 10px | **falla AA** |
| site-bronze sobre #1f1f1f | **3.74** | `.agent .role` 11px | **falla AA** |
| site-bronze-dk sobre paper / mist | 6.33 / 5.70 | (sin uso) | pasa |
| panel-stone sobre panel-mist / paper | 4.96 / 5.70 | `.muted` | pasa |
| panel-bronze sobre paper | 4.99 | `.unsaved`, hover | pasa |
| panel-ok / panel-err sobre paper | 6.52 / 7.54 | mensajes | pasa |
| line sobre paper (borde de input) | 1.32 | bordes de campos y chips | por debajo de 3:1 (WCAG 1.4.11) |

### Propuesta: una sola paleta para las dos apps
Al tocar una pantalla, migra sus colores a este set (y nada nuevo fuera de él):
- `--ink #151515`, `--paper #ffffff`, `--mist #f4f3f0`, `--line #e3e0da` (los de la web).
- `--stone #6b665e` (el del panel: 5.13 sobre mist, arregla el footer y los hints).
- `--bronze #a56b3d` solo para no-texto (foco, borde activo, `accent-color`) y display de 24px o más; `--bronze-dk #86542d` para texto bronce pequeño y para fondos con texto blanco (hover de botón, pill "Under offer"). El panel abandona #8a6a3b.
- `--ok #2f6b4f`, `--err #a32020` (nuevo en la web), `--warn-bg #fff6e5`.
- `--bronze-on-dark #c9a27e` (7.03 sobre #1f1f1f) para texto bronce en la sección Team.
- `--field-line #8f8a82` (3.29 sobre #fbfaf8) para el borde de campos y chips no seleccionados en pantallas nuevas.

**The One Accent Rule.** El bronce marca la acción principal, el precio y el foco. Nunca fondos grandes, nunca iconos decorativos, nunca dos tonos de bronce compitiendo en una misma pantalla.

**The Text-Not-Color Rule.** Un estado nunca se comunica solo con color: siempre lleva su etiqueta en texto (como el switch "Visible/Hidden", `admin/src/Listings.jsx:98`).

## Typography

**Display Font:** Tenor Sans (fallback web: Gill Sans, Optima, sans-serif; panel: Georgia, serif)
**Body Font:** Montserrat (fallback web: Helvetica Neue, Arial; panel: system-ui)

**Character:** Tenor Sans en mayúsculas espaciadas da el tono de agencia clásica; Montserrat a 15px con interlineado amplio la legibilidad. Carga: Google Fonts con `display=swap` (`site/index.html:11`, `admin/index.html`).

### Hierarchy (web)
- **Display** (400, `clamp(34px,6vw,72px)`, lh 1.05, máx. 14ch): solo el H1 del hero (`site/index.html:87`).
- **Headline** (400, `clamp(24px,3vw,34px)`, mayúsculas, `.06em`): H2 de sección (`:27-28`). H1 de ficha `clamp(24px,2.6vw,32px)` (`:249`).
- **Title** (400, 17px, lh 1.3): título de tarjeta (`:133`); agente 22px (`:155`).
- **Body** (400, 15px, lh 1.65): todo el texto (`:21`); prosa a 68ch máx. (`:265`).
- **Label** (600, 11px, `.22em`, mayúsculas, stone): `.eyebrow` (`:29`). Etiquetas de campo 10px `.18em` (`:192`). Botón 12px `.16em` (`:30`).
- **Numérico:** precio en Tenor 20px bronce (`:135`), 30px en ficha (`:250`); cifras con `.num` (tabular-nums, `:36`).

### Hierarchy (panel)
- H1 26px, H2 19px, Tenor sin mayúsculas (`admin/src/styles.css:6-7`); cuerpo 14px/1.5 (`:5`); `.muted` y `label` 12px stone (`:29`, `:36`); cabecera de tabla 11px `.08em` mayúsculas (`:45`); botón 12px `.08em` (`:22`).

**The Two Fonts Rule.** No se añade ninguna familia nueva. Pesos permitidos: 400, 500, 600.

**Propuesta:** quitar el peso 300 de la URL de la web (se carga y no se usa) y cambiar los `font-weight:700` del panel (`styles.css:95`, `:139`) a 600, porque 700 no se carga y el navegador lo sintetiza.

## Layout

- **Contenedor:** 1240px en ambas apps (`site/index.html:17` `--wrap`, `admin/src/styles.css:17` `.page`). Gutter web `clamp(16px,4vw,40px)` (`:26`); panel 16px lateral y 120px abajo para no tapar con la barra de guardado.
- **Ritmo web:** sección `clamp(56px,8vw,104px)` (`:104`); cabecera de sección con 36px debajo (`:107`); rejilla de tarjetas `auto-fill minmax(280px,1fr)`, gap 40px/28px (`:118`).
- **Escala de espacios observada:** 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 64. *Propuesta:* en código nuevo usar solo **4, 8, 12, 16, 24, 32, 48, 64** (más el `clamp` de sección).
- **Detalle web:** media + resumen fijo de 360px (`.d-top`, `:233`), luego 1.3fr/1fr (`.detail`, `:262`); en móvil una columna y barra fija inferior con precio y CTA (`.mbar`, `:311-313`).
- **Panel lista/detalle:** bandeja 340px + detalle (`.inbox`, `styles.css:88`); editor con lateral fijo de 280px + secciones en tarjetas (`.editor`, `:55-56`).
- **Breakpoints observados:** web 480, 560, 640, 720, 760, 820, 860, 900, 980; panel 760, 820, 900. *Propuesta:* en código nuevo solo **480** (teléfono pequeño), **760** (apilar columnas, tabla a tarjetas) y **980** (dos columnas de detalle). Mobile-first: estilos base para móvil, `min-width` para ampliar.
- **Z-index observado:** web hero 1/2, `.mbar` 15, header 20, skip 50; panel row-menu 3, actionbar 4, bar 5, modal 20. No inventes valores fuera de estos niveles.

**The Density Split Rule.** La web respira (secciones de 56-104px, tarjetas sin borde); el panel es compacto (celdas 10-12px, gaps 8-16px). Una pantalla nueva hereda la densidad de su app, no la de la otra.

## Elevation & Depth

Casi plano. La profundidad la dan las bandas `mist` y la foto; la sombra solo marca lo que flota o responde al hover.

- **Web `--shadow`** `0 24px 60px -30px rgba(21,21,21,.28)` (`site/index.html:17`): hover de foto de tarjeta, formulario de reserva, confirmación, tour 3D.
- **Panel `--shadow`** `0 1px 2px rgba(20,20,20,.04), 0 12px 32px -18px rgba(20,20,20,.22)` (`styles.css:3`): tarjetas, tablas, bandeja.
- **Flotantes del panel:** actionbar `0 18px 40px -16px rgba(20,20,20,.3)` (`:66`), menú de fila `0 12px 32px rgba(20,20,20,.14)` (`:110`).
- **Vidrio:** solo dos piezas con `backdrop-filter: blur(8px)`: barra superior y actionbar del panel (`:12`, `:66`).

**The Flat-By-Default Rule.** En la web, una superficie solo lleva sombra si flota sobre otra o responde al hover. Nada de blur nuevo: los dos usos actuales son el tope.

## Shapes

- **Píldora 999px:** botones (`site:30`, `styles.css:22`), chips de opción (`site:200`), pills de estado (`site:129`), segmentado y nav del panel (`styles.css:14`, `:31`), badges (`:48`).
- **Tarjeta:** web 16px (`--r`), contenedores grandes 24px (`--r-lg`: feature, agente, formulario, tour, calculadora); panel 14px (`--r`).
- **Campo y tarjeta de opción:** web 12px fijo en el CSS (`site:193`) y 16px para `.opt`; panel 10px (`--r-sm`). Chip de día 14px (`site:215`). Miniaturas 8-10px.
- **Restos cuadrados en la web:** `.tabs button` (`:110`), `.chips span` (`:144`), `.tag` (`:275`), `.menu-btn` (`:47`), `.lb-close` (`:307`), `.empty` (`:136`), `.cancelled` (`:227`).

*Propuesta* (escala única): píldora para todo lo que se pulsa; **12px** campos y tarjetas de opción; **16px** tarjetas; **24px** superficies grandes de la web; **8px** miniaturas e ítems de menú. Los restos cuadrados pasan a píldora o 12px cuando se toque su pantalla.

## Components

### Buttons
- **Primario:** ink con texto blanco, píldora, mayúsculas 600; hover a bronce; `:active` `scale(.98)` (`site:30-32`, `styles.css:22-24`). Web `13px 28px`; panel `10px 20px`; `.sm` `6px 14px` 11px.
- **Ghost:** transparente con borde ink; hover se rellena de ink (`site:33-34`, `styles.css:26`). **Light** (blanco) sobre fotos (`site:35`).
- **Danger** (solo panel): texto y borde `err`, hover relleno (`styles.css:27`).
- **Disabled:** el panel lo tiene (`opacity:.45`, `styles.css:25`); la web **no** (su `.btn:hover` se aplica aunque esté deshabilitado). Pantallas nuevas de la web deben añadir el estado.
- **Texto-enlace:** `.linkbtn` web (`:115`), `.linkish` panel (`styles.css:61`).

### Chips y opciones (radio/checkbox reales)
- **`.opts`** (`site:197-220`): `<label><input type=radio><span>…</span></label>`; el input queda oculto, el `span` es una píldora 9px 18px; marcado = ink con texto blanco; foco visible con `:focus-visible + span`.
- **Tarjeta de opción `.opts.cards .opt`** (`:203-212`): icono 46px, título 600 14px, `small` stone; marcado = borde ink doble y check circular arriba a la derecha.
- **Chip de día `.opts.days .day`** (`:213-217`): fila con scroll-snap horizontal, día de semana / número / mes; `aria-label` con la fecha completa (`:387`).
- **Chips informativos `.chips`** (`:143`): no interactivos.

### Cards / Containers
- **Tarjeta de propiedad** (`site:118-135`, marcado en `card()` `:361-368`): foto 4:3 con radio 16px, pill de estado arriba a la izquierda, "3D tour" a la derecha, lugar (eyebrow), título, meta, precio. Hover: sube 4px, sombra y zoom de foto 1.04. Sin foto: "Photo unavailable" (`:126-128`).
- **Tarjeta del panel `.card`** (`styles.css:18`): blanco, borde line, radio 14px, sombra, padding 24px.

### Inputs / Fields
- Web `.field` (`site:190-195`): etiqueta encima (10px mayúsculas stone), campo de 13px 14px, radio 12px, fondo #fbfaf8; foco = borde bronce + halo `0 0 0 3px rgba(165,107,61,.15)`.
- Panel (`styles.css:36-41`): `label` envuelve (grid, 12px stone); foco igual con su bronce; error con `aria-invalid` (borde err) y `<small id="e-…" class="err">` enlazado por `aria-describedby` (`ListingEditor.jsx:76-79`).

### Navigation
- Web: header sticky de 72px, nav en mayúsculas 12px, menú desplegable bajo 860px con `aria-expanded` y Escape (`site:39-63`, `:777`); skip link (`:64-65`).
- Panel: barra oscura translúcida, nav en píldoras con `aria-current="page"` (`styles.css:12-16`, `App.jsx:50-55`). No tiene skip link.

### Tabs, segmentados y filtros
- **Filtro web `.tabs`** (`site:109-111`): botones con `aria-pressed` dentro de `role="group"` (`:482-483`).
- **Pestañas de medios `.media-tabs`** (`site:235-237`): ARIA tablist real, `aria-selected`, tabindex itinerante y flechas (`:625-626`, `:745`); activa con subrayado bronce.
- **Segmentado del panel `.seg`** (`styles.css:31-34`): píldoras con `aria-pressed` y contador (`Listings.jsx:60-61`).
- **Filtros del panel `.filters`** (`styles.css:35`): fila flex de `label > select/input`, con recuento vivo `aria-live` (`Listings.jsx:71`).

### Tables y listas
- `table.list` (`styles.css:42-47`): cabecera 11px mayúsculas, celdas 10px 12px, hover #faf8f4; bajo 760px cada fila pasa a tarjeta en grid (`:53`).
- Acciones de fila en `<details class="row-menu">` (`:106-112`, `Listings.jsx:101-106`).
- Reordenar: arrastre más botones ↑ ↓ `.nudge` como alternativa sin arrastre (`styles.css:133-136`).
- Bandeja `.inbox-list` (`:88-99`): botones con `aria-current`, borde izquierdo bronce en el activo, nombre en negrita si es nuevo.

### Status
- **Web `.pill`** sobre la foto (`site:129-132`): blanco por defecto, `sold` ink, `offer` bronce, `tour` ink.
- **Panel `.badge`** en contorno (`styles.css:48-49`): `published` ok, `draft` stone, `archived` bronce.
- **Switch** `role="switch"` con texto "Visible/Hidden" (`styles.css:121-126`).

### Dialogs, mensajes y barra de guardado
- **Web:** lightbox con `<dialog>` nativo y bloqueo de scroll (`site:303-310`).
- **Panel:** modal de sesión caducada como `div role="dialog" aria-modal` y el resto con `inert` (`App.jsx:48`, `:60-64`); confirmaciones con `window.confirm` (`Listings.jsx:18`); borrado permanente pidiendo teclear el ID (`ListingEditor.jsx:161-164`).
- **Mensajes:** no hay toasts. Patrón `<p role="status" class="ok">` o `role="alert" class="err"` junto a la acción (`Listings.jsx:73`). Web: `.form-status` con `aria-live="polite"` (`site:395`) y confirmación `.confirm` que recibe el foco (`:428`).
- **Barra de guardado `.actionbar`** (`styles.css:66-67`, `:100`; `ListingEditor.jsx:152-165`): fija abajo, centrada, blanca translúcida; "Unsaved changes" en bronce, Save deshabilitado si no hay cambios, aviso al salir (`unsaved.js`).

### Empty, loading y error
- **Vacío:** web `.empty` con borde discontinuo y la acción en el texto (`site:136`, `:586`); panel `.empty.card` con causa y botón ("No listings match these filters." + "Clear filters", `Listings.jsx:108-111`; copy por pestaña en `Viewings.jsx:6-7`).
- **Cargando:** texto simple "Loading listings…" (`Listings.jsx:45`). No hay skeletons.
- **Error de carga:** web `role="alert"` con "Try again" (`site:837-838`); panel `<p role="alert" class="err">` (`Listings.jsx:44`).

## Do's and Don'ts

### Do:
- **Do** usar las clases existentes antes de crear otras: `.btn`, `.opts`, `.field`, `.card`, `.seg`, `table.list`, `.badge`, `.empty`, `.actionbar`.
- **Do** construir cada pantalla del panel alrededor de la decisión que se toma en ella (qué revisar, a quién llamar), no del esquema "stats + gráfico + tabla".
- **Do** usar fotos reales de la propiedad con `object-fit:cover` dentro de un contenedor con `aspect-ratio`.
- **Do** dar a cada vacío su causa y su siguiente acción, y distinguir "sin datos todavía" de "filtrado a nada".
- **Do** poner el campo decisivo pronto en tablas (en Applicants: Stage, cola y Matches antes que el email).
- **Do** escribir copy funcional en inglés, en sentence case, sin exclamaciones ("Couldn't save. Try again.").

### Don't:
- **Don't** añadir un segundo acento (azul, morado, verde decorativo) ni degradados; el verde y el rojo son solo estado.
- **Don't** usar emoji en la interfaz, tampoco para ✅ ❌ ❓ de requisitos: usa texto ("Meets", "Fails", "Unknown") con un glifo simple.
- **Don't** poner eyebrow encima de cada titular nuevo: la web ya tiene uno por sección; no se suman más por defecto.
- **Don't** añadir animaciones en bucle; el único bucle existente (anillo del tour 3D, `site:177`) no es un patrón a copiar.
- **Don't** inventar datos de relleno ("John Doe", cifras con deltas): campos vacíos o placeholders honestos ("Your name", "name@example.com").
- **Don't** usar "—" como separador en frases nuevas; sí se mantiene como celda vacía en el panel (`format.js` `priceText`, `fmtDate`).
- **Don't** introducir modo oscuro parcial ni secciones invertidas nuevas; si llega, será una decisión de toda la app.

## Patrones para pantallas nuevas (propuesta)

Todo este apartado es propuesta construida con piezas que existen; donde hace falta algo nuevo se dice.

### Densidad
| | Web pública | Panel |
|---|---|---|
| Cuerpo | 15px/1.65 (16px en inputs del asistente) | 14px/1.5 |
| Objetivo táctil | 44px mínimo | 32px mínimo (24px absoluto, WCAG 2.5.8) |
| Separación de bloques | 24-48px | 12-16px |
| Titulares | Tenor mayúsculas | Tenor sin mayúsculas |

### Lista + detalle (Applicants, Properties, Action inbox)
- Cabecera: `.head` con H1 y una acción primaria a la derecha (`New applicant`). Debajo `.seg` para la dimensión principal con contadores (Applicants: `To Let` / `To Buy` / `All`; Inbox: `Needs action` / `For info`), luego `.filters` y el recuento `aria-live`.
- Applicants: `table.list` (o tarjetas bajo 760px). Columnas: Name, Phone, Applied, Stage, Queue, Matches ("12 found · 3 confirmed · 2 available"), Last contact, Assigned to. Orden por fecha con un `<button>` en la cabecera y `aria-sort`.
- Properties: rejilla de tarjetas como la de la web pero densa (foto 4:3, badge de estado, precio con periodo, calle y parroquia, camas/baños, disponibilidad, fuente y "Checked 2 days ago"). Filtros: To Buy/To Let, bedrooms, parish (las doce), precio, estado, fuente, "Changed in last 7 days".
- Action inbox: patrón `.inbox` existente. Pestañas de categoría con `.seg` (All, New applicants, Matched, Agency replies, Viewings, Missing payments, Messages, Compliance); en el detalle, 1 primario + máx. 2 ghost (como `Viewings.jsx:54-58`); lo destructivo dentro de `<details class="more">`.
- Ficha con pestañas (Requirements, Matches, Timeline, Messages, Viewings): ARIA tablist copiando el patrón de `.media-tabs` (tabindex itinerante, flechas, Home/End), con el aspecto de `.seg`. La pestaña va en la URL (`#/applicants/<id>/matches`) para poder enlazarla.

### Cola de revisión por teclado (A / R / S)
- Una propiedad por vez en una tarjeta: foto, precio, score 0-100 y la lista de requisitos Meets / Fails / Unknown con su evidencia.
- Botones visibles `Approve (A)`, `Reject (R)`, `Skip (S)` con `<kbd>`. Cada atajo es también un botón.
- Atajos activos **solo con el foco dentro de la región de la cola** y nunca dentro de un campo de texto (WCAG 2.1.4).
- Reject abre el selector de motivo (price, area, size, condition, other) elegible con 1-5 o con clic; Escape cancela.
- Tras cada acción: mensaje `role="status"` ("Approved. 14 left.") con `Undo` disponible hasta la siguiente acción; el foco vuelve a la tarjeta siguiente.
- Aprobación en lote por umbral con confirmación que dice cuántas.

### Asistente de registro (web, mobile-first)
- Una pregunta por pantalla: H2 con la pregunta (`What are you looking for?`), opciones con `.opts` (píldoras) o `.opts.cards` (To Let / To Buy), multi-selección con checkboxes en el mismo estilo (parroquias).
- Progreso: texto "Step 2 of 6" siempre visible más una barra fina sin pista de fondo; anunciado al cambiar de paso.
- Al avanzar: foco al H2 del paso (`tabindex="-1"`), como hace la confirmación de reserva.
- Acciones abajo, fijas en móvil como `.mbar` (con `safe-area-inset-bottom`): `Continue` primario a todo el ancho y `Back` como texto. Nada se pierde al volver.
- Inputs de 16px (evita el zoom de iOS), `autocomplete` correcto (`name`, `email`, `tel`), `inputmode` numérico en presupuesto.
- Validación al pulsar `Continue`: mensaje bajo el campo con `aria-describedby`, `aria-invalid`, foco al primer error. Errores de la API en `.form-status` (texto, `role="alert"`).
- Turnstile en el último paso, con `render=explicit` y el mismo plan B que la reserva: si no carga en 6s, mostrar el teléfono (`site:403-406`).
- Consentimiento: casillas sin marcar; tratamiento necesario separado del marketing opcional; enlace al aviso de privacidad junto a la casilla.
- Al enviar: confirmación como `.confirm` (verde, foco) con el resultado ("We found 7 homes that match right now…").

### Badges de estado (aplicante, match, propiedad)
Un único componente `.badge` en contorno con cinco tonos, siempre con texto:

| Tono | Estilo | Aplicante (stage / queue) | Match | Propiedad / ficha |
|---|---|---|---|---|
| neutral | stone | Paused, Archived, Waiting for investigation, No matches | Found, Not available, No response, Rejected by staff | Detected, Draft, Withdrawn, Gone |
| active | ink | Searching, Viewing, In process | Shortlisted, Viewed | Active |
| attention | bronze-dk | New, Waiting for review, New properties found, Gone quiet | Waiting for agent confirmation, Waiting for applicant response | Ready for review, To confirm, Stale, Under offer, Let agreed |
| positive | ok | Agreed, Completed, Viewing booked | Interested, Viewing booked, Offer / Application, Agreed | Availability confirmed, Published |
| closed | ink relleno | | | Sold, Let (igual que `.pill.sold`) |

`err` no es un tono de badge: se reserva para fallos y para lo urgente (pago atrasado), que va como mensaje o fila marcada, no como estado. Lost y Not interested llevan su motivo al lado en texto. Decisión pendiente: el `archived` actual en bronce (`styles.css:49`) debería pasar a neutral.

### Cargando, vacío, error
- Cargando: texto que dice qué carga ("Loading applicants…"); si la carga pasa de ~300ms en listas, filas fantasma con la altura real de la fila, sin shimmer en bucle bajo reduced motion.
- Vacío: tres variantes distintas (primera vez con la acción que lo llena; filtrado a nada con "Clear filters"; sin permiso con a quién pedirlo).
- Error: qué falló y qué hacer, junto a la acción que lo causó; conserva lo escrito ("Your details are still here", `site:422`).

## Requisitos verificables

### Accesibilidad
- [ ] Texto normal ≥ 4.5:1 y solo el texto de 24px o más puede bajar a 3:1; bordes de controles y foco ≥ 3:1. Comprobar con la tabla de Colors; bronce pequeño = `bronze-dk`.
- [ ] Foco visible en todo: `:focus-visible` 2px bronce con offset 2px (`site:25`, `styles.css:9`); nunca `outline:none` sin sustituto.
- [ ] Controles nativos primero (`button`, `input type=radio/checkbox`, `dialog`, `details`); ARIA solo para tablist, switch y live regions como ya se hace.
- [ ] Cada input con `<label>` asociado; errores con `aria-invalid` + `aria-describedby`; el placeholder nunca es la etiqueta.
- [ ] Mensajes dinámicos con `role="status"` / `role="alert"` o `aria-live="polite"`.
- [ ] Todo lo que se arrastra tiene alternativa con botones (como `.nudge`).
- [ ] Atajos de una tecla solo con el foco en su componente.
- [ ] Imágenes con significado con `alt` descriptivo; decorativas `alt=""`.
- [ ] Todo funciona con teclado y a 200% de zoom; nada queda tapado por la barra sticky o la actionbar (`scroll-margin`).
- [ ] Movimiento: todo `transition`/`animation` nuevo desactivado bajo `prefers-reduced-motion: reduce`. El panel ya lo hace global (`styles.css:128`); la web va por componentes (`site:83`, `:86`, `:186`, JS `:543`, `:552`, `:793`) y hoy se le escapan `scroll-behavior:smooth` (`:20`), el zoom de foto de tarjeta (`:124-125`) y el gris del agente (`:152`).

### Rendimiento
- [ ] Ninguna fuente, peso o librería nueva sin una razón escrita en el plan; preferir CSS y JS nativos.
- [ ] Toda `<img>` nueva va en un contenedor con `aspect-ratio` o con `width`/`height` (CLS < 0.1); `loading="lazy"` fuera del primer pantallazo.
- [ ] Listados usan miniaturas (`/media/<id>?thumb`, o `wix(url,w,h)` al tamaño mostrado); nunca el original en una lista.
- [ ] Subidas redimensionadas en el navegador con `resizeImage` (`admin/src/image.js`).
- [ ] Animar solo `transform` y `opacity`, 150-350ms para estados de UI; revelados con IntersectionObserver, nunca con `scroll` listeners.
- [ ] Scripts de terceros `async` y solo donde se usan (Turnstile en formularios).

### Seguridad frontend
- [ ] En la web, todo dato interpolado en HTML pasa por `esc()` (`site/lib.js:2`); para texto suelto, `textContent`. Nada de `innerHTML` con datos sin escapar.
- [ ] En el panel, nunca `dangerouslySetInnerHTML`.
- [ ] URLs solo tras su validador: `safeMedia`, `safeHttps`, `embedUrl`, `safeUrl` (`site/lib.js:4-16`), `safeHref` en el panel (`format.js`). Iframes solo de `EMBED_HOSTS`.
- [ ] Compatible con una CSP futura: **sin handlers inline** (`onclick=`; el único que existe es `site:838`), sin `javascript:` y sin atributos `style=` nuevos (usa clases; `el.style.setProperty` sí vale). El sitio todavía no envía CSP (`site/_headers`).
- [ ] Enlaces `target="_blank"` con `rel="noopener noreferrer"`.
- [ ] Datos personales (nombre, email, móvil, estatus de vivienda) nunca en `localStorage`; el asistente solo guarda en el navegador respuestas no personales.
- [ ] Validación del cliente solo para ayudar; Turnstile y reglas se verifican en el servidor.
- [ ] Mensajes de error de la API mostrados como texto, nunca como HTML.

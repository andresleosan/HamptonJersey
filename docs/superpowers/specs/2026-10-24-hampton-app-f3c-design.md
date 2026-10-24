# Hampton App · F3-C: ofertas y cierre de ventas

Fecha: 2026-10-24 · Estado: decisiones de Luis (24-oct) y de Claude · Base: `main` después de F7-A
Parte de la arquitectura (`docs/roadmap/2026-10-23-arquitectura-hampton-app.md` §3 `offers`/`sales`, §5.15, §7.3 «Compraventa», §9 F3). Donde este documento no dice nada, mandan la arquitectura y los specs de F0, F1-A, F3-A y F7-A.

## 1. Intención

Hoy los alquileres sostienen a Hampton porque las ventas caen, y Luis quiere empujar a vender (24-oct: «Ventas primero»). Una agencia pequeña pierde ventas entre «la visita fue bien» y «firmado»: ofertas que se anotan en un papel, un vendedor que tarda en contestar, abogados a los que nadie persigue y una fecha de passing que se escapa. F3-C pone cada oferta y cada venta acordada en el panel, con los hitos de Jersey, y muestra lo que está parado y el dinero que hay en camino.

F3-C es solo panel. Lo que necesita correo (el resumen semanal a abogados, comprador y vendedor; la oferta que llega al vendedor con un clic) llega con F3-B/F2. Las ofertas y solicitudes de alquiler son F5.

**Éxito (verificable):**
- El equipo registra una oferta de compra de un aplicante sobre una ficha en venta, y todas las ofertas de esa ficha se ven juntas, con su historial (contraoferta del vendedor, aceptada, rechazada, retirada).
- Aceptar una oferta abre en el mismo paso el expediente de venta, pone la ficha pública en «Under offer», mueve al aplicante a «Agreed» y queda en el historial. Nunca hay dos ventas en curso de la misma ficha, ni con dos aceptaciones simultáneas.
- El expediente lleva vendedor, abogados de ambas partes, precio, fecha prevista de cierre, honorarios y los hitos de Jersey con fecha prevista y real. Un hito vencido se ve marcado en la pantalla Sales y en el contador de la barra.
- La venta se completa (ficha en «Sold», aplicante en «Completed») o se cae con su motivo (ficha de nuevo en «For sale», aplicante de nuevo en «Searching»).
- La pantalla Sales suma los honorarios en camino y los cobrados este año.

**No-objetivos:** correos o WhatsApp a vendedor, comprador o abogados; ofertas desde un portal del aplicante; guardar documentos de diligencia debida (AML); facturas de comisión; ofertas y solicitudes de alquiler (F5); avisos al equipo por email; ofertas sobre casas de mercado que no estén en `listings`.

**Anti-objetivos:**
- Dos ventas en curso de la misma ficha.
- Que la ficha pública diga «Under offer» sin una venta en curso, o «For sale» con una (salvo que el equipo la cambie a mano en Listings).
- Perder el rastro: cada cambio de una oferta o una venta escribe un evento.
- Que el embudo de Insights (F7-A) deje de contar las etapas que el sistema cambia solo.
- Pantallas o botones que no hacen nada.

## 2. Decisiones

| # | Decisión | Quién · por qué |
|---|---|---|
| V1 | Solo ofertas de **compra**: aplicante con `operation = 'buy'` y no archivado, sobre una ficha con `operation = 'sale'`, no archivada | Luis: «Ventas primero». Alquiler es F5 |
| V2 | Al aceptar, la ficha pasa sola a `under_offer`; si la venta se cae vuelve a `for_sale` (solo si sigue en `under_offer`); al completarse pasa a `sold`. Cada cambio escribe su evento, recalcula los matches de la ficha (como un guardado, `afterSave(recomputeForListing…)`) y avanza `updated_at`. El equipo puede corregirla a mano en Listings | **Luis, 24-oct** («Sí, sola») |
| V3 | Cada expediente guarda los **honorarios previstos** de Hampton (£) y, si la venta es compartida, el nombre de la otra agencia y su parte (£). Sales suma «Fees in progress» (ventas en curso, honorarios menos la parte de la otra agencia) y «Fees completed this year» (completadas en el año natural de Jersey) | **Luis, 24-oct** («Sí, con total») |
| V4 | Estados de la oferta: `pending` → `countered` (el vendedor contraoferta un importe) → `accepted` / `rejected` / `withdrawn`; `pending` → `accepted` / `rejected` / `withdrawn`. Si el comprador sube, es una oferta nueva. Una oferta `pending` o `countered` se puede corregir (importe, condiciones) con evento; una registrada por error se retira con la nota «Recorded in error» | Claude: es el historial de §5.15 sin inventar estados |
| V5 | Aceptar crea la venta en el mismo batch con un `INSERT … WHERE NOT EXISTS (venta en curso de la ficha)` y un `UPDATE offers … WHERE status IN ('pending','countered')`; si otra aceptación ganó, 409 «This listing already has a sale in progress» y no cambia nada. Las demás ofertas de la ficha se quedan como están (ofertas de respaldo) y el panel las muestra | Claude: misma técnica atómica que F3-A C6 |
| V6 | Etapa del aplicante, **solo hacia delante** salvo la caída: registrar una oferta lo pone en `offer` si estaba en `new`, `searching` o `viewing`; aceptar → `agreed`; completar → `completed`; caída → `searching` (si seguía en `agreed`). Cada cambio escribe **`applicant.stage_changed`** con la misma forma de `data` que el guardado del panel (`server/routes/applicants.js`), para que el embudo de F7-A lo cuente | Claude. F3-A C16 no cambiaba la etapa al reservar porque una reserva no dice nada seguro; una oferta y una aceptación sí |
| V7 | Expediente (`sales`): ficha, comprador (aplicante), oferta aceptada, precio acordado (£), vía (`freehold` = freehold o flying freehold, pasa ante la Royal Court · `share_transfer`), vendedor (nombre, teléfono, email), abogado del comprador y del vendedor (despacho, persona, email, teléfono), fecha prevista de cierre, honorarios (V3), notas. Estados: `in_progress` → `completed` / `fallen_through` con motivo (`buyer_withdrew`, `seller_withdrew`, `finance`, `survey`, `chain`, `other`) y nota | Claude, desde §5.15 y §3 de la arquitectura. Vendedor y abogados van como texto en la venta, no en `contacts`: no son aplicantes, no entran en el matching ni en la retención de 12 meses |
| V8 | Hitos fijos (claves en una constante del servidor), en este orden: `lawyers` Lawyers instructed · `due_diligence` Housing status and due diligence checked · `questionnaire` Seller's questionnaire received · `searches` Searches (title, planning) back · `mortgage` Valuation and mortgage offer · `contract` Contract agreed · `funds` Funds with buyer's lawyer · `passing` Passing contract (Royal Court), o `Completion` si la vía es `share_transfer` · `settled` Seller paid and duties settled (Stamp Duty o LTT según la vía). Cada hito: fecha prevista, fecha real, «Not needed» (p. ej. hipoteca en compra al contado) y nota (≤ 300) | Claude, desde §7.3 «Compraventa». Revisable por Hampton; cambiar la lista es cambiar la constante |
| V9 | **Vencido**: un hito con fecha prevista anterior a hoy (Jersey), sin fecha real y no marcado «Not needed», en una venta en curso. También se marca «Waiting» una oferta `pending` o `countered` sin cambios en más de 2 días. Se calcula al leer; no hay avisos guardados ni tareas programadas | Claude: G1 = A (avisos solo en el panel) y Pages no tiene cron |
| V10 | El contador de la barra junto a **Sales** = ventas en curso con algún hito vencido + ofertas «Waiting». Llega con la misma consulta periódica de `/admin/notifications/counts` (un campo más), sin otra petición | Claude: el equipo lo ve sin abrir la pantalla |
| V11 | Eventos con `entity_type = 'applicant'` (el comprador) y `data` con `offer_id`, `sale_id` y `listing_id`: `offer.recorded`, `offer.updated`, `offer.countered`, `offer.accepted`, `offer.rejected`, `offer.withdrawn`, `sale.updated`, `sale.milestone`, `sale.completed`, `sale.fallen_through`; y `listing.availability_changed` para V2 con la ficha en `data` | Claude: el `CHECK` de `events.entity_type` no se toca (reconstruir `events` con `notifications` apuntándole es arriesgado para nada). El historial del aplicante los muestra solo |
| V12 | Importes en libras enteras, > 0 y ≤ 100.000.000. Condiciones de la oferta, texto ≤ 1.000 («Subject to mortgage», «Subject to sale»). Fechas `YYYY-MM-DD` | Claude |
| V13 | La venta se edita con bloqueo por `updated_at` (409 si otro guardó antes), como las fichas y los aplicantes | Claude |
| V14 | Retención: una venta y su comprador se guardan **5 años** desde que se completa o se cae (registros de la normativa contra el blanqueo, JFSC Handbook sección 18; confirmar con el abogado). El borrado de los 12 meses (G2), cuando se construya, debe saltarse a los aplicantes con una venta. F3-C no borra nada | Claude: lo apunta para G2 |
| V15 | Una venta no se borra (D9). Una completada no se puede deshacer desde el panel; si fue un error, el equipo corrige la ficha en Listings y lo anota | Claude |
| V16 | **Archivar y borrar** (rutas actuales de fichas y aplicantes): archivar una ficha o un aplicante se rechaza (409 «Close its offers and sale first») mientras tenga ofertas abiertas o una venta en curso. Borrar para siempre se rechaza (409 «Kept for 5 years: it has a sale») si tiene **alguna** venta, en cualquier estado (V14); sin ventas, sus ofertas se borran con él (`ON DELETE CASCADE` en `offers`) y el borrado de un aplicante sigue siendo posible (derecho de supresión). `sales` no lleva cascada: la clave foránea es la última barrera | Claude, a partir del builder check |
| V17 | Registrar una oferta exige ficha `operation = 'sale'`, no archivada y con `availability` en `for_sale` o `under_offer` (las de respaldo entran con la venta en curso); publicada o no, da igual. Aceptar exige lo mismo y ninguna venta en curso de la ficha ni del comprador; pone `under_offer` (sin efecto si ya lo estaba) | Claude |
| V18 | **Ofertas de respaldo**: mientras la ficha tiene una venta en curso, sus ofertas abiertas no cuentan como «Waiting» (V9). Al completar la venta, las ofertas abiertas de esa ficha pasan a `rejected` con la nota «Property sold» y las ofertas abiertas del comprador en otras fichas a `withdrawn` con «Buyer completed elsewhere», cada una con su evento, en el mismo batch | Claude |
| V19 | Un comprador solo puede tener **una venta en curso** (409 «This buyer already has a sale in progress»; índice único parcial en `sales(applicant_id) WHERE status = 'in_progress'`). Así V6 nunca mueve la etapa por una venta mientras otra sigue | Claude |
| V20 | «Fees completed this year» es neto (honorarios menos la parte de la otra agencia), como «Fees in progress», y cuenta las ventas con `closed_at` en el año natural de Jersey | Claude |
| V21 | Aceptar una oferta `countered` fija el precio en `counter_amount`; una `pending`, en `amount`. Los cambios automáticos de etapa avanzan `updated_at` del aplicante (un formulario abierto recibe 409 en vez de pisarlos) y, si sale de `new`, cierran su aviso de nuevo aplicante como un guardado del panel | Claude |

## 3. Datos (migración `0012_sales.sql`)

- `offers`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `listing_id` y `applicant_id` (`ON DELETE CASCADE`, V16), `amount INTEGER NOT NULL` (V12), `conditions TEXT`, `status TEXT NOT NULL DEFAULT 'pending'` con el `CHECK` de V4, `counter_amount INTEGER` (solo con `countered`), `note TEXT` (motivo de rechazo o retirada, ≤ 300), `created_at`, `created_by`, `updated_at`, `updated_by`. Índices `(listing_id, status)` y `(applicant_id)`.
- `sales`: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `listing_id`, `applicant_id` (sin cascada, V16), `offer_id` (único), `price INTEGER NOT NULL`, `route TEXT CHECK (route IS NULL OR route IN ('freehold','share_transfer'))`, `seller_name`, `seller_phone`, `seller_email`, `buyer_lawyer_firm`, `buyer_lawyer_name`, `buyer_lawyer_email`, `buyer_lawyer_phone`, los cuatro mismos del vendedor (`seller_lawyer_*`), `target_date TEXT`, `fee INTEGER`, `shared_agency TEXT`, `shared_fee INTEGER` (≤ `fee`), `notes TEXT` (≤ 2.000), `status` (V7), `fell_through_reason`, `fell_through_note`, `closed_at`, `created_at`, `created_by`, `updated_at`, `updated_by`. **Índices únicos parciales `(listing_id)` y `(applicant_id)` `WHERE status = 'in_progress'`** (V5, V19): la base de datos también impide dos ventas en curso.
- `sale_milestones`: `sale_id` (→ `sales`, `ON DELETE CASCADE`), `key TEXT NOT NULL` (V8), `planned_on TEXT`, `done_on TEXT`, `not_needed INTEGER NOT NULL DEFAULT 0 CHECK (not_needed IN (0,1))`, `note TEXT`, `PRIMARY KEY (sale_id, key)`, `WITHOUT ROWID`. Se crean las nueve filas al abrir la venta.
- Teléfonos y emails del vendedor y abogados: texto libre validado por longitud (≤ 120) y, si es email, que tenga forma de email; no se normalizan como los de `contacts`.

## 4. Panel

Sigue `DESIGN.md` y el estilo actual del panel. Todo el texto en inglés (D19).

- **Barra**: nuevo enlace **Sales** (`#/sales`) entre Viewings e Insights, con el contador de V10. La barra ya va justa de ancho (F7-A ocultó el email por debajo de 1536 px): no puede romperse a 1280 px ni en el móvil.
- **Sales** (`#/sales`):
  - Cifras arriba: ofertas abiertas, ventas en curso, «Fees in progress», «Fees completed this year».
  - «Offers»: abiertas (`pending`, `countered`) agrupadas por ficha, con comprador, importe, condiciones, situación del comprador (`buyer_position`, `mortgage_aip` del aplicante), antigüedad y «Waiting» (V9). Acciones: Counter (importe), Accept, Reject (nota), Withdraw (nota), Edit.
  - «Sales in progress»: ficha, comprador, precio, siguiente hito pendiente y su fecha, fecha prevista de cierre, marca de vencido. Las vencidas primero.
  - «Closed»: completadas y caídas de los últimos 12 meses, plegado.
  - **Record offer**: elige ficha (en venta, no archivada) y aplicante comprador (búsqueda por nombre, email o teléfono, reutilizando la búsqueda `q` de `/admin/applicants`), importe y condiciones.
- **Expediente** (`#/sales/<id>`), a dos columnas en escritorio y una en el móvil (referencia: fichas de Twenty y Calendly en Mobbin, datos a la izquierda y trabajo a la derecha):
  - Datos de V7 y V3, editables con la misma barra Save/Discard del panel.
  - Hitos de V8 como lista: fecha prevista, «Done» con su fecha (hoy por defecto), «Not needed», nota; vencidos marcados.
  - Botones **Mark completed** (pide confirmación; exige que `passing` esté hecho o marcado «Not needed») y **Fell through** (motivo y nota).
  - Enlaces a la ficha y al aplicante; las demás ofertas de la ficha, debajo.
- **Ficha del aplicante**: pestaña **Offers** con sus ofertas y su venta, y el botón Record offer con el aplicante ya elegido. Su historial muestra los eventos de V11 con textos legibles.
- **Editor de la ficha**: bloque «Offers» con el número de ofertas abiertas y la venta en curso, con enlace a Sales.

## 5. API (resumen; el plan fija las formas)

Todo bajo `/admin`, con sesión y la comprobación de origen de siempre; el servidor valida todo (V12) aunque el panel ya lo haga.

- `GET /admin/sales` → cifras, ofertas abiertas, ventas en curso (con siguiente hito y vencidos) y cerradas de 12 meses.
- `POST /admin/offers` · `PUT /admin/offers/:id` (corregir) · `POST /admin/offers/:id/{counter,accept,reject,withdraw}`.
- `GET /admin/sales/:id` · `PUT /admin/sales/:id` (datos, con `updated_at`) · `PUT /admin/sales/:id/milestones/:key` · `POST /admin/sales/:id/{complete,fall-through}`.
- `GET /admin/applicants/:id/offers` y `GET /admin/listings/:id/offers` (o dentro de sus respuestas actuales; lo decide el plan).
- `GET /admin/notifications/counts` añade `sales` (V10).

## 6. Despliegue

Sale con la Entrega 2 (nada posterior a `ef28568` se publica hasta entonces). Migración `0012_sales.sql` en remoto después de la `0011` y antes del push. No hay datos que migrar.

## 7. Ciclo y calidad

Como F3-A y F7-A: plan con `superpowers:writing-plans`, ejecución con subagentes (Opus, esfuerzo alto, decisión de Luis), revisión por tarea, revisión final de todo, pruebas `node:test` con el D1 local (incluida la concurrencia de V5 en el motor real) y la prueba de punta a punta `tests/e2e.cjs` ampliada (registrar oferta → contraoferta → aceptar → ficha «Under offer» en la web → hitos → completar → «Sold»). Capturas a 1280×800 y 390×844. ESTADO.md y la memoria se actualizan al cerrar.

> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# SPR-01 · Baños y fecha de disponibilidad en Listings

Fecha: 8-nov-2026. Lista 4. Entrega solicitada: **solo diseño y plan**, sin construir, migrar ni publicar. Estado: propuesta técnica concreta para revisión; no constituye aprobación de construcción ni evidencia `design` del coordinador.

## Intención y fuentes

El equipo debe ver los baños y la fecha de disponibilidad sin abrir cada propiedad. Arquitectura §5.3 y checklist SPR-01 piden estos datos; §5.10/PUB-06 incluye la misma fecha entre los datos económicos. SPR-01 conserva el resto de la fila: ubicación, precio, estado, dormitorios, última comprobación, interesados y visibilidad.

Base inspeccionada: `main`, `6d2f77922f797a1ffd6a23e2030308440ca81adf`, GitHub comprobado el 8-nov-2026. `server/listing.js` ya valida baños enteros de 0 a 100; `server/routes/listings.js` no los selecciona en `LIST_SQL`. No existe una columna de fecha de disponibilidad. `ListingEditor.jsx` ya edita baños, tiene guardado con `updated_at` y errores por campo. `server/viewings.js` aporta `realDate`; `admin/src/format.js` aporta `fmtDayMonth`. EST-18 ya tiene eventos de propiedad y triggers en `0029_listing_events.sql`, aunque SPR-02 aún debe presentar History.

El original privado de Luis no está en este clon aislado. Los requisitos anteriores constan en las fuentes públicas; no se necesita copiar ese documento para planificar este alcance.

## Alternativas y elección propuesta

1. **Recomendada:** reutilizar `bathrooms` y añadir una sola fecha nullable `available_from` a `listings`. Cumple SPR-01 y deja un contrato reutilizable por PUB-06 con una migración y sin dependencias nuevas.
2. Guardar la fecha en `specs`: evita una columna, pero crea un contrato ambiguo de texto, no una fecha validada, y dificulta compartirla con PUB-06. Descartada.
3. Esperar a completar todos los campos económicos de PUB-06: agranda innecesariamente el alcance y retrasa SPR-01. Descartada para este plan.

Luis eligió SPR-01 y solo planificación. La elección técnica y los detalles siguientes son propuestas del agente, no nuevas decisiones atribuidas a Luis.

## Decisiones del contrato

| ID | Decisión propuesta |
| --- | --- |
| D1 | `listings.available_from: TEXT NULL`, sin valor por defecto ni backfill. API: `string` con fecha real `YYYY-MM-DD` o `null`. Todas las propiedades previas quedan en `null`. |
| D2 | Reutilizar `realDate`, exigir año de `0001` a `9999` y formato exacto. Aceptar pasado, hoy y futuro: es un dato registrado, no una reserva de visita. Vacío, espacios y `null` se normalizan a `null` por la regla `blank` existente; fechas no vacías con espacios alrededor son inválidas. |
| D3 | Crear con el campo omitido deja `null`. PUT parcial con el campo omitido lo conserva. PUT con `null` lo borra. Valor inválido produce HTTP 400 y `fields.available_from = "Enter a valid date as YYYY-MM-DD"`, sin escritura ni evento. |
| D4 | La fecha es opcional para venta, alquiler y negocio. No participa en `checkPrice`, no bloquea Publish ni cambia por sí misma `availability`, `published`, `confirmed_at` o las reglas de To confirm. No se añade como criterio de matching; se conserva la llamada actual a `afterSave(recomputeForListing, ...)` y sus reglas de recálculo, sin prometer invariancia de todos los efectos de guardar. Un guardado solo de fecha conserva `confirmed_at`; usa el control de concurrencia `updated_at` existente. |
| D5 | Editor: campo nativo `type="date"` junto a Availability en Details, etiqueta `Available from`, hint `Leave blank if unknown. This does not confirm availability.` Conserva el valor al cambiar Operation o Availability; Discard restaura el valor guardado. |
| D6 | Fila de Listings: baños en `.meta`, como span independiente: `0 baths`, `1 bath`, `2 baths`, etc. `null`/`undefined` no dibujan el dato ni se convierten en cero. Mantener `Studio` para 0 dormitorios y `N bed` para los demás. |
| D7 | En la celda Availability, añadir `Available from {fmtDayMonth(date)}` solo si hay fecha, `archived_at == null` y `availability` pertenece a `ON_MARKET`. La fecha nunca sustituye el estado ni el badge To confirm. En filas archivadas o estados fuera del mercado, mantener la fecha almacenada y editable, pero no presentar una fecha de disponibilidad activa en la lista. Sin fecha no se añade línea ni se infiere "Available now". |
| D8 | GET `/admin/listings` normal incluye `bathrooms` y `available_from`; `?slim=1` conserva su contrato mínimo. El detalle ya selecciona `l.*`. La proyección pública `toPublic` permanece sin este campo: publicar la fecha en la web pertenece a otro alcance. |
| D9 | La migración nueva recrea `listing_event_insert` y `listing_event_update`, conservando su comportamiento y agregando `available_from` a fields/after de creación y a before/after/changed de actualización. No se modifica una migración histórica ni se inventan eventos anteriores. No-op y conflicto no crean eventos; un fallo del evento revierte el guardado. |
| D10 | PUB-06 consumirá exactamente este campo y su validación; no añadirá otra fecha, otro editor ni una segunda migración para el mismo dato. Los otros campos económicos de PUB-06 siguen pendientes. |

## Revisión grill-me: cuestiones resueltas

- **Fecha frente a confirmación:** D4; introducir una fecha futura no confirma la disponibilidad. El botón Still available mantiene su función y no modifica esta fecha.
- **Datos desconocidos o antiguos:** D1–D3 y D6–D7; no se fabrican valores ni se declara disponibilidad actual por una fecha pasada.
- **Cambio a Sold/Withdrawn o archivado:** D5 y D7; conservar el dato histórico y evitar afirmarlo como disponibilidad activa en la fila, incluso cuando una archivada conserve `for_sale`/`to_let`.
- **Dos editores:** D4/D9; un PUT con versión antigua devuelve 409; conserva el borrador en pantalla, no sobrescribe y no registra un evento ficticio.
- **Permisos y datos:** se usan las rutas admin y sesión/CSRF existentes, sin endpoint público nuevo, claves, datos personales adicionales ni cambio de política.
- **Migración e historial:** D9; preservar los triggers de EST-18 y las referencias de events/notifications. La aplicación de producción se autoriza por separado.
- **Dependencias:** el catálogo señala revisión de diseño con PUB-06 como relación inferida y parcial. Este spec define el contrato compartido; no afirma que PUB-06 esté aprobado o integrado. El coordinador debe confirmar la revisión antes de build.

No quedan decisiones funcionales abiertas para redactar el plan. Quedan revisión del diseño, habilitación de build y elección del número de migración libre al iniciar la construcción; son puertas de ejecución, no autorización implícita.

## Alcance y aceptación

| Criterio | Resultado esperado | Evidencia futura |
| --- | --- | --- |
| A1 | Baños 0, 1 y 2 visibles con plural correcto; desconocidos omitidos; dormitorios conservados. | Pruebas de helpers + e2e de fila. |
| A2 | Crear, editar, guardar, recargar y borrar la fecha conserva el día exacto, sin desplazamiento horario. | Validación, API y recorrido en dos zonas horarias. |
| A3 | Fecha imposible, timestamp, tipos incorrectos y año cero producen error de campo sin escritura. | Pruebas de `validateListing` y rutas. |
| A4 | Cambiar solo la fecha conserva `confirmed_at`, estado, visibilidad y filtros existentes. | API + e2e de To confirm y estados. |
| A5 | Base previa migra conservando filas; historial registra antes/después real; no-op/409/rollback no agregan eventos. | Migración SQLite + pruebas EST-18. |
| A6 | Guardado, Discard, error 400 y conflicto 409 son utilizables a 1280 y 390 px con teclado y zoom 200 %. | E2E y Playwright MCP; consola/red y capturas. |
| A7 | PUB-06 tiene un contrato único y SPR-01 se mantiene parcial hasta implementar, verificar y publicar. | Revisión documental y cierre del coordinador. |

## Límites

No rediseñar Listings como una nueva rejilla; no añadir filtros, exportaciones, capturas, automatizaciones, fuentes, nuevas reglas de publicación ni el resto de PUB-06. No descargar ni generar assets. Las pruebas y migraciones descritas se ejecutarán en la construcción, con fixtures locales. Esta entrega solo valida documentos.

Reglas visuales, archivos exactos, pruebas y orden de ejecución: [plan](../plans/2026-11-08-spr-01-listing-availability.md). Estado y comprobaciones de esta planificación: [ledger](../plans/2026-11-08-spr-01-listing-availability-ledger.md).

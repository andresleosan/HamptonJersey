# PUB-04 · Evidencia de construcción local de datos internos

Fecha: 11-nov-2026. Estado: **código integrado y desplegado; verificación en navegador pendiente**. PUB-04 sigue parcial por esa comprobación.

## Revalidación de alcance · 11-nov-2026

- Luis autorizó publicar dirección exacta por ficha después de que el panel muestre el snapshot público completo, la persona marque consentimiento del propietario y registre una referencia sin datos de contacto.
- El hash liga ficha/metadata/JSON-LD/medios y el último título de carpeta Drive. Cualquier cambio requiere revisión nueva; no se cambia la carpeta. No se activan automáticamente fichas previas.
- Luis autorizó después push, unión a `main` y publicación en producción. `0040` es necesaria para el código publicado.

## Base y alcance

- Base revisada: `main` `37d0287a67d9776f050400bab595bd681ee43b39`, worktree limpio al inicio. Los cambios están en `/tmp/hampton-roadmap-integration`; el checkout compartido con archivos locales no relacionados quedó intacto.
- `$avanzar` autorizó la implementación y validación locales del tramo interno y de la revisión pública por ficha; la orden posterior amplió el alcance a su integración en producción.

## Construido

- `migrations/0040_listing_address_details.sql`: añade `property_condition` como campo único de `listings` compartido con PUB-05, crea `listing_details` para inmueble/unidad, código postal y promotor, y amplía el trigger de EST-18.
- `server/listing-details.js` y `server/routes/listings.js`: validación cerrada, trim y normalización; Jersey valida el formato JE y fuera de Jersey no se fuerza ese formato. La ruta admin devuelve y actualiza solo los detalles internos. Cambios efectivos comparten CAS `listings.updated_at` y el batch que registra el evento; `listing_details` solo se escribe si el UPDATE protegido cambió una fila, incluso con un reloj de ficha adelantado. Los cambios de dirección guardan solo nombres de campo en historial; `property_condition` conserva antes/después. Un cambio interno no actualiza `confirmed_at` ni recalcula matching. El promotor solo se puede añadir en `new_build`; un valor existente puede conservarse o borrarse si después cambia la condición.
- `server/listing-events.js`, `server/listing-history.js`, `admin/src/ListingHistory.jsx`: aceptan y proyectan los nombres internos de campo sin exponer su contenido.
- `admin/src/ListingEditor.jsx`: agrega inmueble/unidad, código postal, estado, promotor, preview interno, enlace voluntario a Jersey Post, foco del primer error y estado compartido de Guardar/Descartar. `Location` se etiqueta `Public location`; `Road` se etiqueta `internal`. No hay geocodificación ni consulta automática.
- Dirección exacta: preview autenticado de DTO, texto público, medios, OG/SEO/JSON-LD y título Drive; autorización con referencia/actor/fecha y CAS. `toPublic` solo la añade si snapshot/hash siguen vigentes. Texto con edificio y calle ya publicados sin consentimiento oculta la ficha en API, página SEO y sitemap. Unpublish/archive y revocación borran la aprobación.
- Pruebas: `tests/server/listing-address.test.mjs` y `tests/listing-address.e2e.cjs`. La segunda cubre la interacción prevista, pero el navegador no llegó a ejecutarla en este entorno.

## Validación local

- RED inicial: las seis pruebas iniciales de PUB-04 fallaron por ausencia de comportamiento.
- `node --test tests/server/listing-address.test.mjs tests/server/public.test.mjs`: 35/35 PASS tras completar la revisión por snapshot.
- Con History, Events y SEO: 97/97 PASS. `npm run build`, `npm run check:release`, `npm run team:check` y `git diff --check` PASS antes de integrar.
- `node --test --test-reporter=dot tests/server/listing-address.test.mjs tests/server/listing-history.test.mjs tests/server/listing-events.test.mjs`: 59/59 PASS, incluidas las regresiones de CAS con reloj adelantado y del promotor.
- La revisión independiente detectó que la escritura de detalles dependía del reloj de pared y podía omitirse tras un CAS válido con timestamp adelantado. Se corrigió para depender de los cambios de la sentencia CAS inmediatamente anterior y la regresión pasa. Relectura final local del diff completada.
- Última `npm test` completa, ejecutada antes de añadir esas dos regresiones: 1.142/1.148 PASS. Seis suites DOM no arrancan porque falta el paquete local `jsdom`; no son fallos de aserciones. No se repitió la suite completa tras las dos regresiones; las pruebas backend focales sí se repitieron.
- `python3 -m unittest tests/test_import.py`: 14/14 PASS.
- `npm run build` y `git diff --check`: PASS tras el flujo de revisión. Vite conserva su aviso de chunk de más de 500 kB.
- `node --check tests/listing-address.e2e.cjs`: PASS. `npm run test:e2e` no pudo cargar `playwright-core`; el runner usó D1 temporal local. El navegador conectado también rechazó el arranque porque su sandbox de Chromium no puede ejecutarse como root; no se desactivó el sandbox.
- Los helpers de D1 en memoria aplicaron las migraciones para las pruebas de API/eventos. Esas pruebas no usaron datos de clientes.

## Integración y producción

- Antes de aplicar `0040`, era la única migración pendiente en `hampton`; el esquema y el trigger coincidían con la base, y se obtuvo un punto de recuperación D1. Tras aplicarla, no quedaron migraciones pendientes y los objetos y el trigger coincidieron con la migración revisada.
- GitHub impidió crear una rama nueva por su regla de creación. El árbol y commit remotos coincidieron exactamente con el local; `main` avanzó sin `force` desde `37d0287` a `13a1a51486da948c9ed0a289b6cbb198c0fa81aa`. Pages y Workers Builds `hampton-jobs` terminaron correctamente para ese SHA.
- La comprobación HTTP automatizada del sitio recibió 403/1010 de Cloudflare por la firma del cliente. No se modificó el control ni se acredita un smoke público desde este entorno.

## Privacidad, Centinela y pendientes

- La alerta `private-key-or-token-output` correspondió al patrón sintético ya conocido del arnés local de pruebas. Se clasificó como falso positivo, sin evidencia de credenciales de producción expuestas ni compromiso activo. No se hicieron cambios de seguridad ni se consultó el VPS.
- La interfaz E2E no pudo ejecutarse sin `playwright-core`; su sintaxis pasa. Ninguna ficha existente recibió consentimiento ni se publicó automáticamente.
- Falta ejecutar el E2E y verificar el flujo público y administrativo desde un navegador autorizado.

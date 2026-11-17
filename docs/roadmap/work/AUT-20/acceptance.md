# AUT-20 · Aceptación integral y evidencia visual

17-nov-2026. Cierre de la tarea 3 del [plan](../../../superpowers/plans/2026-11-08-aut-20-integrated-search-acceptance.md). El índice máquina está en [`evidence-index.json`](evidence-index.json) y el resultado por comprobación en [`resultados.md`](resultados.md).

## Qué se comprobó

### 1. Recorrido completo en el servidor

Se ejecuta con `node --test tests/server/aut-20-search-journey.test.mjs` (commit `83e7a674`), sobre una sola base D1 local y con los módulos reales:

- Pasan las 16 comprobaciones A01–A16 y los cinco casos transversales X1–X5.
- La última prueba exige que pasen las 21 juntas.

### 2. Recorrido en el navegador

Se ejecuta con `E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/aut20-journey.e2e.cjs npm run test:e2e:isolated`: un contenedor sin red, con Chromium sobre la base local y datos sintéticos.

**Montaje.** Antes de recorrer las pantallas, la prueba construye un recorrido con la propia API del panel:

- Alta de dos hogares; uno de ellos tiene dos búsquedas.
- Una consulta compartida, enviada a mano y contestada «disponible».
- La captura y una foto aprobada para clientes.
- Dos presentaciones privadas:
  - la del hogar dos, revisada, aprobada y enviada;
  - la del hogar uno, pendiente de revisión.
- Una visita propuesta a la agencia (VIS-17): la acepta el cliente y la agencia todavía no.
- Un dictado de criterios pendiente de confirmar.
- La revisión del día 21 de la búsqueda de compra (BUS-17).
- Una propiedad cuyas fotos de referencia se purgaron a los seis meses de quedar no disponible (EST-19).

**Pantallas recorridas.** Después recorre, sin cambiar nada, cada pantalla clave del personal y la página del cliente:

| Pantalla | Qué se comprueba |
|---|---|
| Lista de Applicants | Etiquetas de trabajo «Viewing pending» y «Search review due» |
| Ficha del applicant | Acciones Send shortlist y Book viewing |
| Matches | Estado del recorrido (EST-14) y revisión de la presentación (AGE-11) |
| Enquiries de la propiedad | Evidencia de AGE-09, abierta con el teclado y sin nombres ni contactos |
| Visita | Coordinación «Waiting for answers», sin el botón Confirm |
| Inbox | Revisión del día 21 con Done |
| Historial de la propiedad purgada | Evento «Reference photos removed after six months not available» |
| Página del cliente (AGE-12) | Presentación enviada |

**En cada pantalla** comprueba lo siguiente:

- **Capturas:** a 1280 y a 390 de ancho.
- **Teclado:** se llega a las acciones principales con Tab desde el principio de la página. Las pulsaciones necesarias figuran en `evidence-index.json`.
- **Ancho:** no hay desplazamiento lateral.
- **Zoom:** la pantalla a 1280 con zoom del 200 % se reproduce con una ventana de 640 px CSS y escala 2, sin desplazamiento lateral.
- **Errores:** ningún error de consola o de página, y ninguna petición al propio origen fallida o con respuesta 4xx/5xx.

Al terminar, `outbound` sigue vacío y ninguna búsqueda cambió de estado.

## Qué es simulado y qué queda fuera

- **Correo.** El proveedor es simulado: en la suite de servidor, `env.EMAIL` registra los mensajes en memoria. El fixture del navegador no tiene enlace de correo ni Worker de reloj, así que no se envía nada. Esto demuestra el contrato local, no una entrega real.
- **Reloj.** Lo simulan las pruebas: el tick de BUS-17 corre con el pase real sobre la misma D1 local, mediante el proxy de Wrangler. Las fechas futuras (día 21, seis meses) se inyectan o se simulan con `t.mock.timers`.
- **Activaciones externas.** Encender interruptores en producción, enviar correo real y activar Telegram, Hermes o cuentas son pasos separados, que siguen las autorizaciones de [CONTINUIDAD-AVANZAR](../../CONTINUIDAD-AVANZAR.md). Esta aceptación no los concede ni los da por hechos.
- **Producción.** No se tocó: ni lecturas ni escrituras.
- **Capturas.** No se guardan en el repositorio, como en el resto de tareas. Cada ejecución las deja en `E2E_ARTIFACT_DIR` (por defecto `/tmp/hampton-browser-captures/run-*`) con los nombres que lista `evidence-index.json`.

## Fallos abiertos

Ninguno invalida el recorrido.

Las cuatro observaciones de la validación están en [MEJORAS](../../MEJORAS.md): EST-19, AGE-08, EST-15 y NOT-11. El comentario de cabecera de `server/property-photo-purge.js` ya describe el orden real (primero las filas, después los archivos).

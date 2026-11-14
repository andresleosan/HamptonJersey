# AUT-10 · Modos por operación integrados — 14 nov 2026

Rama de trabajo aislada; sin despliegue, sin `--remote`, sin producción. Todo queda detrás de `AUT10_MODES_READY === '1'` (apagado por defecto; `wrangler.toml` sin tocar).

## Qué se construyó

- **Migración `0054_operation_policies.sql`** (aditiva): `operation_policies` (modo `Draft`/`Approve`/`Auto` y `revision` por automatización+operación), `operation_policy_versions` (historial de solo inserción), `operation_policy_managers` (quién puede cambiar modos; no siembra a nadie). Siembra las tres operaciones revisadas de AUT-09 en `Draft`, revisión 1. Triggers: no se insertan operaciones nuevas, no se borran filas, cada cambio sube la revisión exactamente en 1 y deja una versión; el historial no se edita ni se borra; borrar un admin o cambiar su email revoca su permiso, y volver a añadirlo no lo restaura.
- **`server/operation-modes.js`**: `readOperationModes`, `setOperationMode` (CAS por `expected_revision`, con la autoridad comprobada en la misma sentencia `UPDATE`; 403 sin permiso, 409 con la política actual si la revisión es vieja, 400 ante operación/modo desconocidos o campos extra) y `checkOperationMode`, la guarda para consumidores.
- **Rutas**: `GET /admin/automations` añade `modes` solo con el interruptor encendido; `POST /admin/automations/modes` solo se monta con el interruptor (`server/api.js`, como `MARKET_INVENTORY_READY`). El actor es el email de la sesión; el origen lo exige el router (mismo origen).
- **Interfaz**: tarjeta «Modes» en Automations con un `select` nativo por operación; confirmación al pasar a Auto; sin permiso, los controles quedan deshabilitados con aviso.

## Invariantes humanas

`checkOperationMode` devuelve `allowed:false` con `human_decision_required` para las cinco decisiones (`match_approval`, `unknown_required_consultation`, `dictated_criteria_confirmation`, `search_resolution`, `presentation_review`) en cualquier modo, aunque la entrada traiga `confidence`, `percentage` o `approved`. Solo `perform_operation` puede salir permitida, y aun así devuelve `gates` (puertas de AUT-09 que el consumidor debe cumplir) y `review` (`each`/`batch`/`sample`). Operación desconocida: `unknown_operation`. Falta un trigger de guarda: `policy_unavailable`. Revisión cambiada desde la preparación: `policy_changed`.

## Pruebas

- Nueva `tests/server/aut-10-modes.test.mjs`: **8/8** (falló primero por módulo inexistente). Cubre interruptor apagado idéntico (sin `modes`, POST 404 incluso sin sesión), 403 sin permiso, CAS con 409 y carrera de dos escritores, 400 ante afirmaciones extra, origen cruzado 403, revocación por admins, triggers anti-ABA, aceptación (Auto no escribe fuera de la política y ninguna decisión humana sale permitida) y revalidación por revisión.
- Focales relacionadas (automations, aut-10 store/D1 Miniflare, policy, contracts): **38/38**; la de Miniflare aplica todas las migraciones, 0054 incluida.
- E2E aislado `tests/aut-10-modes.e2e.cjs` (Chromium en contenedor sin red, datos ficticios) a 1280 y 390: **PASS** (tarjeta oculta con el interruptor apagado, cambio a Auto, 409 que muestra el modo actual, sin desplazamiento horizontal).
- `npm test`: **2313/2317** Node. Los 4 fallos fueron pruebas D1 de Miniflare lentas, ajenas a AUT-10 (`est-01-progress-d1`, `pre10-contact-d1`, `msg-02-semantic-d1`, `notification-reconcile`); al repetirlas en serie pasaron **15/15**. La parte Python no se ejecutó porque el resumen se cortó en la parte Node.
- `check-release --strict` y `vite build` aprobados. Tarjeta en `admin/src/AutomationModes.jsx` para que `Automations.jsx` solo cambie dos líneas.

## Decisiones (fuente: opción más simple y reversible salvo que se indique)

- Tablas propias en vez de `app_settings`: filas imborrables y revisión monotónica eliminan el ABA documentado el 13-nov (fuente: `store-cas-bloqueado-2026-11-13.md`).
- Autoridad = sesión de admin **y** fila en `operation_policy_managers` (pertenecer a `admins` no basta, según el mismo documento); sin API de concesión.
- Modo inicial `Draft` para las tres operaciones (fuente: `policy-foundation-2026-11-13.md`).
- Sin modo «Off»: lo desconocido queda apagado por no existir fila ni definición revisada; el interruptor general sigue en otras tareas.
- Las funciones 503 de `operation-policy-store.js` y la inspección de `operation-policy.js` se dejan intactas; la vía efectiva vive en `operation-modes.js`.
- Revalidación antes del efecto por `expected_revision` en `checkOperationMode`, no por aserción dentro del lote D1 del consumidor.
- Una fila falsificada a mano en `operation_policy_versions` solo puede bloquear el siguiente cambio (clave duplicada), no conceder nada; se acepta.

## Traspasos (no son de AUT-10)

- **BUS-15 / AUT-19 / EST-09**: llamar `checkOperationMode` antes de cada efecto y mantener su propia aprobación humana; la guarda nunca la concede.
- **AUT-13 (Hermes `listing_text`)**: leer el modo y pasar `expected_revision` antes de entregar o aplicar el borrador.
- **AUT-01 (pantalla)**: interruptor por automatización, coste, porcentaje de éxito y registro de ejecuciones.
- **Luis (COLA-LUIS)**: aplicar 0054, encender `AUT10_MODES_READY` y conceder `operation_policy_managers` a quien deba cambiar modos (INSERT manual).

## No verificado

Migración no aplicada en ninguna base remota; interruptor no encendido; ningún consumidor real llama todavía a la guarda; WebKit no probado; sin revisión independiente.

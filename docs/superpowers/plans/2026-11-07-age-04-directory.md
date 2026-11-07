# AGE-04 Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox syntax.

**Goal:** Proporcionar al equipo un directorio protegido de anunciantes con relaciones, teléfonos, permisos y revisión humana de datos personales.

**Architecture:** Persistencia aditiva D1, rutas autenticadas y panel React reutilizan los patrones existentes. La revisión de datos personales es explícita y no ejecuta borrado automático. Los módulos posteriores consumen las relaciones sin fingir que las investigaciones, publicaciones multifuente o llamadas ya existen.

**Tech Stack:** Cloudflare D1/SQLite, Workers JavaScript, React, node:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-age-04-directory-design.md`

## Global Constraints

- Panel: CSS vigente `--ink #151515`, `--paper #ffffff`, `--mist #f4f3f0`, `--line #e3e0da`, `--stone #6b665e`, `--bronze #a56b3d`, `--bronze-dk #86542d`, `--ok #2f6b4f`, `--err #a32020`, campo `#fbfaf8`, borde `#8f8a82` (DESIGN Colors, verificación de panel y `admin/src/styles.css`). No presentar paleta anterior como actual.
- Tenor Sans títulos, Montserrat cuerpo 14px/1.5, H1 26px, H2 19px, etiquetas 12px; pesos 400/500/600 (Typography). Inglés visible; español para documentación.
- Página 1240px y 16px lateral/120px inferior; botones radio 999px y padding 10px 20px, tarjetas radio 14px y padding 24px, campos 10px, celdas 10px 12px (Layout, Shapes, Components). Reutilizar `.btn`, `.card`, `.field`, `table.list`, `.empty`, `.badge`; listas se apilan a 760px. Espacios nuevos 4/8/12/16/24/32/48/64 y breakpoints 480/760/980 son propuestas, no hechos ya aplicados.
- Etiquetas nativas, errores asociados, `role=alert/status`, foco 2px offset 2px, texto de contraste ≥4.5:1, controles ≥3:1, teclado, 200% y reduced motion; comprobar 1280 y 390 (Accessibility). No añadir librerías ni recursos gráficos; listas acotadas/paginadas y sin almacenamiento local de datos personales (Performance/Security).
- Panel Hampton tiene prioridad: impeccable jerarquía y estados; taste y antislop densidad de trabajo sin adornos; frontend-security y security-best-practices validan servidor, XSS, enlaces, permisos y concurrencia; web-performance evita consultas y dependencias excesivas; ponytail reutiliza rutas/componentes. Redesign no aplica como rediseño global; revisión funcional de la navegación existente sí aplica.
- Sin publicación, migración remota ni activación. Fecha de 11/12 meses se calcula en Jersey y no equivale a borrado automático.

## Review Focus

- Identidad repetida: sugerir revisión y no fusionar silenciosamente.
- Ediciones simultáneas: conflicto visible sin pérdida de datos.
- Fuentes o publicaciones inexistentes: no crear referencias falsas.
- Enlaces maliciosos: rechazar esquemas ajenos a HTTP(S), renderizar texto.
- Fin de mes y año bisiesto: revisión y vencimiento por meses calendario Jersey; sin borrado automático.

### Task 1: Persistencia, validación y API

**Files:** crear `migrations/0027_advertisers.sql`, `server/routes/advertisers.js`, pruebas `tests/server/advertisers.test.mjs`; modificar `server/api.js`.

**Interfaces:** `GET/POST /admin/advertisers`, `GET/PUT /admin/advertisers/:id`, `POST /admin/advertisers/:id/{activity,retain,erase}`; `version` entero para actualización condicional. Filtros `property_id` por `research_sources` y `listing_id` por catálogo, ambos paginados. `contacts[]` con `name`, `email`, `phones[]` (`label`, `number`); `channels[]` con `label`, `url`, `personal`; IDs existentes de fuentes y listings; comisión y permiso de fotos separados. La fecha `activity_on` alimenta los 11 y 12 meses calendario, con ajuste al último día del mes; `retain` exige motivo y actor, no reinicia el reloj; `erase` borra contactos y campos marcados personales y anonimiza nombre marcado personal, sin afectar relaciones.

- [x] Escribir pruebas de acceso, alta/edición, múltiples teléfonos, referencias, estados y conflictos.
- [x] Ejecutar la prueba y verificar fallo previo a la implementación.
- [x] Implementar migración y rutas protegidas, validación acotada, revisión atribuida y eliminación personal manual segura.
- [x] Ejecutar pruebas focales y resolver los fallos.

### Task 2: Panel y validación de entrega

**Files:** crear `admin/src/Advertisers.jsx`; modificar `admin/src/App.jsx`, `tests/e2e.cjs`, ESTADO, checklist, reconciliación y ledger.

- [x] Construir listado y ficha editables, enlaces válidos, estados de carga/error/vacío/conflicto, acciones humanas de conservación y confirmación de borrado.
- [x] Cubrir flujo y estados con pruebas locales, luego ejecutar `npm test`, `npm run build`, `npm run check:release`, `npm run test:e2e` y recorrido MCP 1280/390 con teclado, foco, ampliación CSS, errores, consola y red. El zoom nativo 200% se acreditó después en 390 y 1280; ver ledger y revisión independiente de 0b41ec4.
- [ ] Preparar revisión independiente de Hermes, registrar resultados y limitaciones, actualizar ESTADO/checklist y hacer commit local en main. Sin push ni migración remota.

## Corrección de ciclo de vida tras revisión de 7932fbf

Archivos: `admin/src/App.jsx` crea el coordinador por sesión y lo pasa a `Advertisers`; `admin/src/advertiserSession.js` conserva únicamente token, generación e IDs y notifica suscriptores; `admin/src/Advertisers.jsx` consume ese estado, impide operaciones concurrentes y elimina de la vista las respuestas previas a una supresión. `tests/e2e.cjs` verifica las interleavings; spec: `docs/superpowers/specs/2026-11-07-age-04-directory-design.md`.

- [x] RED: retener POST erase, navegar Insights y volver, retener GET real anterior en instancia nueva y liberarlo tras POST 200; el primer caso 390/200 reprodujo PII. En GREEN comprobar también 390/1280 y reconciliación 200/200 y 503/503.
- [x] Crear coordinador de sesión sin PII; bloqueo síncrono con token propietario y generación invalidada en erase 200.
- [x] Suscribir cada instancia; depurar de inmediato presentación de lista/ficha/historial, descartar respuestas antiguas y liberar correctamente ante fallo de POST. Comprobar además hash/atrás, doble entrada y otras mutaciones.
- [x] GREEN: E2E focal y MCP local; después npm test, build, check:release y E2E general. Comprobar zoom nativo 200% si el entorno lo permite y registrar límites.
- [x] Actualizar ledger, ESTADO y checklist; preparar relevo y commit local para revisión independiente, sin push, migración o activación.

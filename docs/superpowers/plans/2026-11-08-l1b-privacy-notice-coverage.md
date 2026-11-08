# PRE-09 privacy notice coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Solo documentación ahora; no construir, migrar, activar o publicar.

**Goal:** Mantener el aviso existente con controlador Hampton Estates LTD, textos manuales versionados y reconocimiento real de la versión mostrada.

**Architecture:** Configuración pequeña en fuente y validación/hash compartidos, reutilizando renderPrivacy y lectores ya referenciados. Sin CMS, circuito jurídico, tabla de releases ni publicación desde panel; los parámetros se validan antes de activar el servicio correspondiente.

**Tech Stack:** ESM JavaScript, site vanilla JS, Pages/D1 actuales y node:test.

**Spec:** [diseño](../specs/2026-11-08-l1b-privacy-notice-coverage-design.md).

## Global Constraints

- Controlador literal `controller:{name:'Hampton Estates LTD'}`. Dirección/contacto públicos actuales conservados. No identidad alternativa ni dato institucional pendiente como bloqueo de construcción.
- Datos/textos existentes los añade Luis/equipo manualmente. No nuevo dossier, revisión jurídica o sistema de aprobaciones. Validación estructural/hashes y activación consciente del servicio sí se implementan.
- Conservación configurable; no hardcodear nuevos períodos de venta/alquiler. Aviso coherente con versión de parámetros validada antes del uso real.
- Solicitudes de copia/borrado por email y equipo PRE-12, housing solo Lettings. No añadir autoservicio de privacidad o comunicar tours aplazados como activos.
- Página renderPrivacy y enlaces `l1-privacy-links` ya planeados se reutilizan, sin nuevo editor/página o enlace duplicado. Aviso leído no significa consentimiento de valoración.
- CSS real frente a YAML desfasado: panel ink #151515/paper #fff/mist #f4f3f0/line #e3e0da/stone #6b665e/bronze #a56b3d/bronze-dk #86542d/ok #2f6b4f/err #a32020/field-line #8f8a82; Montserrat 14px/1.5, Tenor 26/19px 400; card 14px/padding 24px, campo 10px/padding 9px 12px, botón 999px/padding 10px 20px, gaps 8/12/16/24px, page 1240px/24px 16px 120px, corte 760/editor 900, foco 2px offset2, disabled .45. Web 15px/1.65, campo 12/card 16/pill 999. Valores completos en spec aplican.
- Inglés, labels/errores asociados/status/alert, teclado/1280/390/zoom 200%/reduced-motion, contraste texto 4.5:1/foco 3:1. Sin librerías/fuentes nuevas ni PII en URL/storage/logs.

## Review Focus

1. Identidad de configuración distinta al nombre confirmado: validación rechaza y jamás inventa otro controlador (Task 1).
2. Cambiar texto/orden visible/enlace sin actualizar hash o dejar campo vacío: error estructural antes del uso, sin falsa validez (Task 1).
3. Promise de validación no esperada o respuesta tardía del render: no mostrar éxito/configuración parcial (Task 1/2).
4. Aviso cambia antes del registro:409 conserva borrador y no inventa reconocimiento histórico (Task 2).
5. Contenido de housing en compra/negocio o función aplazada descrita como activa: cobertura y pruebas de copy lo impiden (Task 2).

## File map

Crear `site/privacy-notice-content.js` (datos manuales), `site/privacy-notice.js` (validador/hash/render de datos), `server/privacy-notice.js` (lector compatible), `tests/privacy-notice-render.test.mjs`, `tests/server/privacy-notice.test.mjs`, `tests/privacy-notice.e2e.cjs`. Modificar `site/apply.js`, `site/index.html` solo espera/promesa de la página existente, `server/applicants.js`, `server/routes/public.js` y el check de configuración en `scripts/check-release.mjs`; `site/_headers` solo si la caché del nuevo módulo necesita revalidación. Sin PrivacyNotice.jsx, rutas de administración/publicación o nuevas tablas de documentos. Si la persistencia del reconocimiento necesita columnas, siguiente migración aditiva al construir: privacy_notice_version/hash nullable; nombre secuencial libre entonces, no archivoSQL ahora.

### Task 1: Configuración manual y funciones asíncronas únicas

**Files:** crear módulos site/privacy-notice-content.js, site/privacy-notice.js, server/privacy-notice.js y tests/server/privacy-notice.test.mjs; modificar scripts/check-release.mjs.

**Interfaces:** `PrivacyNoticeV1`, `privacyNoticeContentHash(notice):Promise<string>`, `validatePrivacyNotice(value:unknown):Promise<NoticeValidation>` y `loadPublishedPrivacyNotice(env):Promise<PrivacyNoticeV1>` exactos de spec. Lector manual sin estados de aprobación/tablas. Validador produce content_hash canónico; si input aporta hash lo comprueba.

- [ ] RED `controller_name_is_exact_hampton_estates_ltd`, `manual_config_rejects_extra_identity_fields`, `current_public_contact_is_preserved`, `hash_excludes_only_itself`, `hash_covers_every_visible_field`, `visible_order_changes_hash`, `duplicates_extra_keys_and_invalid_urls_rejected`, `missing_text_blocks_affected_service_without_fake_copy`, `load_and_validate_are_awaited`. Afirmar hash determinista y error concreto, no cadena Promise como éxito.
- [ ] Ejecutar `node --test tests/server/privacy-notice.test.mjs`; esperar FAIL por módulos nuevos.
- [ ] Implementar datos manuales y un único algoritmo SHA-256/validador await conforme spec. Nombre confirmado fijo, contacto actual, texto seguro y límites. Añadir check de preparación que enumera campos inválidos; nadie genera contenido legal automáticamente ni exige otra aprobación externa. Configuración provisional se prueba con fixtures identificados; el servicio que la requiere no se activa hasta completarla/validarla.
- [ ] GREEN repetir comando; errores no filtran datos ni pasan por objeto truthy de Promise. Cambiar parámetros/texto sin versión/hash coherentes se detecta. No crear CMS, rutas publish o tablas jurídicas.
- [ ] Revisar diff y guardar commit futuro solo en encargo de construcción autorizado; nada de git add/commit ahora.

### Task 2: Página actual, reconocimiento y cobertura del alcance confirmado

**Files:** modificar site/apply.js, site/index.html, server/applicants.js, server/routes/public.js; crear tests/privacy-notice-render.test.mjs y tests/privacy-notice.e2e.cjs; adaptación cache site/_headers solo si requerida por asset nuevo.

**Interfaces:** `renderPrivacy(root):Promise<void>` conserva ruta actual. Registro envía privacy_notice_version/hash leídos de configuración; servidor usa lector Task 1. Reconocimiento actual en evento/campos versionados, históricos NULL/legacy_unknown, sin backfill.

- [ ] RED `existing_privacy_page_uses_one_manual_source`, `legal_text_is_rendered_as_text`, `email_requests_team_review_are_described`, `housing_text_only_in_lettings_context`, `inactive_tours_not_announced_active`, `notice_changed_before_submit_409_preserves_answers`, `unknown_old_ack_is_not_backfilled`, `duplicate_registration_does_not_overwrite_verified_ack`, `notice_ack_does_not_grant_valuation_permission`.
- [ ] Ejecutar `node --test tests/privacy-notice-render.test.mjs tests/server/privacy-notice.test.mjs`; esperar FAIL de integración nueva.
- [ ] Integrar módulo en render existente y esperar promesa en navegación; carga/error con texto y respuesta tardía descartada. Escape/textContent/enlaces seguros. Añadir versión/hash a registro y verificar antes de consumir antispam;409NOTICE_CHANGED obliga releer/confirmar versión actual con borrador conservado. Tras despliegue con cliente antiguo ofrecer recarga de documento completa y revalidación de asset, no bucle infinito contra módulo ESM cacheado; datos privados permanecen en memoria del flujo actual, no URL/storage nuevo. No reconstruir enlaces de reserva del otro plan.
- [ ] GREEN focales y futuro `node tests/privacy-notice.e2e.cjs`: página única/nombre exacto/contacto actual, configuración manual legible, stale client puede recuperar versión y continuar, datos no perdidos ni consentimientos inventados. Playwright 1280/390/zoom 200%, teclado/foco/error/loading y red/consola. No demostrar con textos privados no vistos; usar fixtures y registrar configuración real pendiente de cargar cuando proceda.
- [ ] Validación futura `npm test`, `npm run build`, `npm run check:release` y e2e general requerido; actualizar ledger/catalogación con hechos reales por coordinador al construir. Revisión y publicación se autorizan aparte. El plan está listo para construir, no implica producto ni servicio activos.

## Self-review

C1/C2/C3→Task 1, C4/C5→Task 2. Cinco focos tienen casos concretos. Sin CMS ni estados de aprobación, prueba jurídica ficticia, solicitud de datos confirmados o identidad de cliente. La configuración manual y validación antes del uso son las condiciones pendientes normales de activación.

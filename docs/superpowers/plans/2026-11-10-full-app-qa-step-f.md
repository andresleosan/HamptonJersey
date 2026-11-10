# Paso F · preparación del artefacto y pruebas publicadas

> **For agentic workers:** Usar superpowers:executing-plans y TDD. La preparación está autorizada; despliegue, carga de identidad real QA y pruebas remotas mutables esperan el sí para SHA/huellas/destino finales.

**Goal:** Entregar artefacto publicable exclusivo QA y paquete revisado de pruebas desde el runner E1, con huellas antes de publicar.

**Architecture:** Copia permitida del SHA main en build/qa-full-app-F, overlays QA fuera del código empresarial y Functions con guardia para todas las rutas. Reutilizar autenticación, handlers y UI existentes; simular integraciones sin credenciales/proveedores reales. Runner aislado firma la sesión QA solo después del permiso F, usando stdin/tmpfs.

**Tech Stack:** Dependencias fijadas por package-lock, Vite, Wrangler/Miniflare local, Playwright-core 1.65.0, Docker runner E1 existente.

**Spec:** `docs/superpowers/specs/2026-11-09-full-app-qa-design.md`.

## Límites globales

- Proyecto único: hamptonjersey-qa, origen https://hamptonjersey-qa.pages.dev.
- D1 hampton-app-qa / 53bc4af9-7250-44fe-8f90-6e415fda1034, MEDIA hampton-app-qa-media.
- Preview sin D1/R2/secretos; Access raíz y wildcard antes de datos.
- Fuente main 80ad03df7e095750f455aa4aa668573e9aac5db4; sin push ni cambios de producto empresarial.
- No publicar, cambiar config remota, leer secretos QA reales o mutar QA remota durante preparación.
- No QA_HISTORY_ACTIVE, endpoint de login nuevo, sesión del dueño ni credenciales de provisión en runner.
- No copiar .dev.vars, perfiles, .git, migraciones/semillas empresariales o datos reales al artefacto.
- Construir en carpeta ignorada separada; no sobrescribir site/admin empresarial.

## Review Focus

1. Guardia solo API: exigir host exacto y testigo D1 para assets, páginas, SEO, medios y simuladores.
2. Providers/enlaces reales: neutralizar Firebase/Google, Drive, correo, Hermes, Turnstile y contactos/embeds; distinguir simulación.
3. Secretos en redirect/logs/storage: identidad por stdin a tmpfs, cabeceras solo origen QA, rechazar redirects de peticiones autenticadas.
4. Cleanup destructivo: registrar IDs creados y usar deletes soportados; no reset ni borrar fixtures base.
5. Evidencia insuficiente: pruebas del artefacto local separadas de smoke publicado aún no ejecutado; cobertura por módulo/modo.

## Archivos y contratos

- `docs/qa/full-app/publish/overlay_frontend.py`: apply_frontend(workroot)->dict, solo copia staging.
- `docs/qa/full-app/publish/overlay_backend.py`: apply_backend(workroot)->dict, solo copia staging.
- `docs/qa/full-app/publish/qa-integrations.mjs`: qaEnvironment(env), qaSimulation({request,env,runId,listingId}); adaptadores sin red real.
- `docs/qa/full-app/publish/qa-boundary.mjs`: middleware exact-host/guard, identidad normal y controles de simuladores.
- `docs/qa/full-app/publish/build.py`: fuentes permitidas, deps fijadas, overlay/build en carpeta aislada, manifestar artefacto.
- `docs/qa/full-app/publish/runner/`: runner/session, smoke, transferencia privada y staging futuro, sin cargar identidad ahora.
- `docs/qa/full-app/publish/README.md` y propuesta JSON: hashes, destino y evidencia.
- `tests/test_full_app_qa_*`: pruebas focales del overlay, límites y paquete.
- `build/qa-full-app-F/`: fuentes, deps y artefactos locales ignorados; nunca cargar ese árbol completo en runner o Pages.

## Tareas

- [x] Verificar SHA/remoto y preparar dependencias fijadas en staging limpio sin hooks/perfil.
- [x] Overlays independientes frontend/backend con pruebas RED/GREEN.
- [x] Guardia y simuladores fail-closed para todas las rutas; probar negativas con DB/origen incorrectos.
- [x] Construir artefacto separado y probarlo localmente sin conexiones de negocio.
- [x] Preparar smoke público/admin por módulos y CRUD ficticio con limpieza delimitada.
- [x] Preparar entrega de identidad QA por stdin/tmpfs y headers por origen, sin usar valores reales.
- [x] Preflight Cloudflare y runner exclusivamente en lectura; verificar Production/Preview y Access.
- [x] Revisar independientemente; fijar SHA, hashes artefacto/overlay/runner y solicitar permiso F concreto.

## Decisiones iniciales

Turnstile se simula explícitamente mediante token ficticio y API cliente local;
no se guardan claves de proveedor. Se reportará como anti-spam simulado, no como
integración Turnstile real. Google/OAuth y login empresarial quedan deshabilitados.
No se reutiliza el runner E2E remoto de History ni los scripts que migran hampton.
El smoke inicial recorre todos los módulos y muta un conjunto representativo;
no promete agotar todos los workflows ni integrar proveedores reales.

Las fixtures actuales solo muestran una propiedad pública con fotos. La rama
de catálogo grande permanece fuera del smoke salvo caso local simulado separado.

## Cierre de preparación

Artefacto local: 71 API + 66 UI pasan; Access, bindings QA y estado E1 verificados en lectura. Revisión independiente sin hallazgos abiertos. Publicación, SQL adicional y ejecución autenticada remota no ejecutados; esperan sí específico para las huellas y destinos de publish-proposal.json. Las casillas anteriores acreditan preparación, no ejecución F.

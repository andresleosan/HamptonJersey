# REG-17 Availability Implementation Plan

> Ejecución: executing-plans; pruebas antes de implementación y ledger de resultados.

**Goal:** capturar y actualizar franjas semanales por búsqueda, sin confirmar citas.
**Architecture:** JSON acotado en applicants, validado en servidor y serializado por la ruta existente, con el bloqueo optimista de búsqueda; formularios público y panel comparten el contrato. Horas de pared en Europe/Jersey, sin conversión prematura a UTC.
**Tech Stack:** Workers, D1/SQLite, JS nativo, React.
**Spec:** docs/superpowers/specs/2026-11-07-reg-17-availability-design.md

## DESIGN.md: reglas aplicables

Web: ink #151515, paper #fff, mist #f4f3f0, line #e3e0da, stone #77736c, bronze #a56b3d, campo #fbfaf8; Montserrat 15px/1.65 y Tenor Sans; campos radio 12px; botones 999px y 13px 28px. Panel: ink #141414, paper #fff, mist #f2efe9, line #e2ddd4, stone #6b665e, bronze #8a6a3b, err #a32020; cuerpo 14px/1.5, H2 19px, labels 12px, tarjeta 14px y padding 24px, campos 10px, botón 10px 20px. Reutilizar field, card y btn; apilar en móvil. Foco 2px offset 2px, labels nativos, errores enlazados, teclado y zoom 200%; probar 1280/390. Copy inglés. No nueva librería, animación ni imagen; validación servidor, escapes, no datos personales en almacenamiento web. Las escalas y paleta unificada propuestas en DESIGN no son tokens vigentes.

Brainstorming/grill-me: las franjas habituales no son fechas confirmadas; el vacío es desconocido; fechas concretas, DST ambiguo y aceptación pertenecen a VIS-17. El límite y validación no deben permitir pérdida de datos ni sobrescritura concurrente. Impeccable: jerarquía y controles nativos; antislop: copy funcional y sin decoración; seguridad: entrada validada, escape y permisos existentes; rendimiento y ponytail: JSON limitado y sin dependencias. Nuevas páginas/rediseño no aplican.

## Pasos

- [x] Validación común de día, HH:mm, orden, solapamientos y límite con pruebas negativas y de DST; migración aditiva sin datos inventados.
- [x] Integrar persistencia por búsqueda, historial y concurrencia existentes; probar alta, actualización, dos búsquedas y conflicto.
- [x] Añadir controles accesibles en formulario público y panel, con posibilidad de añadir/quitar, y errores junto a controles; probar flujo real.
- [x] Ejecutar npm test, build, check:release, e2e y MCP local 1280/390; revisar cambios, registrar evidencias y corregir resultados. El recorrido MCP de envío real queda limitado por DNS de Turnstile y el zoom móvil por desbordamiento existente; ver ledger.
- [x] Actualizar ESTADO, checklist, reconciliación, ledger y relevo; analizar siguiente tarea después de pruebas; commit local sin publicar ni migrar remotamente.

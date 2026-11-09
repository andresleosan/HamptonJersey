# Canonical Integration Verification Fix Plan

> Use superpowers:executing-plans. Arreglo acotado de mantenimiento; ninguna construcción de producto sin su reserva.

**Goal:** Verificar ascendencia publicada sin descargar parches innecesarios que causan503.
**Architecture:** Mismo compare de GitHub, página2 de1commit, validación y límites existentes.
**Tech Stack:** Worker JavaScript, Node tests y runtime Miniflare/Durable Objects.
**Spec:** [reparación](../specs/2026-11-09-paq-01-canonical-verification-design.md).

## Global Constraints

No cambios a CLI/Access/credenciales/estado privado/reservas. Mantener1 MB/8 s y status+merge-base. Esta entrega no construye NOT-11 ni certifica productores futuros. UI/valores visuales de DESIGN no aplican porque no hay interfaz afectada. Seguridad y rendimiento conservan límites y privacidad.

## Review Focus

Página2vacía no significa falta de ascendencia; merge-base sigue obligatorio. Incluso página2 puede fallar o exceder1 MB; rechazar sin fallback. Reintento idéntico conserva idempotencia. Producto no se marca hecho por arreglar el coordinador.

## Task1: Regresión y cambio mínimo

**Files:** coordination/src/canonical.mjs, tests/coordination-canonical.test.js, coordination/test/runtime.test.mjs.
**Interface:** verifyIntegrated(env,sha):Promise<string>, sin cambio de firma/contrato; nuevo query fijo en la petición existente.

- [x] ReproducirHTTP200 grande y503 real; medir consultas paginadas sin mostrar contenido privado.
- [x] Añadir regresión que falla con CANONICAL_UNAVAILABLE por tamaño antes del arreglo (1FAIL/10PASS).
- [x] Añadir query fijo preservando resto del código; regresiones focales11PASS.
- [x] Exigir query en mock runtime y caso503→reintento idéntico→una evidencia.
- [x] Ejecutar npm test, runtime, build y check:release; empaquetado dry-run del coordinador.
- [x] Revisión independiente del diff/documentos: sin hallazgos críticos/importantes/menores.
- [x] ESTADO/ledger y commit local exacto; GitHub base b565121 comprobado antes del commit. SHA y relevo finales se registran al cerrarlo.
- [ ] Solo después de aprobar el SHA: publicar/desplegar coordinador conservando secretos/bindings, repetir exactamente la evidencia pendiente y confirmar status. No limpiar pending ni crear otra sesión para eludirlo.

Skills: systematic-debugging aisló tamaño de compare; TDD reproduce fallo y verifica arreglo; ponytail conserva una petición y una línea funcional; security conserva límites/validaciones; verification-before-completion y revisión independiente verifican hechos. Impeccable/taste/redesign/frontend-security/antislop visual no aplican sin interfaz; no activos/fuentes/animaciones. Web-performance reduce transferencia sin inventar medición de experiencia visual. Playwright no aplica.

# Paquetes y tablero didáctico Implementation Plan

> Ejecutar con superpowers:executing-plans. Encargo aprobado de reorganización y tablero; publicación requiere aprobación por SHA.

**Goal:** Convertir 250 puntos en paquetes navegables con progreso verificable y recomendaciones de entorno.
**Architecture:** Manifiesto público independiente de estados; procedimiento de agente resuelve paquetes por etapas; tablero consume catálogo vivo y manifiesto estático. Sin cambiar protocolo remoto de reservas.
**Tech Stack:** JavaScript nativo, JSON, CSS, node:test/jsdom y Workers existentes.
**Spec:** ../specs/2026-11-09-paquetes-tablero-design.md

## Global Constraints

Base main ee65ff3d491e3221384316a666ab157b5bea1616 comprobada 9-nov-2026 en copia /tmp aislada. Preservar copia original. Mantenimiento de procedimiento/tablero fuera de las250 unidades de producto; no adoptar una reserva ajena ni usar una tarea de producto para aparentar mantenimiento reservado. Sin mutar el coordinador. Antes de futuras construcciones de producto, reserva real y dependencias vigentes. Diseño visual: tokens exactos, tipografías, tamaños y estados del spec; DESIGN.md no cambia. Mantener CSP/Access y ausencia de PII. Hermes GPT Sol/Codex; respaldo DeepSeek v4 max/OpenCode solo al perder acceso GPT.

## Review Focus

- Cobertura completa y única sin perder tareas descartadas/aplazadas.
- Denominador estable con filtros y cero vigente; completado local no infla hecho.
- Manifiesto ausente/incorrecto o catálogo más nuevo conserva navegación por listas y reintento.
- Foco y apertura sobreviven polling; navegación de etapa/dependencia revela destino exacto.
- Paquete no es una reserva; motor recomendado no inventa incorporación o permisos.

## Tareas

- [x] Manifiesto docs/roadmap/paquetes.json con23paquetes, etapas y recomendaciones por defecto/excepciones.
- [x] Actualizar .agents/skills/avanzar/SKILL.md, referencias/inicio-guiado.md, nueva referencias/paquetes.md, AVANZAR, ESTADO y reconciliación. Generar guía pública PAQUETES.md desde manifiesto; conservar estados de producto.
- [x] Añadir pruebas de cobertura/métrica/UX a tests/public-board.test.js; observar fallo antes del código. Implementar tablero-publico.html/js y tablero-publico.css exclusivos; añadir paquetes.json y CSS a build-public-team y allowlist pública, sin endpoints de escritura nuevos.
- [x] Ejecutar focalizadas, npm test/build/check:release/team:check, runtime del Worker público y dry-run. Playwright local1280/390 si es viable sin cambiar controles; registrar bloqueo real.
- [x] Revisión independiente del cambio completo; corregir hallazgos importantes, verificar remoto/integración, commit concreto y relevo privado. No publicar sin aprobación para SHA.

## Skills y comprobación

brainstorming/grill-me: usar aprobación y correcciones de Luis, resolver con catálogo sin repetir preguntas. writing-plans/executing-plans: plan y ledger. skill-creator: routing breve a referencia única. impeccable/redesign-existing-projects/antislop: herramienta clara, controles nativos, progreso explicable, ENERGY1/RHYTHM1/MOTION1. security-best-practices/frontend-security-coder: mismo origen, validación, textContent y allowlist; sin debilitar CSP. web-performance-optimization/ponytail: nodos persistentes y JS nativo sin dependencias nuevas. taste-skill: no aplica, página existente. critica-de-diseno: no aplica como imitación de referencia; URL es el propio producto. verification-before-completion: comprobar resultados reales.

Publicación pendiente de aprobación por SHA; revisión visual nativa bloqueada y reflejada en el ledger. No declarar el despliegue verificado.

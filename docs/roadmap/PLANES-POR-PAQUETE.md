# Planes de las nueve tandas vinculados a paquetes

Esta vista enlaza los 36 códigos tratados en las nueve tandas de la antigua Lista 4 con sus paquetes existentes. No mueve tareas, no cambia estados de producto y no crea autorizaciones de construcción. Fuente de asociación: `paquetes.json`, campo `planReferences` de cada paquete. Las tareas de otras listas y los trabajos ya hechos o excluidos conservan su organización; este documento no afirma revisar todos sus planes.

## Cómo elegir trabajo en paralelo

Consultar `node scripts/plan-packages.mjs --package PAQ-XX`: `planReferences` muestra el plan vigente, complementos obligatorios, estado de planificación y dependencias por código. Leer plan y spec antes de construir. Una referencia de dependencia indica qué comprobar, nunca que esté integrada o activada. Las condiciones externas pueden permitir construir con datos sintéticos, pero no activar.

Trabajar en copias independientes. Antes de asignar dos tareas, comparar los archivos que sus planes modifican y los recursos compartidos del catálogo. Los paquetes son agrupaciones, no garantía de ausencia de conflictos. Un integrador coordina archivos compartidos, ordinales de migraciones y contratos de API; integrar y comprobar el productor antes de conectar al consumidor. No ejecutar reservas históricas: rige la decisión posterior de Luis sobre el coordinador.

| Cruce de paquetes | Coordinación necesaria |
|---|---|
| PAQ-18 / PAQ-19 | Editor, publicación y alta desde carpeta: acordar campos y cambios en editor/rutas antes de integrar contenido y medios. |
| PAQ-01 / PAQ-09 / PAQ-18 | Historial y eventos comparten productores; usar el historial existente y coordinar cambios en eventos/Inbox. |
| PAQ-05 / PAQ-08 / PAQ-09 / PAQ-20 | Captura, fuentes y métricas consumen hechos del inventario y agencias. No simular disponibilidad ni recepción confirmada. |
| PAQ-12 / PAQ-18 / PAQ-20 | ANA-10 consume visibilidad PUB-16; PUB-09 y ANA-10 conservan sus propios contadores. Coordinar integración de Insights y rutas. |
| PAQ-21 / todos los productores | Access modifica autenticación/rutas/medios; respaldo debe cubrir todos los escritores. Integración central con inventario de entradas y pruebas de regresión. |

PAQ-23 conserva tours y equipo 360 fuera del alcance actual. PUB-20 se mantiene aplazado aunque figure en PAQ-12; portales y Drive no se reactivan por sus nombres de etapa en PAQ-19. La publicación manual con Hermes se conserva.

## PAQ-01 · Inbox y trabajo compartido

| Tarea | Plan vigente | Tipo de preparación |
|---|---|---|
| SPR-02 | [Plan](../superpowers/plans/2026-11-08-spr-02-property-local-history.md) | Construcción con dependencias por comprobar |

## PAQ-05 · Inventario único de mercado

| Tarea | Plan vigente | Tipo de preparación |
|---|---|---|
| SPR-07 | [Plan](../superpowers/plans/2026-11-08-spr-07-source-and-verification-filters.md) | Construcción con dependencias por comprobar |

## PAQ-09 · Ficha privada y presentación

| Tarea | Plan vigente | Tipo de preparación |
|---|---|---|
| SPR-03 | [Plan](../superpowers/plans/2026-11-08-spr-03-private-property-capture.md) | Construcción con dependencias por comprobar |
| SPR-08 | [Plan](../superpowers/plans/2026-11-08-spr-08-property-notes-viewings-adverts.md) | Construcción con dependencias por comprobar |

## PAQ-11 · Privacidad y decisiones de cumplimiento

| Tarea | Plan vigente | Tipo de preparación |
|---|---|---|
| PRE-28 | [Plan](../superpowers/plans/2026-11-09-tp01-pre-28-plan.md) | Gestión/documentación |
| PRE-13 | [Plan](../superpowers/plans/2026-11-09-tp01-pre-13-plan.md) | Gestión/documentación |
| PRE-33 | [Plan](../superpowers/plans/2026-11-08-pre-33-hermes-existing-agreements-handoff.md) | Gestión/documentación |

## PAQ-12 · Captación y alertas consentidas

| Tarea | Plan vigente | Tipo de preparación |
|---|---|---|
| PUB-10 | [Plan](../superpowers/plans/2026-11-10-pub-10-registro-propietarios.md) | Construcción con dependencias por comprobar |
| ANA-10 | [Plan](../superpowers/plans/2026-11-10-ana-10-qr-agregado.md) | Construcción con dependencias por comprobar |
| PUB-19 | [Plan](../superpowers/plans/2026-11-10-pub-19-demanda-propietarios.md) | Construcción con dependencias por comprobar |
| PUB-20 | [Plan](../superpowers/plans/2026-11-10-pub-20-folleto-qr.md) | Aplazado; no construir ahora |

## PAQ-18 · Editor y catálogo propio

| Tarea | Plan vigente | Tipo de preparación |
|---|---|---|
| PUB-01 | [Plan](../superpowers/plans/2026-11-10-tp02-pub-01-plan.md) | Construcción con dependencias por comprobar |
| PUB-04 | [Plan](../superpowers/plans/2026-11-08-pub-04-listing-address-condition.md) | Construcción con dependencias por comprobar |
| PUB-05 | [Plan](../superpowers/plans/2026-11-08-pub-05-structured-physical-features.md) | Construcción con dependencias por comprobar |
| PUB-06 | [Plan](../superpowers/plans/2026-11-08-pub-06-structured-economic-terms.md) | Construcción con dependencias por comprobar |
| PUB-07 | [Plan](../superpowers/plans/2026-11-08-pub-07-technical-compliance-evidence.md) | Construcción con dependencias por comprobar |
| PUB-08 | [Plan](../superpowers/plans/2026-11-08-pub-08-web-content-tags-video.md) | Construcción con dependencias por comprobar |
| PUB-09 | [Plan](../superpowers/plans/2026-11-10-tp04-pub-09-plan.md) | Construcción con dependencias por comprobar |
| SPR-01 | [Plan](../superpowers/plans/2026-11-08-spr-01-listing-tracking-card-completion.md) | Construcción con dependencias por comprobar |
| PUB-11 | [Plan](../superpowers/plans/2026-11-08-pub-11-media-quality-private-documents.md) | Construcción con dependencias por comprobar |
| PUB-12 | [Plan](../superpowers/plans/2026-11-10-tp02-pub-12-plan.md) | Construcción con dependencias por comprobar |
| PUB-02 | [Plan](../superpowers/plans/2026-11-10-tp02-pub-02-plan.md) | Construcción con dependencias por comprobar |
| PUB-14 | [Plan](../superpowers/plans/2026-11-08-pub-14-existing-seo-search-console-activation.md) | Verificación/configuración externa |
| PUB-16 | [Plan](../superpowers/plans/2026-11-08-pub-16-website-state-propagation-only.md) | Construcción con dependencias por comprobar |

## PAQ-19 · Distribución e importación de propiedades

| Tarea | Plan vigente | Tipo de preparación |
|---|---|---|
| PUB-13 | [Plan](../superpowers/plans/2026-11-08-pub-13-evidence-backed-web-copy-drafts.md) | Construcción con dependencias por comprobar |

## PAQ-20 · Analítica útil

| Tarea | Plan vigente | Tipo de preparación |
|---|---|---|
| ANA-01 | [Plan](../superpowers/plans/2026-11-10-tp02-ana-01-plan.md) | Construcción con dependencias por comprobar |
| ANA-03 | [Plan](../superpowers/plans/2026-11-10-tanda7-ana-03-cloudflare.md) | Construcción con dependencias por comprobar |
| ANA-04 | [Plan](../superpowers/plans/2026-11-10-tanda7-ana-04-filtros.md) | Construcción con dependencias por comprobar |
| ANA-05 | [Plan](../superpowers/plans/2026-11-10-tp02-ana-05-plan.md) | Construcción con dependencias por comprobar |
| ANA-06 | [Plan](../superpowers/plans/2026-11-10-tanda7-ana-06-tiempos.md) | Construcción con dependencias por comprobar |
| PUB-17 | [Plan](../superpowers/plans/2026-11-10-tanda7-pub-17-salud.md) | Construcción con dependencias por comprobar |

## PAQ-21 · Puesta en marcha y operación

| Tarea | Plan vigente | Tipo de preparación |
|---|---|---|
| PRE-06 | [Plan](../superpowers/plans/2026-11-09-tp01-pre-06-plan.md) | Construcción con dependencias por comprobar |
| ANA-09 | [Plan](../superpowers/plans/2026-11-08-ana-09-scoped-public-rate-limit.md) | Verificación/configuración externa |
| PRE-14 | [Plan](../superpowers/plans/2026-11-09-tp01-pre-14-plan.md) + [complemento obligatorio](../superpowers/plans/2026-11-10-tanda8-pre14-cierre.md) | Construcción con dependencias por comprobar |
| PRE-16 | [Plan](../superpowers/plans/2026-11-09-tp01-pre-16-plan.md) + [complemento obligatorio](../superpowers/plans/2026-11-09-pre-16-fotos-equipo.md) | Construcción con dependencias por comprobar |
| PRE-19 | [Plan](../superpowers/plans/2026-11-10-tanda9-pre19-decisiones.md) | Gestión/documentación |


## Validación de esta integración

Comprobados 36 códigos únicos en 9 paquetes, todos los planes y complementos existentes y todos los enlaces de este índice. Se mantienen las 250 tareas en sus etapas originales y el orden de paquetes. `node scripts/plan-packages.mjs --check` confirma 23 paquetes/250 tareas/cobertura exacta; `node scripts/render-roadmap.mjs --check` confirma el catálogo. Verificada la consulta real de PAQ-12: expone ANA-10 vigente y PUB-20 aplazado. No se han construido funciones ni activado servicios.

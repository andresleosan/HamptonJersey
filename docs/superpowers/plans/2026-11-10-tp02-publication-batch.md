# TP-02 · Tanda 2: publicación, captación y medición

> **Decisión posterior de Luis, 10-nov:** folletos de reparto aplazados y sin atribución individual del origen de contactos. El único QR vigente es el de cada póster de propiedad, con conteo agregado; prevalece [el plan ANA-10 actualizado](2026-11-10-ana-10-qr-agregado.md). El texto antiguo incompatible es histórico, no una instrucción de construcción.

10-nov-2026. **Ocho códigos revisados: siete contratos de código preparados y PUB-21 conservada como fase posterior.** No son ocho tareas construidas ni siete activaciones autorizadas. [Estados por código](2026-11-10-tp02-publication-readiness.json) · [Ledger](2026-11-10-tp02-publication-ledger.md).

| Código | Plan | Preparación |
|---|---|---|
| PUB-01 | [Alta guiada recuperable sobre una sola ficha](2026-11-10-tp02-pub-01-plan.md) | Contrato de código definido; dependencias/activación indicadas |
| PUB-12 | [Criterios recomendados y política mínima pura](2026-11-10-tp02-pub-12-plan.md) | Contrato de código definido; dependencias/activación indicadas |
| PUB-02 | [Publicación web con mínimos y defensas vigentes](2026-11-10-tp02-pub-02-plan.md) | Contrato de código definido; dependencias/activación indicadas |
| ANA-01 | [Actividad web agregada sin seguimiento individual](2026-11-10-tp02-ana-01-plan.md) | Contrato de código definido; dependencias/activación indicadas |
| ANA-05 | [Etapas registradas y hitos verificados por búsqueda](2026-11-10-tp02-ana-05-plan.md) | Contrato de código definido; dependencias/activación indicadas |
| PUB-19 | [Demanda pública mediante snapshot revisado](2026-11-10-tp02-pub-19-plan.md) | Contrato de código definido; dependencias/activación indicadas |
| PUB-20 | [Folleto parroquial con QR y conteos agregados](2026-11-10-tp02-pub-20-plan.md) | Contrato de código definido; dependencias/activación indicadas |
| PUB-21 | [Conservar cola Drive y registrar fase posterior](2026-11-10-tp02-pub-21-plan.md) | Fase posterior; no construir conexión |

## Decisiones recuperadas, sin preguntas repetidas

[Respuestas publicadas9-nov](2026-11-09-lista4-inventario-y-preguntas.md), apartados Respuestas de Luis y Captación/QR, cierran P01/P02/P03 de borradores anteriores. Publish admite mínimos+una foto, sin100 %, precio privado; estadísticas generales, sin seguimiento de visitantes; página/folleto permanecen con umbral5 y protección contra deducciones; QR mide redirecciones, no personas únicas. [Alcance vigente](2026-11-09-lista4-tandas-pendientes.md) aplaza Drive; PUB-15/portales está retirada por decisión posterior y excluye redes/tours. No reactivar por catálogo histórico ni por el esquema anterior de tandas. No hay preguntas de producto nuevas necesarias en TP-02. TP01-A01 resuelta en TP-05 por respuesta expresa: Access incluido, configuración real pendiente.

## Diseños y propiedad de módulos

- [Alta/publicación](../specs/2026-11-10-tp02-publication-design.md): PUB-01 dueño del recibo/guía, PUB-12 de criterios/política pura, PUB-02 de las escrituras Publish. Un solo escritor integra ListingEditor/routes/listings y conserva avanceSPR02 de main.
- [Medición](../specs/2026-11-10-tp02-measurement-design.md): ANA-01 dueño de actividad agregada; ANA-05 de cohortes e hitos. Compartir rutas/Insights secuencialmente, sin nuevo pipelineANA04 o beaconANA03.
- [Demanda/material](../specs/2026-11-10-tp02-demand-design.md): PUB-19 dueño de consulta/snapshot/panel; PUB-20 añade campañas/QR/print al mismo panel y contratoANA10. Sin backend de reparto ni nuevo formularioPUB10.

## Orden de construcción propuesto

1. PUB-12 política/criterios; PUB-02 guardias y UI sobre lo anterior; PUB-01 recibo antes de cliente y guía, secuenciando cambios del editor. FamiliasPUB04–09 se conectan cuando estén realmente integradas; no hay campos ficticios.
2. ANA-01 contrato de actividad; ANA-05 proyección/UI con fuentes ausentes como Not integrated. Distintos archivos de cálculo permiten trabajo independiente, pero servidor/Insights tienen un solo integrador.
3. PUB-19 recuento privado→almacenamiento/revisión→superficies; PUB-20 campaña→redirect/métricas→QR/print. Flags cerrados hasta verificación real; datos sintéticos permiten construir sin divulgar demanda real.
4. PUB-21 no se construye ni configura ahora. Retomar requiere encargo nuevo, alcancePro/Hermes y acceso verificados; conservar cola existente y sus mínimos adicionales.

## Qué significa listo en esta entrega

Hay 17 unidades futuras de código y 1 unidad documental de continuidad, todavía sin ejecutar. Los contratos definen archivos, interfaces, invariantes, pruebas y responsable de dependencias; no acreditan privacidad aceptada, identidad de contactos, configuración, implementación de productores o disponibilidad de nuevos campos. PUB-19/20 pueden construirse con sus puertas cerradas, pero la revisión externa de inferencias puede exigir modificar su regla de divulgación antes de activar; se registra y no se finge completada. HEIC/importación ampliada no quedan resueltos porPUB01. No se promete que todas las tareas completas estén listas para activarse.

## Comprobación y entrega

Base main/GitHub80ad03df7e095750f455aa4aa668573e9aac5db4 comprobada11:28:28UTC. Se preservaron11 documentosTP01 y se incorporaron dos commits publicados deSPR02 sin solapamiento. Esta tanda genera 8 planes, 3 diseños e índice/JSON/ledger. Revisión independiente completada por tp02_builder_check; cinco preguntas técnicas y dos correcciones de rutas/Queue resueltas en los diseños y casos futuros. Validación documental registrada en ledger. No código, migración, test de producto, cuenta, envío, lectura de Gmail/Drive, IA, commit/push o despliegue ejecutados. Documentos locales; actividad compartida no disponible. El programa conserva TP03, TP04 y TP05 como siguientes tandas, con verificaciones externas indicadas.

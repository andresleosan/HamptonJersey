# EST-18 · Registro de trabajo

## Arranque · 7-nov-2026

- Encargo: `$avanzar EST-18`, tras recomendar la base de trazabilidad de fichas independiente de AGE-04 y de la investigación de fuentes.
- Copia aislada `/tmp/hampton-est18`, clon nuevo del repositorio canónico, rama `main`. Fetch y comparación a las 20:43:14 UTC: `HEAD = main = origin/main = 2588e7023cbb6b83ae12ec7dc295d5f7c7338418`, 0 commits a cada lado; árbol limpio al arrancar.
- Conservadas la rama de diseño de `/root/HamptonJersey`, sus archivos privados y la entrega local NOT-11 `f98532afa8a9d414b19a36ab169719e15e89fb00` en `/tmp/hampton-not11`. No se modificaron otras sesiones ni se trasladaron credenciales/datos privados.
- Leídos el arranque local y la skill canónica `.agents/skills/avanzar/SKILL.md`, referencia de modelo/esfuerzo, AVANZAR, estado/checklist, reconciliación, arquitectura y requisitos aplicables de DESIGN.md. El documento privado original se consultó en su ubicación; no se copió ni editó.

## Brainstorming y grill-me

- Skills leídas: `superpowers:brainstorming` y `grill-me`.
- Alternativas presentadas: historial visible en cada propiedad o solo registro interno.
- Respuesta explícita de Luis: **«Solo registro interno por ahora»**. Se mantiene sin pantallas nuevas ni cambios del cliente.
- [Diseño propuesto](../specs/2026-11-07-est-18-listing-events-design.md): estado de propiedades, cambios del editor, Sales, Queue, confirmación, portada/destacados y características derivadas; eventos atómicos, minimización y conservación; alcance de reintentos definido sin prometer deduplicación entre altas independientes sin identidad común.
- Código contrastado: `server/events.js`, `server/routes/listings.js`, `sales.js`, `queue.js`, `media.js`, `matches.js`, `notifications.js`, `server/retention.js`; esquema 0008–0027 y migración local NOT-11 0028. Reutilizar un registro común requiere ampliar el CHECK de entidades y conservar referencias desde notificaciones.
- Consultadas las guías oficiales D1 de migraciones/claves foráneas. El plan debe verificar la reconstrucción en base poblada con FK activas y su compatibilidad con triggers NOT-11; no se desactivaron controles ni se ejecutó DDL.
- Revisión de diseño independiente `est18_design_review` realizada con el prompt builder-check: tres precisiones importantes, resueltas en el diseño desde el código y el alcance aprobado. (1) Atomicidad de la mutación de ficha con su evento, sin prometer atomicidad de todo Queue/medios ni éxito de sus pasos posteriores. (2) Identidad de operación en contrato interno; sin nuevas cabeceras/cambios del cliente ni afirmación de reintentos identificados en el panel. (3) Conservar la reconfirmación de disponibilidad de Publish repetido, registrándola como confirmación y manteniendo `published_at`. No se trasladó una pregunta técnica al usuario ni se amplió el alcance silenciosamente.

## Construcción autorizada

Luis aprobó el diseño con «si, construyelo» y pidió continuar. Plan creado y ejecución nativa con `executing-plans` y TDD; no se requiere otra aprobación para construir.

- Baseline: 689 pruebas JavaScript y 14 Python aprobadas.
- Primer ciclo RED→GREEN: 5 pruebas del registro, no-op/conflicto, rollback y migración poblada aprobadas.
- La copia aislada sigue en main sobre la base registrada; sin commit, push ni migración de producción.
- El número 0029 conserva libre NOT-11 0028; falta comprobar composición exacta y numeración remota antes de publicación.

## Evidencia de implementación

- Migración 0029 amplía `events` preservando sus filas/IDs/índices y referencias. Triggers leen OLD/NEW solo con contexto transaccional; se conserva el comportamiento de `changes()` y `last_insert_rowid()` de los escritores existentes.
- Altas, cambios materiales, Publish/reconfirmación, Unpublish, Archive/Restore, Still available, favoritos, portada, borrado, Queue, Sales y recálculo cubiertos. Hora UTC, actor, origen y revisión por propiedad. Solo valores estructurados permitidos y nombres de campos libres. Sin avisos ni interfaz nuevos.
- Identidad opcional interna ligada al digest de entidad/actor/acción/cambio: concurrencia, conflicto de payload, reintento después de cambios/borrado, no-op y fallo del evento probados. No se expone al panel ni se promete identificar sus reintentos HTTP actuales.
- Primer e2e detectó `too many terms in compound SELECT` en D1, ausente en el doble node:sqlite. Diagnóstico: la lista de diferencias usaba UNION. Sustituida por una máscara de diferencias con JSON; sin copiar textos libres. Migración reducida a 225 líneas legibles y aplicada después correctamente en D1 local.
- Composición exacta: migraciones publicadas + 0028 de NOT-11 + datos sintéticos + 0029 final, con Wrangler/D1 local aislado. Conservados evento 17, aviso 31 e historial; triggers NOT-11 crean y resuelven un segundo aviso; delta de precio 500000→600000/revisión 1; `foreign_key_check` vacío; EXPLAIN usa `events_listing_revision`. Archivos temporales `/tmp/est18-migration-proof/`; no se incorpora ni modifica código de NOT-11.
- 16 pruebas focales aprobadas; paso 2: 37 pruebas de rutas/matching/confirmación/publicación aprobadas. Dos pruebas antiguas de Sales se ajustan a cuatro eventos (tres del comprador y uno de propiedad), verificando también la cantidad por entidad; no se relajan garantías de concurrencia.
- Limpieza de contactos/visitas conserva los eventos de propiedades; un fallo posterior de galería conserva solo el evento de portada realmente guardada. La atomicidad es de ficha/evento, no de todo el flujo R2/Queue.
- Build y check:release aprobados. El bundle del panel mantiene `index-Dm1Ekxwv.js`; aviso preexistente por tamaño >500 kB. Playwright MCP: no aplica, sin cambios de interfaz; e2e general aprobado con fixture sintético aislado: public, urls, admin y reg17.
- Centinela: alerta puntual clasificada como falso positivo en un comentario de configuración de pruebas; no se leyeron valores privados ni se alteraron controles. Informe privado redactado fuera del repositorio público.

## Decisiones de ejecución

- Ruling: para probar atomicidad con operaciones reales se conectaron las primeras rutas del paso 2 durante el paso 1; D1/NOT-11 se comprobó al completar la integración. Coste: límites intermedios solapados, sin omitir criterios.
- Ruling: un único commit de código y estado conforme a avanzar. Coste: reversión menos granular que commits por paso.

## Siguiente tarea analizada

REG-08: declarar si las plazas de parking son imprescindibles o negociables, conservando desconocido/no aplica y conectando esa distinción al matching. No depende de AGE-04 ni de la base investigada. Código contrastado: `site/apply.js`, `admin/src/ApplicantFields.jsx`, `server/applicants.js` y `server/matching.js`: existe cantidad opcional, pero no obligatoriedad/negociabilidad; el motor trata una plaza ante dos pedidas como Unknown. Hay pruebas de validación, registro y matching que ampliar. Necesita diseño, migración compatible y comprobación de ambas interfaces; no es solo activación externa. Modelo disponible recomendado: gpt-6.1-terra, esfuerzo high (varias capas con patrones y pruebas existentes; menos incertidumbre que el inventario multifuente). La elección no cambia el modelo de esta sesión.

## Revisión y verificación final

Revisor independiente gpt-6-astra/high sobre instantánea 217613ba49bb780feb852748580e11080f723d7e, sin mover main: 40 pruebas propias aprobadas y fallo de enlace Queue inyectado con creación/evento coherentes. Un hallazgo importante: Archive/Restore/Publish validaban el estado antes del batch, permitiendo una segunda transición inválida por concurrencia. Corregido con condiciones de estado dentro del UPDATE. Tres regresiones deterministas (Archive/Archive, Publish/Archive, Restore/Restore) observadas RED→GREEN; la reconfirmación por Publish repetido se conserva. Ningún hallazgo crítico ni menor pendiente; no se requirió segunda revisión.

Resultado final: **708 pruebas JavaScript + 14 Python**, build y check:release aprobados. **E2E general public/urls/admin/reg17 aprobado**, con D1 local y datos sintéticos. La corrección final de concurrencia se verificó además con las tres carreras y la suite completa. Migración D1 poblada y compatibilidad NOT-11 aprobadas; sin ejecución remota. Advertencias preexistentes de bundle >500 kB y detección de módulo de format.js, sin fallo. Logs locales `/tmp/est18-final-suite.log`, `/tmp/est18-final-build.log`, `/tmp/est18-final-release.log`, `/tmp/est18-e2e2.log`; evidencia D1 `/tmp/est18-migration-proof/results.json`.

Decisiones sobre los límites que el revisor dejó fuera:

- Ruling: UI de historial e identidad pública de reintento siguen excluidas por elección de Luis. Coste: no hay vista del historial en panel y los HTTP sin identidad siguen siendo acciones separadas.
- Ruling: atomicidad de todo Queue/medios/R2 sigue fuera; solo ficha/evento. Coste: puede fallar un paso posterior tras un cambio correctamente registrado.
- Ruling: producción sigue pendiente de autorización del SHA; e2e local aprobado no acredita despliegue. Coste: producción se verifica después de activar.
- Ruling: productores futuros, backfill y purga EST-19 quedan pendientes. Coste: EST-18 sigue parcial para esos módulos y no reconstruye sucesos anteriores.

Fetch final 7-nov-2026 21:21 UTC: main remoto sigue en 2588e7023cbb6b83ae12ec7dc295d5f7c7338418; no hubo cambios que integrar ni conflicto de numeración 0029. El commit local final incluye código, pruebas, ESTADO/checklist y documentos; la copia y el relevo se conservan para la autorización. No hay push, migración remota ni despliegue de EST-18.

Comprobación inmediatamente anterior al commit: 2026-11-07 21:27:20 UTC, origin/main = 2588e7023cbb6b83ae12ec7dc295d5f7c7338418; sin avance remoto.

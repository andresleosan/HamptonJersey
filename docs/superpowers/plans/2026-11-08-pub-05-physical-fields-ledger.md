> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PUB-05 · Ledger de planificación

Fecha: 8-nov-2026. Lista 4. Luis pidió continuar solo con planes y eligió PUB-05. No hay autorización para construir o publicar esta familia.

## Base y procedimiento

- Copia exclusiva [copia local de planificación]; main/base 93f8f25c0aa029f1850f0c46855fb89fd524a8e3. Verificador 2026-11-08T13:08:21Z salida 0, main/HEAD/GitHub iguales y copia limpia al iniciar.
- PUB-06 conserva íntegros sus tres Markdown en la copia anterior. El remoto avanzó tres commits; no se mezclaron cambios ni se hizo fast-forward sobre sus documentos pendientes.
- Skill canónica de esta base: planificación local sin reservas. El comando real `plan --list 4 --task PUB-05` devolvió reserved:false/buildAuthorized:false. No se inicializó sesión/credencial ni se crearon recursos o leases.
- La primera consulta de estado fue parte del arranque desde la copia anterior, antes de leer la regla nueva. No se tocó BUS-21; después solo catálogo local, lecturas y documentos, ningún claim/scope/watch/submit/pause/complete/release.
- [Spec](../specs/2026-11-08-pub-05-physical-fields-design.md) y [plan](2026-11-08-pub-05-physical-fields.md). Original privado de Luis ausente; fuentes públicas suficientes, sin copiarlo.

## Decisiones y cobertura

| Criterio | Decisiones y evidencia | Pruebas futuras |
| --- | --- | --- |
| A1/A5 datos | Tipos del spec y validateListing/checkPrice/loadListing actuales; D3/D5/D14. | Task 1 V1/V2/API1 y UI1. |
| A2 superficie | PUB-06 propuso interior_area_sqft; D1/D2 reutilizan ese contrato y calculan m². | Conversión y ausencia de deriva, Tasks 1/5. |
| A3 prioridad humana | withFeatures/recalc llaman extractFeatures; SELECT de recalc necesita override. D4/D6. | F1–F4/API2/UI3. |
| A4 matching | server/requirements.js lee _requirements, no solo feat_*; legado conservador. D7/D8/D13. | M1–M3 y REG-08/legado. |
| A5 fuente | Queue llama createListing con source queue; no convertir propuestas en confirmaciones. D12. | Q1 y recuperación ready. |
| A6 historial | EST-18 enumera campos/JSON en triggers; guardado con versión/context/batch. D11. | EV1–EV4. |
| A7 interfaz | DESIGN nota EST-09 y wrappers/CSS actuales. D14. | UI1–UI4 y MCP 1280/390. |
| A8 límites | toPublic/importadores no amplían campos; regla de planificación local. | Shapes y revisión de archivos. |

## Skills y límites

Brainstorming/grill-me resuelven manual/automático, ausencia/null/0/[], patio/terraza, superficie y fuentes. Writing-plans estructura tareas. Impeccable/adapt, seguridad, antislop durante el trabajo, rendimiento y ponytail concretados en el plan. Taste/redesign no aplican a esta superficie existente. Sin assets, librerías, servicios ni cambios al VPS.

## Comprobaciones

- [x] Base propia y catálogo local verificados, sin nuevas reservas.
- [x] Código, fuentes, escritores, matching, historial y contrato PUB-06 revisados por lectura.
- [x] Revisión independiente `pub05_builder_check`: sin contradicciones bloqueantes. Precisados modos Unknown/None/Select values y bloqueo de Save al quitar la última selección; property_condition existing compartido con PUB-04 sin inferir good.
- [x] Revisión propia adicional: null de API para feature_overrides se normaliza antes de blank general y persiste '{}'; modos incompletos solo en borrador, cloning para Discard y fuente efectiva guardada explícitos.
- [x] Primera comprobación: enlaces válidos, D1–D14/A1–A8 y rutas de queue/requirements/escritores existentes; renderer --check salida 0 con 250 tareas/250 unidades. Repetir sobre los tres documentos preparados después de las precisiones.
- [x] Comprobación final sobre los tres Markdown preparados: enlaces, cobertura y precisiones de revisión PASS; conversión decimal 1000 sq ft →92.90304 m² y salida 92.90 comprobadas; `git diff --cached --check` y renderer --check correctos. El detector de placeholders encontró la palabra española «todo» en mayúsculas; se normalizó la redacción y la comprobación pasó.
- Playwright: no aplica a documentos. Tests de producto/build/e2e/migraciones: no ejecutados; Tasks 1–5 son trabajo futuro.
- Sin publicación, despliegue, migración ni reservas. No marcar PUB-05 construida por terminar un borrador.

## Siguiente paso

Revisar propuesta y continuar planificación si Luis lo elige. Construcción futura en orden SPR-01 → PUB-06 → PUB-05, con bases/contratos revalidados y reserva build auténtica solo entonces. Los datos declarados no se convierten en certificados ni se alteran pendientes ajenos.

Siguiente recomendado Codex: /avanzar PUB-04 · gpt-6.1-terra · high · solo planificación. PUB-04 pide dirección/código postal, estado y promotor; conviene cerrar ahora el contrato de property_condition compartido y distinguir datos internos de dirección publicable. Modelo/esfuerzo comprobados en catálogo local; no cambia la sesión actual.

## Construcción local parcial · 12-nov-2026

- Base `89c5c92`; se conservan los cambios locales anteriores de PUB-04. `interior_area_sqft` todavía no existe en el esquema y su contrato es compartido con PUB-06. La autorización actual de construcción sustituye la restricción histórica de solo planificación.
- Se preparó `server/listing-physical.js` como módulo puro: validación de enteros, flags y listas; coherencia de plantas; conversión de área; normalización estricta de excepciones manuales y proyección de valores y certezas. Todavía no está conectado a ninguna ruta ni a matching, no guarda datos y no modifica la interfaz.
- Pruebas: `node --test --test-reporter=dot tests/server/listing-physical.test.mjs tests/server/listing-features.test.mjs tests/server/requirements-matching.test.mjs`, 24/24 PASS. Se verificó RED→GREEN para el módulo ausente, el override y exterior parcialmente conocido.
- Pendiente: integrar una sola superficie con PUB-06, migración local e historial EST-18, API y atomicidad, prioridad en extracción/recálculo/queue, editor y WebKit con datos ficticios. No se ha realizado migración remota ni publicación. Playwright: no aplica al módulo puro aún no integrado. PUB-05 sigue parcial.
- Decisión: se conservó en esta copia el módulo puro sin conectarlo antes de que existan persistencia y auditoría; evita que el recálculo use cambios manuales sin poder conservarlos. Si el contrato del área compartida cambia, habrá que adaptar la conversión y sus pruebas antes de integrar.

## Integración local · 12-nov-2026

- Se integraron los campos en una migración local `0041`, con área única en pies² y visualización derivada en m², validación y eventos tipados. El campo `property_condition` existente se reutiliza. No se aplicó migración remota.
- El editor permite guardar, descartar y validar los nuevos campos y decidir si cada hecho de matching procede del texto, es manual o desconocido. La extracción y recálculo conservan las correcciones; Queue no convierte una importación en confirmación manual. La API pública no añade los campos.
- Pruebas: 1.217 JavaScript y 14 Python; migración sobre base poblada con `integrity_check` y claves foráneas; guardado, versión obsoleta, rollback por fallo de evento, recálculo, reinicio manual y fuente Queue. Build y `check:release` PASS.
- Revisión independiente detectó ausencia de visualización del último valor y errores manuales poco visibles; se corrigieron con validación y mensajes de interfaz.
- El recorrido WebKit aislado PASS a 1280 y 390 px con datos ficticios, sin red: validación, guardado, descarte, errores, foco y zoom CSS 200 % (no zoom nativo). Chromium continúa pendiente.
- PUB-05 sigue parcial en el tablero hasta que exista autorización explícita para commit, push, migración y publicación y se verifiquen. La copia conserva cambios previos no publicados de PUB-04, que requieren separación al integrar.
- Siguiente tarea recomendada: PUB-06, que puede reutilizar la superficie interior compartida al completar sus datos económicos.

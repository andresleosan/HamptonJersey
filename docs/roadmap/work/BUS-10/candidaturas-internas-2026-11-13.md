# BUS-10 · Candidaturas internas no decisorias

Avance parcial del 13-nov-2026, construido en copia aislada sobre `fe35eabd81ea42a793f0dad074cce3918e59f2ea`. El núcleo es interno y no autorizante; `server/market-identity.js` conserva la respuesta 503 y no se ha conectado ninguna ruta, interfaz o consumidor. Esta entrega no termina BUS-10 ni demuestra permisos, cobertura o uso de fuentes reales.

## Unidad construida

`proposePropertyIdentityCore` registra una candidatura **pendiente de revisión**, nunca una decisión de identidad. Las dos raíces existentes, observaciones de evidencia y versiones esperadas se ordenan por par canónico. Solo acepta tres señales acotadas informadas por quien propone: dirección compartida, referencia compartida o revisión manual. Estas señales son indicios, no pruebas de identidad; no unen ni eliminan propiedades, operaciones, publicaciones, decisiones, matches o permisos.

El batch reutiliza los controles ya existentes del núcleo: actor y generación provisional, raíz y versión de cada grupo, pertenencia y revisión de cada observación, fotografía transitoria de los grupos completos, acceso y vigencia de todas sus fuentes, evidencia territorial y ausencia de bajas de clave. Rige el límite existente de 50 identidades y 512 KiB por instantánea. El candidato y su recibo almacenan IDs, versiones, código acotado y actor; no copian claves de fuente, texto ni observaciones completas. La respuesta exige revalidar la evidencia antes de cualquier decisión.

Cada par canónico tiene como máximo una candidatura en la propuesta de esquema. Los reintentos idénticos conservan un recibo por operación y devuelven la misma candidatura; dos solicitudes simultáneas con operación igual o distinta no crean dos pares idénticos. Un payload cambiado o una revisión obsoleta devuelve 409, sin reemplazo implícito. Si la respuesta carece de recibo después del batch, la operación indica error: el batch **puede haber confirmado**; repetir la misma operación puede recuperar el recibo mientras siga conservado.

`inspectHumanMatchConflictsCore` examina únicamente listas estructuradas **suministradas por el llamador**, con límite de 50 por lado, y señala una combinación de `shortlisted` y `rejected` para la misma búsqueda y operación. No modifica las listas ni devuelve identificadores. Un conflicto es solo un conflicto en la evidencia aportada; sin conflicto la salida es `unverified`, nunca una confirmación de cobertura ni una autorización de fusión. No hay conexión fiable entre `matches` y `market_properties`, por lo que este comparador no consulta ni protege automáticamente los matches existentes.

## Esquema propuesto, no migración

[candidate-schema-proposal.sql](candidate-schema-proposal.sql) se aplica **solo dentro de los tests SQLite sintéticos**. Está fuera de `migrations`; no se modifica `0050`, no se aplica a D1 remoto y no se reclama que sea una migración lista para despliegue. Las tablas propuestas contienen candidaturas y recibos, no una segunda autoridad de decisiones; `market_identity_decisions` sigue siendo la autoridad existente para sus acciones actuales.

Las claves foráneas propuestas conservan referencias a observaciones. Eso exige resolver EST-19 antes de desplegar o ampliar retención. Las filas no admiten UPDATE, pero la propuesta no fija reglas definitivas de borrado: no garantiza idempotencia una vez que un futuro proceso de retención elimine recibos. El `operation_id` de candidaturas tiene su propio espacio de recibos; la comprobación inversa desde todas las operaciones históricas todavía no existe. No se debe presentar como una unicidad global de operaciones.

## Pendientes y límites de seguridad

- La unicidad del par es conservadora: si cambia la evidencia o sus versiones, no se sustituye la candidatura anterior. Hace falta un ciclo de versiones, invalidación y revisión antes de ofrecer actualización o cierre en una interfaz.
- La revisión y `different_properties` / `needs_review` aún no se registran como decisiones de la autoridad existente. No se ha intentado ampliar su CHECK ni reescribir `0050`.
- El comparador de matches no es un puente de autoridad, no confirma integridad ni completitud de la entrada y no valida el origen de esos datos. La función anterior `mergePropertyIdentitiesCore` **no lo consume**: mientras falte un contrato de matches revisados y un guard transaccional, no debe conectarse a un consumidor real ni interpretarse una ausencia de conflictos como permiso para fusionar.
- Revisión de fuente y `admins.added_at` no sustituyen la autenticación, pertenencia y generación duraderas de ADM-18. Fuentes, permisos, purga/reaparición EST-19, invalidación de proyecciones, rutas staff, interfaz, pruebas de extremo a extremo y revisión independiente siguen pendientes. Las instantáneas transitorias no resuelven el cambio posterior de evidencia por un escritor que no incremente su revisión; toda decisión futura debe revalidarla bajo un contrato robusto.

## Comprobación local

La primera ejecución de los tests nuevos falló por las dos capacidades ausentes; no fue un fallo de entorno. Con la implementación y el esquema propuesto aplicados solo a bases en memoria pasaron 18 pruebas nuevas y 29 regresiones SQLite existentes: **47/47**, excluyendo expresamente el caso `local D1`. Se cubrieron pares invertidos y reintentos concurrentes, operaciones distintas, fuentes de todos los miembros de un grupo, revocaciones de fuente y actor, cambio de contenido sin incrementar revisión durante el batch, evidencias ajenas, rollback, respuesta perdida tras commit, minimización y conflictos aportados sin decisión automática. `node --check`, `git diff --check` y `npm run check:release` pasaron. Hasta esa comprobación no se habían ejecutado Miniflare ni navegador, ni se habían aplicado migraciones remotas o usado datos reales.

## D1 local posterior

La focal `tests/server/bus-10-candidates-d1.test.mjs` pasó 1/1 en Miniflare con todas las migraciones de la base y el SQL propuesto aplicado únicamente a una D1 local efímera. Comprobó dos candidaturas simultáneas al mismo par, rollback forzado después de insertar candidato, revocación antes de la escritura, recuperación con el mismo `operation_id` tras respuesta sin recibo y ausencia de errores en `foreign_key_check`. No equivale a validar permisos duraderos ni estado, migraciones o concurrencia de D1 remoto.

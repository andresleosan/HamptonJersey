# Migraciones D1: estado y secuencia

La presencia de un archivo en este directorio indica que está versionado; no demuestra que se haya aplicado en una base remota. El 13 de noviembre de 2026 la consulta de solo lectura de esta sesión fue denegada y el estado remoto no se pudo determinar. Las pruebas de Miniflare y los checks de despliegue no cambian ese límite.

La orden de Wrangler para aplicar migraciones procesa las pendientes en orden. Antes de ejecutarla en una base existente, quien tenga acceso legítimo debe comprobar la lista real y revisar el impacto de **todas** las pendientes, la versión de aplicación que leerá los datos y la recuperación de código y datos. No ejecutar la cola por suposición de que solo contiene la última migración. [Documentación de Cloudflare](https://developers.cloudflare.com/d1/reference/migrations/).

## Revisiones pendientes en el árbol publicado

- `0049_financial_step_revision.sql`: la generación antigua de membresías deja de ser aceptada por la nueva guarda. Un rollback a código que ignore esa generación puede interpretarlas de otra forma. La protección de borrado y un índice único no previsto pueden impedir revocaciones o bajas. Resolver compatibilidad de lectores antiguos, acceso, revocación y retención antes de aplicar. [Análisis](../docs/superpowers/plans/2026-11-13-adm-18-case-lifecycle-finance-ledger.md).
- `0051_property_viewing_rules.sql`: su esquema no conecta reservas ni concede acceso. Revisar generación y retención de identidades y permisos por inmueble antes de conectar los flujos. [Evidencia](../docs/roadmap/work/VIS-10/foundation-evidence.md).

La propuesta de revocación y retención probada por separado aún no resuelve las colisiones con índices únicos inesperados y no forma parte de esta cola. No modificar retrospectivamente una migración ya publicada sin reconciliar antes el historial real de cada base.

## 0110 · ADM-12 case-access

`0110_case_access.sql` es aditiva (solo `CREATE TABLE` y `CREATE INDEX`) y su esquema no depende de 0046 ni 0049. El código sí: crear y activar un enlace del inquilino consume las capacidades de ADM-18 (`server/case-capabilities.js`), que exigen 0046 y 0049 aplicadas; sin ellas esas rutas responden 403 y no escriben nada. Encender `ADM12_CASE_ACCESS_READY` requiere además la clave `CASE_CHALLENGE_HMAC_KEY` y el envío de correo de AUT-17. [Ficha](../docs/roadmap/tasks/ADM-12.json).

## 0050 y 0068 · BUS-10

`0050_market_identity.sql` y `0068_market_identity_separations.sql` son aditivas: solo `CREATE TABLE`, `CREATE INDEX` y `CREATE TRIGGER`. Se aplican las dos, en ese orden, antes de encender `BUS10_IDENTITY_READY`; el código de identidad lee tablas de ambas. La autoridad por fuente se comprueba en cada decisión contra el estado actual del canal (permitido, revisión vigente y directorio actual aceptado). Sus referencias a observaciones preservan trazabilidad y bloquean una purga incompleta: la política de retención y baja queda en EST-19, que debe retirar antes los vínculos de identidad. [Evidencia](../docs/roadmap/tasks/BUS-10.json).

## 0052 · PUB-06 y SPR-01

`0052_listing_economics_history.sql` añade cinco columnas opcionales de condiciones económicas y combina su auditoría con snapshots validados de `available_on`. Su base SQL es 0042 y no depende de 0043–0047 ni 0049–0051. Se prueba también con 0048 presente. Los dos triggers de auditoría de 0042 deben coincidir con el DDL contrastado antes de reemplazarlos; la integración no ejecuta la cola de pendientes ni acredita aplicación remota. Las propuestas históricas bajo `docs/roadmap/work/` ya no son instaladores alternativos. El gate `PUB06_STRUCTURED_ECONOMICS_READY` permanece separado y exige marcador, columnas y las cuatro definiciones completas; no se habilita por incorporar este archivo.

# Migraciones D1: estado y secuencia

La presencia de un archivo en este directorio indica que está versionado; no demuestra que se haya aplicado en una base remota. El 13 de noviembre de 2026 la consulta de solo lectura de esta sesión fue denegada y el estado remoto no se pudo determinar. Las pruebas de Miniflare y los checks de despliegue no cambian ese límite.

La orden de Wrangler para aplicar migraciones procesa las pendientes en orden. Antes de ejecutarla en una base existente, quien tenga acceso legítimo debe comprobar la lista real y revisar el impacto de **todas** las pendientes, la versión de aplicación que leerá los datos y la recuperación de código y datos. No ejecutar la cola por suposición de que solo contiene la última migración. [Documentación de Cloudflare](https://developers.cloudflare.com/d1/reference/migrations/).

## Revisiones pendientes en el árbol publicado

- `0049_financial_step_revision.sql`: la generación antigua de membresías deja de ser aceptada por la nueva guarda. Un rollback a código que ignore esa generación puede interpretarlas de otra forma. La protección de borrado y un índice único no previsto pueden impedir revocaciones o bajas. Resolver compatibilidad de lectores antiguos, acceso, revocación y retención antes de aplicar. [Análisis](../docs/superpowers/plans/2026-11-13-adm-18-case-lifecycle-finance-ledger.md).
- `0050_market_identity.sql`: las referencias a observaciones preservan trazabilidad y bloquean purgas incompletas. Antes de aplicar y poblar, definir la política de retención/baja y la autoridad por fuente. [Evidencia](../docs/roadmap/work/BUS-10/foundation-evidence.md).
- `0051_property_viewing_rules.sql`: su esquema no conecta reservas ni concede acceso. Revisar generación y retención de identidades y permisos por inmueble antes de conectar los flujos. [Evidencia](../docs/roadmap/work/VIS-10/foundation-evidence.md).

La propuesta de revocación y retención probada por separado aún no resuelve las colisiones con índices únicos inesperados y no forma parte de esta cola. No modificar retrospectivamente una migración ya publicada sin reconciliar antes el historial real de cada base.

## 0052 · PUB-06 y SPR-01

`0052_listing_economics_history.sql` añade cinco columnas opcionales de condiciones económicas y combina su auditoría con snapshots validados de `available_on`. Su base SQL es 0042 y no depende de 0043–0047 ni 0049–0051. Se prueba también con 0048 presente. Los dos triggers de auditoría de 0042 deben coincidir con el DDL contrastado antes de reemplazarlos; la integración no ejecuta la cola de pendientes ni acredita aplicación remota. Las propuestas históricas bajo `docs/roadmap/work/` ya no son instaladores alternativos. El gate `PUB06_STRUCTURED_ECONOMICS_READY` permanece separado y exige marcador, columnas y las cuatro definiciones completas; no se habilita por incorporar este archivo.

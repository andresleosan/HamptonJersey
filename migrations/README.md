# Migraciones D1: estado y secuencia

La presencia de un archivo en este directorio indica que está versionado; no demuestra que se haya aplicado en una base remota. El 13 de noviembre de 2026 la consulta de solo lectura de esta sesión fue denegada y el estado remoto no se pudo determinar. Las pruebas de Miniflare y los checks de despliegue no cambian ese límite.

La orden de Wrangler para aplicar migraciones procesa las pendientes en orden. Antes de ejecutarla en una base existente, quien tenga acceso legítimo debe comprobar la lista real y revisar el impacto de **todas** las pendientes, la versión de aplicación que leerá los datos y la recuperación de código y datos. No ejecutar la cola por suposición de que solo contiene la última migración. [Documentación de Cloudflare](https://developers.cloudflare.com/d1/reference/migrations/).

## Revisiones pendientes en el árbol publicado

- `0049_financial_step_revision.sql`: la generación antigua de membresías deja de ser aceptada por la nueva guarda. Un rollback a código que ignore esa generación puede interpretarlas de otra forma. La protección de borrado y un índice único no previsto pueden impedir revocaciones o bajas. Resolver compatibilidad de lectores antiguos, acceso, revocación y retención antes de aplicar. [Análisis](../docs/superpowers/plans/2026-11-13-adm-18-case-lifecycle-finance-ledger.md).
- `0050_market_identity.sql`: las referencias a observaciones preservan trazabilidad y bloquean purgas incompletas. Antes de aplicar y poblar, definir la política de retención/baja y la autoridad por fuente. [Evidencia](../docs/roadmap/work/BUS-10/foundation-evidence.md).
- `0051_property_viewing_rules.sql`: su esquema no conecta reservas ni concede acceso. Revisar generación y retención de identidades y permisos por inmueble antes de conectar los flujos. [Evidencia](../docs/roadmap/work/VIS-10/foundation-evidence.md).

La propuesta de revocación y retención probada por separado aún no resuelve las colisiones con índices únicos inesperados y no forma parte de esta cola. No modificar retrospectivamente una migración ya publicada sin reconciliar antes el historial real de cada base.

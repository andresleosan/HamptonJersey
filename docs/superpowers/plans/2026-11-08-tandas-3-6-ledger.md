> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# Ledger · Planificación de tandas 3–6

8-nov-2026. Copia `[copia local de planificación]`, main y GitHub verificados a las 14:12:18 UTC en `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. Se conservan las copias y planes anteriores. Planificación local sin reservas, operaciones remotas de coordinación, construcción, migraciones ni publicación.

## Estado por tanda

- 3 (PUB-09/SPR-02): presentación de fecha existente y motivo de retirada tienen pasos concretos. Historial sigue aplazado mientras Luis no decida; productores futuros y conservación tras purga requieren contratos adicionales. No se marca completa ninguna tarea.
- 4 (SPR-07/SPR-08/SPR-03): diseño preliminar, condicionado a BUS-10, EST-16, AGE-06 y EST-13; faltan DTO/rutas, Notes/retención y protocolo detallado de captura, almacenamiento y exportación. No presentar como listo para construir.
- 5 (ANA-04/ANA-05): diseño y secuencia para agregados; activar solo tras resolver elección de Luis, retención y revisión de privacidad/coste. El embudo individual no se infiere de contadores agregados y requiere consentimiento y diseño separado si se elige.
- 6 (PUB-10/PUB-19/PUB-20/ANA-10): propuesta de fases; pendientes identidad/idempotencia, reglas de recuento y supresión, atribución, retención y PRE-03/PRE-09. No presentar como listo para construir ni asumir anonimato por QR opaco.

## Revisión independiente

Revisor de constructor `tandas_revisor`, lectura únicamente: detectó eventos deliberados confirmed/published, estimación de published_at heredado, falta de contratos de inventario/captura y de manejo ZIP/URLs con credenciales; la documentación fue corregida o sus fases marcadas pendientes. En métricas corrigió coste por acción frente a dimensiones, truncamiento y transporte de IP/cookies; en demanda, la definición de match, top 10, supresión por diferencias y vinculación indirecta de QR. No equivale a revisión jurídica ni a validación de producto.

Preguntas formuladas a Luis: tratamiento de vista History previamente aplazada; elección de agregados o seguimiento individual; formatos de exportación JSON/CSV para D10. Mientras no haya respuesta se conserva la vista aplazada, se proponen solo agregados y D10 no se da por decidida. La información de Hampton sobre JOIC y aviso de propietarios sigue pendiente; no se ha contactado a nadie.

Comprobaciones documentales: enlaces locales y criterios por tanda; `node scripts/render-roadmap.mjs --check`, `git diff --cached --check`. No se corrieron pruebas de producto ni migraciones; Playwright no aplica a esta entrega documental. Siguiente trabajo: cerrar diseños pendientes de las tandas 1–2 y de captura/privacidad de 4–6; respetar dependencias de la reconciliación vigente.

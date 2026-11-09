> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# Tanda 0 · Integración de los planes de ficha

8-nov-2026 · main observado `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. Solo planificación; los cinco planes individuales siguen sin construir. Esta matriz reconcilia sus contratos; no sustituye los criterios detallados ni convierte una tarea en dependencia integrada. Las referencias locales están en el [índice de tandas](2026-11-08-lista-4-tandas-de-planificacion.md).

## Orden propuesto de construcción

1. **SPR-01:** `bathrooms` en lista y una sola `available_from` con fecha real 0001–9999, opcional; evento y pruebas. No confirma disponibilidad ni se publica en web.
2. **PUB-06:** reutilizar fecha; introducir `interior_area_sqft` única para ratios, más costes y formato de business. No duplicar fecha ni sumar premium y renta; preservar precio base de filtros.
3. **PUB-04:** dirección interna y `property_condition` común; no copiarla a location pública. Puede construirse antes o después de PUB-06 si la base se adapta.
4. **PUB-05:** reutilizar área y condición, agregar físicos y overrides con proyección/evidencia de matching coherentes, incluso al recalcular. Una sola edición de baños/tipo y de superficie. Ubicar área y condición en Physical details cuando PUB-05 esté integrada, con un selector por campo y los IDs existentes.
5. **PUB-07:** datos legales/técnicos privados. Se puede construir independientemente tras adaptar la base; BUS-13 permanece pendiente de categorías de Hampton y revisión jurídica.

El orden es técnico propuesto, no reserva ni aprobación. La fecha y área son prerrequisitos para la parte que los consume; la condición puede introducirla PUB-04 o PUB-05, pero exactamente una vez. El número de migración se elige en la base real inmediatamente antes de construir; los números sugeridos en planes anteriores no están reservados. Cada tarea que recree triggers debe partir de la última versión integrada, preservando todas las columnas ya añadidas, nunca regresar a una versión histórica. Ejecutar cada migración de forma secuencial en una base de prueba con filas previas y verificar integridad y eventos; aplicación real y publicación requieren autorización separada.

## Matriz de contratos

| Interacción | Contrato combinado y verificación |
|---|---|
| Fecha SPR-01 / PUB-06 | `available_from` una columna, validador y control, año 0001–9999; acepta pasado, null desconocido. La lista solo muestra fecha en mercado y no archivada. Confirmar ambas aceptaciones con un mismo dato. |
| Área PUB-06 / PUB-05 | `interior_area_sqft` única, 0 < valor < 1e8 y máximo dos decimales. m² es salida calculada con 0.09290304; ratios no se guardan. Probar guardar y recargar sin deriva, falta de moneda/precio y periodos diferentes. |
| Condición PUB-04 / PUB-05 | Una columna y enum `new_build`, `existing`, `good`, `needs_modernisation`, `needs_renovation`; labels idénticos y una fuente de verdad. `existing` no significa good. No duplicar controles al reorganizar el editor. |
| Editor | Un Save/Discard y el mismo `updated_at`; preservar IDs y accesibilidad al mover controles. Campos ocultos por operación no se borran. Ninguna familia nueva cambia por sí sola la elegibilidad de Publish. |
| Estado comercial | Solo los cambios existentes de availability/precio/rent/premium actualizan `confirmed_at`; fecha, dirección, rasgos, costes auxiliares y datos legales no lo hacen. Conservar `afterSave` y sus efectos de recálculo existentes. |
| Matching | PUB-05 aplica overrides tras extracción en todos los caminos, actualiza `feat_*` y `_requirements` juntos y agrega overrides al SELECT de recálculo; PUB-04 y PUB-07 no infieren parroquia, categoría ni cumplimiento. No ampliar criterios automáticamente. |
| Privacidad | `toPublic` sigue whitelist. Dirección interna, costes nuevos, overrides, licencia, certificado y abogado no se exponen. La etiqueta de business puede reflejar la renta ya pública. Las respuestas de detalle/media del panel conservan permisos actuales. |
| Eventos | `available_from`, importes, área y enums según sus planes pueden incluir valores; texto libre de dirección/suministros y todos los datos nuevos PUB-07 solo nombres de campo. Los overrides físicos tipados se registran según PUB-05. No incluir datos privados de texto en before/after ni retroceder triggers entre migraciones. |
| Cola e importación | Preservar whitelists: Para PUB-04 rechazar en queue la presencia de `building_name_or_number`, `postcode`, `developer_name` y `property_condition`, incluso null; en panel se editan después de crear el borrador. PUB-05 rechaza `feature_overrides` no vacío para queue; PUB-07 rechaza cualquier clave suya presente incluso null. Ambos controles deben coexistir antes de create y retornar error sin borrar el borrador; no inferir entrada humana ni modificar reglas de los otros campos sin diseño. |
| Concurrencia | Crear y editar atómicamente, con `updated_at` y 409; componer `checkPrice`, `checkIdentity`, `checkPhysical` y validación legal sobre una sola fila fusionada y agregar errores antes de escribir. No-op, 400 y 409 no deben añadir eventos; fallos del batch no dejan cambios parciales. |

## Puertas de aceptación por tarea

- **SPR-01:** baños y fecha visibles según estado; creación, edición, limpieza y fecha real con pruebas de lista, API y eventos.
- **PUB-06:** precios y periodos por operación, costes opcionales, ratios sin valores inventados y salida pública/SEO de business coherente.
- **PUB-04:** dirección y promotor internos, código Jersey normalizado sin afirmar verificación, condición compartida y ningún cambio de IDs o exposición pública.
- **PUB-05:** campos físicos, conversión exacta, overrides y certeza persistentes tras guardar y recalcular; estados desconocidos diferenciados y sin nuevas reglas.
- **PUB-07:** licencia, certificado, ocupación y abogado opcionales, comprobación cruzada, privacidad e independencia de Sales/Rentals; petición a Hampton preparada, sin enviar.

## Validación combinada antes de construcción y entrega

En la base realmente integrada, comparar spec, migraciones y tests de los cinco planes; resolver cualquier desviación antes de escribir. Probar transición completa de esquema con datos previos y triggers acumulados; canarios sintéticos de privacidad en público, SEO, Hermes e historial; queue con ambas familias; dos editores con 409; recalcular matching tras overrides; y Save/Discard de todos los grupos en 390/1280 y zoom 200 %. Ejecutar pruebas focalizadas y después `npm test`, `npm run build`, `npm run check:release` y e2e/Playwright según el flujo vigente. Registrar por tarea qué se verificó, qué falta y cualquier decisión externa; nunca declarar aprobados test o migraciones no ejecutados.

## Revisión independiente

Revisor de constructor, solo lectura: confirmó orden, colisión de números de migración, preservación acumulativa de triggers y diferencias de auditoría; detectó la aceptación inadvertida de campos de PUB-04 por Queue y la necesidad de fijar una única ubicación de área y condición. Los ajustes anteriores resuelven esos puntos en esta propuesta. Planes históricos que citan operaciones remotas de planificación quedan subordinados a la regla actual: plan local sin reservas ni operaciones remotas.

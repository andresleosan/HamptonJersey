# Last contact, filtros y Gone quiet en Applicants (SAP-07 + EST-11)

Fecha: 4-nov-2026. Decisiones de Luis en el brainstorming del 3/4-nov.

| # | Decisión |
|---|---|
| L1 | **Fecha propia `contacts.last_contact_at`** (migración 0019). Solo la cambia un contacto real con el cliente: alta (web o panel, también una nueva búsqueda de un contacto que ya existe), envío repetido desde la web, **Log conversation**, una visita pedida, reservada, confirmada, movida o hecha (las mismas acciones que ya reinician los 12 meses, `touchByViewing`) y una **oferta registrada**. Las ediciones del equipo, los cambios de etapa y los cambios de una oferta ya registrada no la tocan. `last_activity_at` (los 12 meses) sigue igual. |
| L2 | Las fichas que ya existen arrancan con la fecha más reciente de su historial: alta del contacto, alta de sus búsquedas, conversaciones y envíos repetidos, visitas con su email o móvil y ofertas. |
| L3 | **Gone quiet**: toda búsqueda activa (no archivada, ni Lost ni Completed; Paused incluida, decisión de Luis) cuyo último contacto tiene más de 14 días. Se calcula al leer, sin reloj ni bandera. El mensaje «Are you still looking?» espera a un canal de envío (correo o Meta). |
| L4 | **Columna Last contact** en la lista, con la fecha y la etiqueta «Gone quiet» (badge `attention`). Filtro «Last contact»: Any / Gone quiet. |
| L5 | **Filtro de presupuesto** con un importe: salen los clientes cuyo presupuesto lo cubre, de `budget_min` (o sin mínimo) hasta `budget_stretch`, o `budget_max` si no hay estirado (la misma tope que el matching). Sin presupuesto: entran. |
| L6 | **Filtro de parroquia**: entran quienes la pidieron y quienes no pidieron ninguna, salvo los que la excluyeron. |
| L7 | **Filtro de origen**: Website, Phone, Walk-in, Email (`applicants.source`). |

Fuera: el mensaje automático, varias etiquetas a la vez en Queue (EST-10), paginación.

## Reglas de DESIGN.md que toca
- Filtros del panel: `.filters` con `label > select/input` y el recuento `aria-live` que ya hay.
- Badges en contorno: `attention` (bronce oscuro) para Gone quiet; nada de colores nuevos.
- Tabla `table.list` con `data-label` en cada celda para el móvil (390).
- Accesibilidad: cada control con su `label`; la fecha en `<time dateTime>`.
- Seguridad: los filtros nuevos se validan en el servidor (lista cerrada o número) y van siempre con `bind`, nunca en el SQL.

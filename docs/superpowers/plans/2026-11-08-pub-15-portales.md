> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PUB-15 · Feeds de portales — plan preliminar

> Solo planificación. Construcción futura con superpowers:executing-plans y coordinación de alcance.

**Objetivo:** distribuir fichas a portales contratados y registrar sus identificadores. **Arquitectura:** un adaptador por contrato real, preservando la ficha canónica; estado y confirmación por portal. **Stack:** Worker/D1 y panel; formato y transporte pendientes. **Spec:** `docs/superpowers/specs/2026-11-08-tanda-ampliada-design.md`.

1. [ ] Hampton indica portales, cuentas, contratos, especificaciones de feed, formatos, frecuencia, políticas de retirada, identificadores y límites. Sin estos datos no definir esquemas ni prometer integración.
2. [ ] Por cada portal, mapear explícitamente campos públicos, fotos autorizadas y públicas según `server/visibility.js`, actualización/retirada, ausencia de datos y reglas de estados; evitar publicar material sin derechos o datos privados. Establecer quién aprueba la salida y gestionar cambios posteriores.
3. [ ] Diseñar relación única ficha/portal/ID externo, historial y recuperación ante identificador desconocido, envío repetido, borrado y respuesta tardía. Consultar/confirmar con el proveedor antes de reintentar un resultado incierto; no inventar garantía de idempotencia.
4. [ ] Crear pruebas con adaptador falso para creación, cambio, retirada, rechazo parcial, fotos faltantes, duplicación y restauración; cada portal tiene tests derivados de su especificación real.
5. [ ] Verificar pruebas focalizadas, `npm test`, build, check:release y e2e del panel; configuración o envío real solo con autorización. **No listo:** faltan portales y contratos.

Archivos por revisar: `server/listing.js`, `server/routes/listings.js`, `admin/src/ListingEditor.jsx`, pruebas de listings y futuras migraciones/adaptadores cuando se conozcan contratos.

## Decisión posterior de Luis

Hampton no usa por ahora portales inmobiliarios; menciona Facebook y añadirá más portales después. Facebook corresponde a PUB-03, no se inventa un feed de portal. La ampliación a portales queda aplazada.

Luis confirma que Facebook también queda para más adelante. Ningún canal externo queda activo por esta tanda.

Luis confirma que los portales se añadirán más adelante, sin construir ahora un sistema común ni integración de feeds por inferencia. Los canales actuales previstos son web de Hampton y publicaciones manuales de Luis en Facebook e Instagram.

> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PUB-07 · Ledger de planificación

Fecha: 8-nov-2026. Copia exclusiva `[copia local de planificación]`; main local y GitHub comprobados a las 13:47:18 UTC en `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. Se preservaron los planes pendientes de otras copias. Plan local sin reserva ni autorización de construcción. No se modificaron código, datos, esquema, checklist ni producción.

## Decisiones de diseño propuestas

- D1. Licencia, certificado energético, ocupación y contacto del abogado son datos opcionales de la ficha; no son evaluación de cumplimiento.
- D2. Estados desconocidos se guardan como null; estados explícitos nunca se infieren automáticamente.
- D3. Referencia y fecha son opcionales solo para estado registrado; cambiar de estado exige limpiarlas explícitamente y validación en la fila combinada.
- D4. Fechas reales 0001–9999, incluidas fechas pasadas; no se calculan vencimientos ni se emiten alertas.
- D5. Datos de abogado de ficha, Sales y controles de Rentals son independientes, sin copia ni sincronización automáticas.
- D6. Nuevos datos internos no van a web, SEO, sitemap, mensajes ni Hermes; acceso autenticado existente incluye respuestas de detalle y media.
- D7. Eventos registran nombres de campos, no sus valores; mantener triggers existentes al agregar migración.
- D8. Cola rechaza expresamente las nuevas claves, incluso null; importación no las mapea. No se pierden silenciosamente.
- D9. Controles siempre accesibles, con errores y valores visibles al cambiar estado; una sola operación Save/Discard y bloqueo optimista.
- D10. No cambiar categoría, matching, publicación ni confirmed_at por estos datos; conservar recálculos actuales.
- D11. BUS-13 sigue pendiente de categorías de Hampton y revisión jurídica; petición preparada, no enviada.
- D12. Migración aditiva usa el siguiente número libre al construir; no existe reserva de número durante planificación.

## Evidencia y revisión

Catálogo local: PUB-07 parcial, aceptación de campos y solicitud de categorías; BUS-13 establece dependencia parcial y revisión jurídica de la tabla. Arquitectura §5.10 define los cuatro campos. `server/listing.js`, rutas de listings, Sales y Queue, editor, esquema de Sales, Rentals y eventos contrastados con la base. Sin datos privados de Hampton, sin respuestas inventadas. Diseño y validaciones descritos en la [spec](../specs/2026-11-08-pub-07-legal-technical-design.md) y el [plan](2026-11-08-pub-07-legal-technical.md).

Revisión independiente de constructor, solo lectura: advirtió que media devuelve la ficha completa, que Queue pasa el body íntegro, que los campos vacíos deben seguir accesibles y que `realDate` acepta año 0000. Se concretaron las respuestas autenticadas y rechazo de Queue, controles siempre visibles y verificación adicional del año. Sin bloqueos restantes identificados para el plan. La revisión no valida obligaciones legales ni proporciona las categorías.

Validación de planificación: enlaces y rutas locales, cobertura A1–A8 y D1–D12, `node scripts/render-roadmap.mjs --check`, y `git diff --cached --check` se ejecutan al cierre. No se ejecutan pruebas de producto, migración ni Playwright para estos documentos; Playwright no aplica a planificación. El trabajo queda local y sin publicar.

## Siguiente tarea sugerida

PUB-08, familia de marketing: etiquetas, textos sociales y URL separada de vídeo sobre campos existentes. Modelo recomendado `gpt-6.1-terra` · esfuerzo `high`: abarca esquema, editor y salida pública con pruebas de privacidad, URL y presentación. La elección no cambia el modelo de esta sesión.

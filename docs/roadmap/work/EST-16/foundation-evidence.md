# EST-16 · Cálculo local de hechos comerciales

13-nov-2026. Avance parcial preparado sobre `9df8825088fb9564dbb8eeb544692b05041898f6`: cálculo puro sin ruta, almacenamiento, migración, fuente real ni consumidor integrado. No concede permisos ni autoriza reservas, capturas o comunicaciones. El campo `source_kind` es un contrato de entrada para datos ya verificados, no una comprobación de identidad o autenticidad.

## Alcance

- `resolveCommercialFacts` trata por separado observaciones de publicación y confirmaciones humanas comerciales. Una ausencia o fallo de la fuente no se convierte en indisponibilidad. Una observación anterior, aunque se reciba después, no invalida una confirmación posterior.
- Una contradicción material posterior solicita revisión y devuelve disponibilidad desconocida para evitar reactivar automáticamente el alcance; conserva la última confirmación y su fecha como información separada. Un fallo posterior de la fuente no borra esa contradicción. Una confirmación humana posterior puede resolverla.
- El cálculo usa un alcance exacto de inmueble, operación, anunciante y publicación: no hereda hechos entre ámbitos ni entre hogares. Esta restricción conservadora no implementa todavía la propagación de hechos generales a publicaciones o consultas compartidas.
- No se inventan caducidades de 7/30 días ni se usa `listings.confirmed_at` como prueba comercial. Valores, tipos, fechas, ámbitos e identificadores se validan y una contradicción simultánea no se resuelve por orden de entrada. Si hay más de 5.000 hechos se rechaza la entrada completa; no se presenta un subconjunto como completo.

## Verificación y pendientes

La prueba focal se escribió antes de la función: inicialmente falló por módulo ausente y después aprobó 13 casos sintéticos de límites de fuente, cronología, ámbitos y contradicciones. Playwright no aplica a este cambio sin interfaz.

Faltan persistencia versionada y su operación atómica, evidencia y autorización acreditadas, resolución de hechos generales frente a ámbitos específicos, eventos EST-18, consumidores, revisión de permisos y retención, integración de BUS-06/BUS-09/BUS-10 y pruebas de extremo a extremo. Hasta entonces EST-16 no puede contarse como terminada y este cálculo no debe conectarse a acciones productivas.

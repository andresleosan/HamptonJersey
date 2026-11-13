# EST-16 · Cálculo local de hechos comerciales

13-nov-2026. Avance parcial preparado sobre `9df8825088fb9564dbb8eeb544692b05041898f6`: cálculo puro sin ruta, almacenamiento, migración, fuente real ni consumidor integrado. No concede permisos ni autoriza reservas, capturas o comunicaciones. El campo `source_kind` es un contrato de entrada para datos ya verificados, no una comprobación de identidad o autenticidad.

## Alcance

- `resolveCommercialFacts` trata por separado observaciones de publicación y confirmaciones humanas comerciales. Una ausencia o fallo de la fuente no se convierte en indisponibilidad. Una observación anterior, aunque se reciba después, no invalida una confirmación posterior. Una consulta histórica excluye hechos que aún no se habían recibido en esa fecha.
- Una contradicción material posterior solicita revisión y devuelve disponibilidad desconocida para evitar reactivar automáticamente el alcance; conserva la última confirmación y su fecha como información separada. Un fallo posterior de la fuente no borra esa contradicción. Una confirmación humana posterior puede resolverla.
- El cálculo usa un alcance exacto de inmueble, operación, anunciante y publicación: no hereda hechos entre ámbitos ni entre hogares. Esta restricción conservadora no implementa todavía la propagación de hechos generales a publicaciones o consultas compartidas.
- No se inventan caducidades de 7/30 días ni se usa `listings.confirmed_at` como prueba comercial. Valores, tipos, fechas, ámbitos e identificadores se validan y una contradicción simultánea no se resuelve por orden de entrada. Si hay más de 5.000 hechos se rechaza la entrada completa; no se presenta un subconjunto como completo.

## Verificación y pendientes

La prueba focal se escribió antes de la función: inicialmente falló por módulo ausente y después aprobó 15 casos sintéticos de límites de fuente, cronología, ámbitos y contradicciones. Playwright no aplica a este cambio sin interfaz.

Faltan persistencia versionada y su operación atómica, evidencia y autorización acreditadas, resolución de hechos generales frente a ámbitos específicos, eventos EST-18, consumidores, revisión de permisos y retención, integración de BUS-06/BUS-09/BUS-10 y pruebas de extremo a extremo. Hasta entonces EST-16 no puede contarse como terminada y este cálculo no debe conectarse a acciones productivas.

La revisión independiente no detectó fallos graves del cálculo desconectado y ejecutó 46 comprobaciones sintéticas adicionales. Detectó que un array disperso podía omitir un hecho al procesarse: la regresión falló antes de la corrección y después la entrada incompleta se rechazó. Esta validación no es una barrera para objetos JavaScript hostiles; cualquier consumidor futuro debe validar el límite de entrada y procedencia.

Verificación final de la copia integrada: `npm test` aprobó 1.483 pruebas JavaScript y 25 Python; `build`, `check:release`, `team:check` y `check:packages` aprobaron. Al añadir la guía de migraciones, una primera ejecución detectó que el helper Python leía cualquier archivo como SQL; se corrigió para cargar solo `.sql` y la suite completa se repitió correctamente.

## Preparación de persistencia · 13-nov-2026

La [propuesta de persistencia y dependencias](persistence-readiness.md) precisa las guardas transaccionales, el replay, el acceso y la retención pendientes. BUS-10 aún deniega su fachada; faltan autoridad duradera de sesión y membresía, acceso por fuente y reglas verificables de evidencia y retención. No se añadió persistencia, migración ni acceso: un prototipo aislado puede probarse con datos ficticios, pero no acreditaría las guardas integradas de esas dependencias. Se repitieron las 15 pruebas sintéticas focales del cálculo existente; todas aprobaron. No se ha probado una transacción D1 nueva ni datos o permisos reales. Playwright no aplica.

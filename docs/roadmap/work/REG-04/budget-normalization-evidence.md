# REG-04 · Normalización de presupuestos desconectada

13-nov-2026. Base: `10f6a96ba6152197a443d1b3a899bc30afff6be2`. REG-04 sigue **parcial**: esta unidad prepara términos para el futuro motor, sin integrar ni activar una evaluación o escritura comercial.

## Tramo preparado

`normalizeBudgetTerms(snapshot)` se ofrece desde el módulo del lector BUS-12 y es una función pura que consume la forma de su instantánea. No consulta contactos ni bases de datos. Tampoco modifica el objeto recibido, compara inmuebles, cambia búsquedas ni autoriza acciones. No está llamada por rutas, formularios ni el matcher actual. Identifica cada término por operación y conserva su valor original, unidades menores, moneda y periodo declarado. No suma renta, compra, traspaso ni gastos, ni divide un precio de compra por doce. El límite residencial usa el stretch declarado como techo final y conserva por separado el máximo y mínimo; valores contradictorios, mal formados o sin moneda conocida dejan el techo pendiente.

El esquema y los formularios actuales expresan presupuestos en GBP y el alquiler residencial por mes. Se usa esa unidad solo cuando no hay declaración de moneda adicional; las declaraciones ausentes no se fabrican si una fuente proporciona moneda explícitamente nula, desconocida o contradictoria. Si una fuente futura aporta una moneda reconocida y consistente, se conserva sin conversión entre divisas. La conversión decimal a unidades menores reutiliza `ownMoneyToMinor` de BUS-09; importes que no caben exactamente en unidades menores quedan pendientes. El cero declarado es válido para los campos existentes de traspaso y gastos, y permanece distinto de `null` y de `not_applicable`.

Para renta mensual o anual se conserva la equivalencia mensual como fracción exacta de unidades menores, sin redondeo: £24.000/año son `2400000/12` peniques por mes, y £24.000,01/año conserva el penique adicional en el numerador. La lista `unknowns` identifica campos y tampoco equivale a una evaluación global ni a una autorización. Esta fracción no constituye una comparación ni una autorización para generar un match; los futuros consumidores deben comparar con aritmética exacta y comprobar divisa, periodo, identidad, ámbito y versión. El esquema no registra el periodo de gastos comerciales: su importe se conserva pero el término permanece pendiente, sin presumir periodicidad.

## Dependencias y decisiones

- **Ruling:** mantener BUS-12/AUT-19 desconectados porque siguen sin CAS de criterios integrado ni flujo de confirmación real. Coste: el personal no puede usar esta función para editar criterios ni ejecutar matching comercial hasta integrar y revisar los productores, consumidores y esquema reales.
- **Ruling:** exportar la función desde el lector existente, conservando la llamada explícita en futuros consumidores y sin añadir otro parser o calculador de matching. Coste: el cargador actual no aplica la normalización automáticamente y los consumidores futuros deben conectarla con las garantías de BUS-12.
- **Ruling:** conservar fracciones mensuales exactas en lugar de la función de renta de BUS-09, que redondea para su resultado mensual. Coste: el consumidor futuro debe admitir fracciones y realizar la comparación exacta, además de verificar la moneda.
- La operación efectiva `transfer` conserva separados el precio de traspaso y la posible renta asociada. Para gastos no hay una operación ni un periodo almacenados y ambos permanecen desconocidos.
- No se crean migraciones ni se modifica la ficha pública de inmuebles. Las prioridades, mascotas, parking y demás criterios no se tocan. El editor, los formularios y el matching comercial exigen trabajo adicional en sus dueños.

## Verificación

- Las pruebas focales emplean únicamente valores ficticios. Los casos cubren techo £2.200 frente a máximo £2.000, compra y alquiler separados, £24.000/año, penique anual sin redondear, moneda desconocida o contradictoria, importe y periodo desconocidos, cero declarado, importes inválidos y términos no aplicables.
- La prueba con el lector real usa SQLite en memoria y tres búsquedas ficticias de una misma persona. Añade `criteria_revision` únicamente a ese esquema de prueba: no acredita que esa columna exista en D1 remoto. La normalización no altera el snapshot ni las prioridades.
- La ejecución conjunta de focales y regresiones `reg-04-*`, `search-criteria`, `bus-09-normalization`, `requirements-matching` y `applicants-validate` pasó **85/85**. Tras detectar que un techo ausente señalaba `budget_max` como origen, una prueba reprodujo el fallo y se corrigió para conservar origen desconocido.
- La primera suite Node completa pasó **1.725/1.725** antes de la corrección de origen desconocido; la repetición final con concurrencia 2 pasó **1.726/1.726**. Las **25/25** pruebas Python, `npm run build` y `npm run check:release` pasaron; Vite mantuvo su aviso previo por un chunk superior a 500 kB. No aplican pruebas de navegador: no cambia la interfaz.

No se ha consultado producción ni cuentas, aplicado migración activa, publicado o conectado un servicio. Esta evidencia no sustituye revisión independiente ni evidencia de integración o activación.

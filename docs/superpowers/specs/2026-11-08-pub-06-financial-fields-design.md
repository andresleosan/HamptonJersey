> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PUB-06 · Datos económicos de la propiedad

Fecha: 8-nov-2026. Lista 4. Encargo: **solo planificación**. Propuesta técnica para revisión, sin construcción, migración ni publicación autorizadas.

## Resultado y fuentes

El equipo podrá editar depósito, parish rates, service charge y suministros incluidos; consultar el precio por pie² cuando conozca la superficie; y guardar premium más renta en un negocio. La fecha de disponibilidad usa el contrato único definido en SPR-01. No se calculan obligaciones legales, topes de depósitos, impuestos, financiación ni coste total de ocupación.

Fuentes: tarea canónica `docs/roadmap/tasks/PUB-06.json`, arquitectura §5.10 (familia económica), PUB-05 (superficie interior) y planificación SPR-01 del 8-nov-2026. Base comprobada: `main`, `6d2f77922f797a1ffd6a23e2030308440ca81adf`. El original privado de Luis no está en esta copia; no se ha copiado.

Situación real: `listings` ya almacena `sale_price`, `rent`, `rent_period`, `premium`, `currency` y `price_text`. `ListingEditor.jsx` muestra solo premium para business, aunque la API puede almacenar renta y premium juntos. Los formatos de panel/web muestran un único importe; SEO reutiliza el formato público. No hay superficie interior estructurada ni los demás campos de esta familia. EST-18 enumera campos en triggers: una columna nueva necesita ampliar su auditoría.

## Alternativas y propuesta

1. **Recomendada:** columnas opcionales y unidades explícitas, reutilizando moneda y guardado actuales; valores derivados calculados al presentar, sin persistir ratios.
2. Meter los costes en Specification: menos columnas, pero tipos y periodos ambiguos, difícil validación y ningún contrato claro para reutilización. Descartada.
3. Modelo contable de cargos recurrentes/partidas: innecesario para esta ficha; corresponde a gestión de alquileres y pagos, no PUB-06. Descartado.

El agente propone estos detalles como decisiones de diseño. Luis eligió la tarea y solo planificación; no se le atribuye aprobación de los campos nuevos ni de su construcción.

## Contrato de campos

Todos los nuevos campos son opcionales y arrancan en `null`, sin inferir datos del texto de anuncios. PUT parcial omitido conserva y vacío/espacios/null borra según la normalización existente. API conserva unidades monetarias mayores de la moneda de la ficha: `1250.50` significa £1,250.50 o €1,250.50; no son peniques/céntimos. No mezclar monedas en una ficha.

| Campo | Tipo y validación no vacía | Semántica / etiqueta inglesa |
| --- | --- | --- |
| `rental_deposit` | REAL, número finito `0 <= n < 1e10`, hasta 2 decimales | Importe único del depósito; `Rental deposit`. Null desconocido, 0 declarado sin depósito. No calcular semanas ni validar un tope legal. |
| `parish_rates` | REAL, misma regla monetaria | `Parish rates`, no council tax/IBI. |
| `parish_rates_period` | TEXT, `month` o `year` | `Rates period`; obligatorio si parish_rates no es null, incluido 0. Sin periodo por defecto. |
| `service_charge` | REAL, misma regla monetaria | `Service charge`; 0 conocido distinto de desconocido. |
| `service_charge_period` | TEXT, `month` o `year` | `Service charge period`; obligatorio si service_charge no es null, incluido 0. |
| `utilities_included` | TEXT, máximo 1000 caracteres tras trim | Nota `Utilities included`; vacío desconocido, `None` explícito si el empleado sabe que no se incluye ninguna. No extraer significado automáticamente. |
| `interior_area_sqft` | REAL, número finito `0 < n < 1e8`, hasta 2 decimales | Superficie interior `Interior area (sq ft)`, mínimo dato compartido para calcular el ratio. No superficie de terreno. |
| `available_from` | Contrato SPR-01: TEXT nullable, fecha real exacta `YYYY-MM-DD`, año 0001–9999 | No nuevo nombre ni segunda fecha. No equivale a confirmed_at, reserva de visita o disponibilidad actual. |

## Decisiones funcionales

| ID | Decisión propuesta |
| --- | --- |
| D1 | Conservar validación de precios existentes: sale_price/rent/premium positivos o null, GBP/EUR, y rent_period obligatorio cuando hay rent. Los importes nuevos admiten 0 porque expresa un coste conocido nulo; error numérico `Enter an amount from 0 with up to 2 decimal places, or leave blank if unknown`. |
| D2 | Moneda obligatoria cuando cualquier importe existente o nuevo es no null, incluso 0. Un periodo sin importe puede guardarse como dato parcial; un importe de rates/charge sin periodo se rechaza en su campo de periodo con `Choose month or year`. Los campos nuevos nunca son requisitos de Publish. |
| D3 | Depósito se muestra para rent y business; rates/charge/utilities para todas las operaciones. Cambiar Operation conserva datos de los campos temporalmente ocultos, igual que el editor actual; no los reasigna ni suma. No borrar importes por inferencia. |
| D4 | Un solo `interior_area_sqft`, compartido con PUB-05. Este plan incluye el mínimo campo de superficie para evitar un ratio sin denominador; PUB-05 reutilizará la columna para su familia física y futura conversión a m². No crear un área exclusiva de Price, no inferirla de specs ni sumar plantas/terreno. PUB-05 seguirá parcial. |
| D5 | Ratio derivado, no editable ni persistido. Venta: sale_price/sqft; alquiler: rent/sqft con el mismo periodo de rent; negocio: premium/sqft y rent/sqft como dos conceptos independientes. Sin superficie, precio, moneda o periodo válido del alquiler, ese ratio no se muestra. No usar 0, Infinity, NaN o Available now como sustitutos de desconocidos. |
| D6 | Ejemplos: venta £500,000 y 1,000 sq ft → `£500.00 per sq ft`; alquiler £1,200/mes y 800 sq ft → `£1.50 per sq ft pcm`; alquiler £14,400/año → `£18.00 per sq ft p.a.`; negocio £10,000 premium + £1,200/mes sobre 800 sq ft → `£12.50 premium per sq ft` y `£1.50 per sq ft pcm`, nunca £14.00 como total. Ratio con Intl/en-GB y exactamente dos decimales solo al presentar. |
| D7 | Business enseña Premium, Rent y Rent period simultáneamente. Textos de panel/web: ambos `£90,000 premium + £1,200 pcm`; solo premium conserva `£90,000`; solo renta `£1,200 pcm (premium not published)`; ninguno usa el fallback actual de cada superficie. Periodo anual usa p.a. Moneda EUR usa €. |
| D8 | `amount()` y filtros/comparables existentes no se convierten en una suma de componentes. Siguen usando el premium del negocio como base y omitiendo desconocidos; no introducir una falsa equivalencia con un alquiler mensual. Los nuevos costes y ratios se muestran en el panel; no se añaden a toPublic ni a otros endpoints públicos en este alcance. La renta de business ya está en la proyección pública y su etiqueta compuesta sí se corrige. |
| D9 | SEO y el título del navegador al navegar internamente comparten la etiqueta compuesta. En business con solo renta, no usar amount(p) != null para decidir si hay texto de precio: ese helper sigue devolviendo el premium desconocido. Para business con renta, omitir offers estructurado en JSON-LD para no presentar un total ficticio; conservar las ofertas actuales para sale/rent/business solo premium. No sumar importes ni cambiar canonicals, robots o privacidad. |
| D10 | Construcción en orden SPR-01 → PUB-06: primero integrar el campo disponible de SPR-01 y sus pruebas; PUB-06 lo reutiliza. Si no está integrado al empezar, no crear una segunda implementación de fecha: detener ese tramo y construir SPR-01 con su propia reserva. La planificación de PUB-06 no depende de esa integración. |
| D11 | Guardado con whitelist, checkPrice sobre fila fusionada, updated_at y eventos EST-18 atómicos. Nuevos importes/periodos/área aparecen en before/after; utilities_included, texto libre, aporta nombre de campo sin copiar su contenido al historial. Cambiar solo costes auxiliares/área/utilities/fecha no confirma disponibilidad; rent/premium/precio conservan la regla actual. |
| D12 | Importación property.txt y Drive mantiene su contrato; los campos no admitidos siguen avisándose como no importados. No ampliarla silenciosamente ni construir el asistente PUB-01. Los datos nuevos se introducen en el editor; ampliar importaciones es otro alcance. |

## Revisión grill-me

- **Cero/desconocido:** D1–D2; no sustituir null por 0 ni aplicar la frase actual `0 is never shown` a costes nuevos.
- **Dinero de periodos diferentes:** D5–D9; mostrar unidades, no sumar premium y renta ni publicar una cifra estructurada engañosa.
- **Cambio de moneda:** se conserva el comportamiento existente de Currency como edición de moneda, no conversión FX; hint `Changing currency does not convert amounts.` Los nuevos importes usan esa moneda y no se convierten automáticamente.
- **Superficie ajena a economía:** D4 incorpora solo el denominador imprescindible y fija su dueño compartido; no completa PUB-05 ni crea una dependencia de su familia completa.
- **Fecha duplicada:** D10 define orden y reutilización. En la base actual SPR-01 está planificada, no construida: no declarar este prerrequisito satisfecho.
- **Datos parciales:** ninguno de estos campos bloquea una ficha incompleta por sí mismo; si se declara un importe, moneda/periodo deben ser consistentes antes de guardarlo. Error 400 conserva borrador.
- **Concurrencia:** versión antigua →409 sin sobrescribir ni evento; fallo del evento revierte la escritura. Usar la sesión/CSRF y SQL parametrizado existentes.
- **Publicación/ley:** guardar costes no acredita documentos, cumplimiento, registro de depósito ni cobro. Es una ficha informativa, no un cálculo legal o financiero.

## Aceptación

| ID | Resultado verificable |
| --- | --- |
| A1 | Crear, modificar, recargar y borrar todos los campos nuevos; 0 distinto de desconocido; PUT parcial conserva los omitidos. |
| A2 | Números inválidos, negativos, más de 2 decimales, tipos incorrectos y periodo/moneda ausentes producen errores por campo sin escritura. |
| A3 | Premium y renta se editan juntos y se muestran sin sumarlos en panel/web; mensual/anual y GBP/EUR conservan sus unidades; filtros no cambian su base. |
| A4 | Ratios reproducen D6, se actualizan al editar precio/área y desaparecen si falta denominador; solo se calculan sobre superficie interior. |
| A5 | Migración preserva filas, eventos/notificaciones y FKs; auditoría registra costes/área, no copia utilities, y respeta no-op/409/rollback. |
| A6 | Fecha única de SPR-01 conservada; costes auxiliares no tocan confirmed_at; monedas/periodos no se inventan. |
| A7 | UI a 1280/390, teclado, foco, errores, Discard, borrador ante400/409 y zoom 200 %; etiquetas y copy en inglés. |
| A8 | Sin endpoints públicos nuevos para costes; título SEO y título del navegador coinciden también al navegar a un negocio con solo renta; SEO no publica total ficticio; importaciones y datos existentes conservados. |

## Alcance y puertas de ejecución

No pagos/cobros, cálculo legal de depósito, tasas automáticas, conversión de moneda, facturas, marketing nuevo, importador nuevo ni familia física completa. Las decisiones son propuestas técnicas listas para revisión; no quedan preguntas funcionales necesarias para escribir el plan. Antes de implementar: integrar SPR-01, revisar contrato compartido con PUB-05, reservar todos los paths, revisar el alcance y obtener build; no registrar esa transición durante este encargo.

[Plan de implementación](../plans/2026-11-08-pub-06-financial-fields.md) · [ledger](../plans/2026-11-08-pub-06-financial-fields-ledger.md).

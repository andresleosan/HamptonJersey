# Hampton App · Informe para el propietario

Fecha: 2026-10-25 · Estado: decisiones de Claude (Luis: «exacto sigamos con lo que podamos adelantar, vamos función a eso», sobre la propuesta del informe; antes delegó las decisiones) · Base: `main` en producción (`991b6c6`)
Parte de F3 en la arquitectura (`docs/roadmap/2026-10-23-arquitectura-hampton-app.md` §9 F3: «informe al propietario»). Donde este documento no dice nada, mandan los specs de F3-A, F3-C y F7-A.

## 1. Intención

Las ventas caen y Luis quiere empujar a vender. A un propietario le convence ver que su casa se mueve: cuánta gente la mira, cuántos la visitan, qué opinan y qué ofertas hay. Hoy la app ya guarda todo eso (`daily_stats`, `viewing_requests`, `matches`, `offers`, `sales`), pero nadie puede enseñarlo. El informe lo junta en una página imprimible por vivienda, que el equipo guarda como PDF y manda al propietario. También sirve para captar exclusivas: «así trabajamos su casa».

**Éxito (verificable):**
- Desde una ficha del panel, el botón **Owner report** abre el informe de esa vivienda para los últimos 7, 30 o 90 días (30 por defecto).
- Cada cifra sale de una consulta reproducible y se comprueba en pruebas con datos sembrados.
- El informe impreso no contiene ningún nombre, email ni teléfono de un aplicante, visitante o comprador.
- Se imprime limpio en A4 desde el navegador («Save as PDF»), como la liquidación de Rentals.

**No-objetivos:** mandarlo por email automáticamente cada semana (necesita servicio de correo: F3-B); comparar con otras viviendas o con el mercado (F1-B); días en el mercado (la ficha no guarda cuándo se publicó); guardar el informe o sus notas.

**Anti-objetivos:**
- Revelar quién es un interesado o un comprador (protege la comisión, P-15, y su privacidad).
- Cifras infladas o ambiguas: cada bloque dice qué cuenta y en qué periodo.
- Un informe vacío que da mala imagen: los bloques sin datos lo dicen con una frase neutra en vez de un cero suelto.

## 2. Decisiones (todas de Claude; revisables)

| # | Decisión | Por qué |
|---|---|---|
| O1 | **Dónde**: botón **Owner report** en el editor de la ficha (`ListingEditor.jsx`), que abre `#/listings/<id>/report?days=30`. Página propia del panel, imprimible como `Statement.jsx` (la barra, los botones y los selectores no salen al imprimir) | Mismo patrón que ya usa el equipo para la liquidación |
| O2 | **Periodo**: 7, 30 o 90 días que acaban hoy (fechas de Jersey, como Insights). El encabezado muestra las fechas exactas | Igual que Insights; los propietarios piensan en «el último mes» |
| O3 | **Encabezado**: «Hampton Estates», oficina y teléfono (los de la web), título y referencia de la ficha, precio tal como sale en la web (`price_text` o precio y periodo), estado (For sale, Under offer, Sold, To let…), periodo y fecha de preparación. Campo opcional **Prepared for** (texto que se teclea en pantalla, sale impreso, no se guarda) | La ficha no guarda el nombre del propietario |
| O4 | **Interés en la web**: visitas a la ficha, aperturas de la galería y del tour 3D en el periodo (`daily_stats`), con un gráfico de barras sencillo por día (7 días) o por semana (30 y 90 días) y una tabla equivalente para lectores de pantalla. Debajo, el total desde que se empezó a contar (primer día de `daily_stats` de esa ficha) | Es la prueba más visual de que la casa se mueve |
| O5 | **Visitas**: en el periodo (por `date`), cuántas se hicieron (`completed`), cuántas hay reservadas a partir de hoy (`requested` y `confirmed`), y cuántas se cancelaron o no se presentaron. Luego la lista de las visitas hechas en el periodo: fecha, resultado («Wants to proceed», «Wants more information», «Not interested») y la nota del resultado (`outcome_note`) | El feedback es lo que más valora un propietario |
| O6 | **Notas del feedback**: el interruptor **Include feedback notes** (activado por defecto) decide si las notas salen impresas; junto a él, el aviso «Notes print as written. Keep names out of them.» Nunca se imprime el nombre del visitante | Las notas son texto libre del equipo |
| O7 | **Demanda**: número de aplicantes activos cuya búsqueda encaja con la casa: `matches` en `found` o `shortlisted`, aplicante no archivado y en una etapa activa (no `lost` ni `completed`). De ellos, cuántos están en la lista corta. Solo números | Argumento de venta: «tenemos N compradores registrados que encajan» |
| O8 | **Ofertas** (solo fichas en venta): las ofertas abiertas y las hechas en el periodo, como «Offer 1, 2…» por orden de llegada: fecha, importe, estado y contraoferta si la hay. Nunca el comprador. Si hay una venta en curso: precio acordado, hitos hechos con su fecha y el siguiente hito | El propietario quiere ver ofertas y avance, no quién |
| O9 | **Notes from Hampton**: un cuadro de texto en pantalla para que el agente escriba su comentario («Suggest a price review…»); sale impreso y no se guarda | Da el toque personal sin otra tabla |
| O10 | **API**: `GET /admin/listings/:id/report?days=7|30|90` (solo admin) devuelve todo en un JSON, leído con un único `batch`. No hay migración | Una petición por informe; los índices existentes bastan (`daily_stats` por clave, `viewing_requests(listing_id, date)`, `matches_listing`, `offers_listing`) |
| O11 | **Fichas de alquiler**: el mismo informe sin los bloques de ofertas y venta | Las ofertas son solo de venta (F3-C) |
| O12 | **Textos** en inglés (D19). Diseño según `DESIGN.md`; gráfico con la guía de dataviz (barras con un solo color, ejes discretos, sin adornos) | |

## 3. Lo que decide quien construye

- El diseño exacto de la página y la hoja de impresión, siguiendo `DESIGN.md` y la liquidación.
- Las frases de los bloques vacíos.
- Si el gráfico es SVG en línea o barras con CSS.

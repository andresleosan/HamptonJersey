# PUB-17 · Aviso de salud de las fichas — plan de implementación

> **Actualización posterior:** el [plan revisado de tanda 7](2026-11-10-tanda7-pub-17-salud.md) prevalece sobre el contenido anterior incompatible.

> Implementación futura con `superpowers:executing-plans`. Este documento es planificación, no habilita cambios de producción.

**Objetivo:** ayudar al equipo a identificar fichas publicadas con muchas aperturas y pocas solicitudes de visita, sin atribuir una causa como certeza. **Arquitectura:** cálculo en la lectura autenticada de Insights sobre contadores y solicitudes existentes; resultado visible en el panel, sin generar tareas repetidas ni recopilar datos nuevos. **Stack:** Cloudflare Workers, D1, React y pruebas Node. **Base examinada:** `f0d8eb73905e32b3f283c180cfc12f9149a3cb93`; revalidar la base al construir.

## Decisión de producto aplicable y límites

En la sección Insights se mostrará el aviso «Listings to review» con cada ficha publicada y no archivada que tenga **al menos 30 aperturas y como máximo una solicitud de visita** durante los últimos 30 días naturales de Jersey, incluido hoy. Es un umbral inicial de trabajo explícito, no un diagnóstico ni una medición de visitantes únicos. Mostrar ambas cifras, las fechas y la sugerencia «Consider reviewing the photos and price». No sugerir que el precio es público ni cambiarlo. No tomar aperturas de galería o tours como aperturas de ficha. Las solicitudes se cuentan de cualquier origen, como el informe existente, y no equivalen a todas las consultas posibles; indicarlo en la interfaz. Esta decisión se puede ajustar posteriormente con datos reales sin impedir la construcción.

La regla siempre usa 30 días, independientemente del selector de 7/30/90 días del resto de Insights. Solo mostrar datos registrados; la primera vista guardada no demuestra cuándo empezó la medición ni la cobertura completa del periodo. Mostrar esa fecha como primera vista registrada y evitar afirmar que no hubo vistas anteriormente. Las fichas sin vistas o por debajo del umbral no aparecen. No lanzar alertas de Inbox ni correos ni realizar cambios en una ficha.

## Diseño y revisión

Reutilizar `admin/src/Insights.jsx`, componentes y CSS existentes: Montserrat 14 px/1.5, Tenor Sans para títulos, tinta `#141414`, fondo `#fff`, borde `#e2ddd4`, secundario `#6b665e`, tarjeta radio 14 px. Tabla con encabezados, región desplazable y accesible, enlace de ficha, texto que explica umbral y periodo, estados vacío/carga/error y foco visible; comprobar escritorio 1280, móvil 390 y zoom 200 %. `impeccable` guía legibilidad, `frontend-security-coder` y `security-best-practices` protegen sesiones y salida, `web-performance-optimization` limita consultas, `ponytail` reutiliza el informe existente; `antislop` exige lenguaje claro. No se añaden librerías ni peticiones externas.

## 1 · Regla y consulta acotada

**Archivos:** `server/insights.js`, `server/routes/insights.js`, `tests/server/insights.test.mjs`.

- [ ] Añadir pruebas de API con datos sintéticos para 29/30 vistas, 0/1/2 solicitudes, fichas no publicadas o archivadas, varias fichas y días límite. Probar también dos solicitudes con fecha anterior/posterior y entradas de galería/tour que no incrementan vistas.
- [ ] Calcular `healthFrom = plusDays(jerseyToday(), -29)`, `healthTo = jerseyToday()`, `start = jerseyDayStart(healthFrom)` y `end = jerseyDayStart(plusDays(healthTo, 1))`. Sumar `daily_stats.n` solo para `metric='view'` y `day BETWEEN healthFrom AND healthTo`; contar solicitudes `viewing_requests.created_at >= start AND created_at < end` por ficha, de todos los orígenes y estados. Consultar todas las fichas elegibles, no solamente las diez filas de `VIEWED`; evitar multiplicar vistas al hacer joins con solicitudes usando agrupación y subconsulta o CTE separado. Usar el filtro vigente de publicación/archivo de la ficha y `ORDER BY views DESC, listing_id ASC`; no introducir límite silencioso.
- [ ] Agregar al JSON de `GET /admin/insights` una propiedad `listing_health: {from, to, first_day, rows}`; cada fila `{listing_id,title,views,viewing_requests}`. `first_day` es el primer día global registrado en `daily_stats` con `metric='view'`, o `null`; no inferir inicio de medición ni antigüedad individual. Probar sesión ausente 401, ausencia de información personal y consistencia para selectores 7/30/90. Mantener las propiedades previas y no cambiar su semántica.
- [ ] Ejecutar `node --test tests/server/insights.test.mjs`; comprobar también cambio de hora de Jersey y cruce de año con fechas locales sintéticas, frontera exclusiva y rendimiento en datos representativos. No fijar un número de migración porque no se requiere migración.

## 2 · Panel y entrega

**Archivos:** `admin/src/Insights.jsx`, estilos existentes si son necesarios, pruebas de panel y `docs/roadmap/ESTADO.md` / checklist al construir.

- [ ] Incorporar sección `Listings to review` con periodo fijo, regla comprensible, aclaración de fuentes y frase orientativa. Enlazar ficha con la misma ruta de la tabla existente (`#/p/<id>` codificado); mostrar ID, nombre y ambas cifras. Si `first_day` es posterior al inicio mostrar `First recorded view: <date>; earlier coverage is unknown.`; si es nulo, indicar que aún no hay vistas registradas. Con cero filas mostrar `No listings currently meet this rule.` No presentar el aviso como prueba de baja demanda.
- [ ] Verificar actualizaciones por cambios de datos y selector, acceso sin sesión, lista larga, vacío, fallos y recuperación, teclado, foco, 1280/390 y zoom 200 %. Ejecutar `npm test`, `npm run build`, `npm run check:release` y e2e aplicable con datos locales. Registrar resultados reales y revisar el diff; actualizar checklist solo tras construir y validar.

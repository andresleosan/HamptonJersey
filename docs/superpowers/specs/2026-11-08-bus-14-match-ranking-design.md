# BUS-14 · Orden explicable y conservación de candidatas

Fecha: 8-nov-2026. Lista 1. Diseño aprobado por Luis en esta conversación: «Si, todo bien, sigue». Solo planificación. Este documento exporta la propuesta aprobada y sus precisiones técnicas; no registra reserva, construcción, migración ni publicación.

## Propósito y alcance aprobado

Conservar todas las candidatas pertinentes del inventario residencial actual, sin el mínimo de 35 puntos ni el máximo de 25 almacenadas. Mostrar 25 por página. Ordenar primero imprescindibles cumplidos, después pendientes de comprobar y finalmente alternativas con incumplimientos conocidos; puntuación de preferencias dentro de cada grupo y desempate estable. Quitar los 10 puntos por publicación en la web de Hampton. Conservar decisiones humanas: Rejected no reaparece; Shortlisted conserva su estado y actualiza comprobaciones.

Fuera del alcance: nuevas fuentes, motor comercial, confirmación de disponibilidad, consultas automáticas, clasificación legal nueva y ranking posterior del día 21 de BUS-17. Cumplir imprescindibles según datos disponibles nunca equivale a disponibilidad confirmada.

## Enfoque elegido

Continuar el motor, persistencia y Review existentes, retirando los descartes por score/tope y añadiendo paginación real. Mantener el top 25 descartaría opciones; crear otro motor, servicio o cola no se justifica para el inventario actual. No se añaden dependencias ni infraestructura.

## Decisiones concretas del constructor

- La puntuación pasa a un máximo natural de 90. No se normaliza ni se presenta como porcentaje de cumplimiento.
- Mantener filtros de operación, inventario residencial y exclusiones. archived_at IS NOT NULL excluye nuevas propuestas; Shortlisted se conserva para mostrar sus comprobaciones actuales aunque deje de ser candidata.
- Orden persistido común: requirements_rank ASC, score DESC, listing_id COLLATE BINARY ASC, id ASC. Ninguna página se reordena después en JavaScript.
- GET autenticado /admin/applicants/:id/matches?status=found|shortlisted|rejected&after=<cursor>. LIMIT 26, entregar 25, cursor desde la última entregada. Respuesta: {matches, counts, next, revision, rankingVersion}.
- Cursor versionado, ligado a búsqueda/estado/revisión/última clave. Validación estricta de tipos, longitud máxima 1024 y campos permitidos. Error 400 por formato o pertenencia incorrecta; 409 por revisión antigua. No contiene datos personales ni concede autorización.
- Leer revisión, contadores y página en el mismo DB.batch. matchCard conserva score/rango guardados y puede señalar requirements_refresh_needed al comprobar datos actuales.
- Añadir matches_revision y match_ranking_version a applicants. Triggers de cambios relevantes de matches incrementan revisión sin cambiar applicants.updated_at. Requisitos, cierre y reapertura también invalidan páginas. Solo full recompute válido marca versión 1 en su transacción.
- Versión 0: indicar orden anterior y recálculo pendiente, sin presentar score como actual. Rejected sigue siendo histórico aunque la búsqueda pase a versión 1. Búsquedas cerradas preservan historial. GET no escribe.
- Recálculo por vivienda solo modifica parejas afectadas, sin consultar otros Found para competir por un cupo. Mantener guard de versión de búsqueda y añadir guard de versión de vivienda evaluada.
- Eventos: contar incorporaciones efectivas en SQL dentro de la transacción. Insertar applicant.matched solo si hay parejas realmente ausentes; crear aviso inmediatamente condicionado al resultado y sincronizar título final. Comprobar changes() con triggers. El valor created devuelto procede de inserciones efectivas, no de una previsión en JavaScript.
- Detalle devuelve contadores en lugar de todas las tarjetas. Timeline obtiene títulos por las referencias de sus eventos, independientemente de páginas cargadas. Navegar/revisar no pierde formulario sin guardar. Respuestas HTTP antiguas se descartan.
- Adaptación mínima de Widen: consultas globales independientes de la página; contar mejoras pending/alternative a meets y nuevas candidatas que pasarían a meets. Excluir Rejected, Shortlisted y ya meets; diferenciar mejora de pareja existente de nueva vivienda. Live>=3 cuenta meets todavía ofrecidas. Sin prioridades válidas, pedir confirmación y no prometer mejoras.

## Diseño y seguridad

Usar DESIGN.md vigente del panel, sin rediseño general: Tenor Sans/Georgia/serif H1 26px y H2 19px, peso 400; Montserrat/system-ui cuerpo 14px/1.5 y etiquetas 12px. Ink #151515, paper #ffffff, mist #f4f3f0, line #e3e0da, stone #6b665e, bronze #a56b3d, bronze-dk #86542d, ok #2f6b4f, err #a32020, warn-bg #fff6e5 y field-line #8f8a82. Texto bronce pequeño usa bronze-dk. Contenedor1240px, página24px 16px 120px, tarjetas radio14/padding24, espacios nuevos8/12/16/24. Foco2px/offset2px; paginación nueva mínimo44px de alto. Estados con texto; status/alert junto a acción. Loading textual, vacío con causa, recuperación por 409 y error con reintento. Verificar1280/390 y zoom200%, sin overflow. No nuevas fuentes, librerías, imágenes, animaciones, toasts ni estadísticas decorativas.

Autenticación y same-origin existentes; SQL parametrizado, status permitido y validación autoritativa del cursor. Renderizado escapado de React. No datos personales en cursor, almacenamiento del navegador o logs nuevos. No cambios de controles, credenciales o servicios.

## Revisión y aceptación

Builder check independiente de solo lectura: propuesta implementable con estas precisiones; no quedan decisiones de producto imprescindibles. La revisión del plan no es revisión de código futuro ni ejecución de pruebas.

Aceptación principal:60 candidatas en almacenamiento, incluso con score<35; páginas25/25/10 sin pérdidas ni duplicados; publicado y no publicado iguales en score; decisiones humanas conservadas; cursor invalidado ante cambios; Timeline y Widen independientes de la página; un solo evento y aviso efectivo ante recálculos concurrentes. Plan detallado y pruebas en el documento asociado.

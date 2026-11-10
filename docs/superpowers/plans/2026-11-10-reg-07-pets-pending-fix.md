# REG-07 · Mascotas sin respuesta no son compatibilidad confirmada

## Alcance y causa

Corrección del criterio ya existente de REG-07/REG-08, no un diseño de producto nuevo. Con prioridades versionadas, el panel admite omitir mascotas; `requirementChecks` omite el criterio porque no tiene respuesta y `requirementsSummary` puede devolver `meets`, aunque la propiedad no acepte mascotas. La tarjeta entonces muestra «Stated must-haves met» sin una comprobación de mascotas. Una respuesta explícita desconocida y prioridad preferred puede producir el mismo resultado.

## Comportamiento comprobable

- Para búsqueda residencial con prioridades versionadas, una respuesta de mascotas omitida o desconocida produce comprobación `unknown` y estado `pending`, sin inventar que el hogar tiene o no tiene mascotas. Las búsquedas legacy ya conservan estado pendiente sin inventar prioridades.
- Una respuesta explícita «no pets» sigue siendo válida y no se convierte en pendiente; un hogar que tiene mascotas frente a una prohibición permanece como alternativa, incluso con prioridad preferred. Una condición del anunciante que no permite confirmar la compatibilidad queda pendiente.
- El recálculo existente guarda el nuevo orden sin borrar Shortlist/Rejected ni la respuesta del hogar. Una tarjeta antigua se reevalúa y ofrece el botón de recálculo si detecta que su ranking persistido ha quedado obsoleto. Las sugerencias de ampliación se calculan con requisitos actuales, no con rangos anteriores. No se hace recálculo masivo automático ni se toca producción.
- La evidencia de características ilegible no confirma condiciones; si otros datos históricos impiden comparar, Widen informa de que no está disponible sin convertir exclusiones en listas vacías. Si una edición invalida el batch protegido del recálculo, la API devuelve 409 y el panel conserva el error y el foco para reintentar.

## Archivos y pruebas

1. Reproducir primero RED con `tests/server/requirements-matching.test.mjs`; cubrir dato omitido y Not sure, ausencia de mascotas confirmada y mascota declarada con prohibición. Incluir un caso de ruta/persistencia en las pruebas existentes de requirements.
2. Corregir el tratamiento del check y el resumen en `server/requirements.js`; adaptar `server/routes/applicants.js` para evaluar el estado actual de las coincidencias en Widen, y `admin/src/ApplicantMatches.jsx` para ofrecer el recálculo cuando una tarjeta cargada lo requiera. Cubrir rangos persistidos previos, recomendación antes/después de recalcular, Shortlist y la instantánea de Rejected tras recálculos de búsqueda y propiedad. Repetir pruebas focales, suite completa, build y check:release.
3. Como el cambio afecta a la etiqueta existente del panel, comprobar flujo local de Matches en escritorio 1280 y móvil 390, errores, foco y zoom mediante el navegador disponible y Playwright MCP si arranca; documentar cualquier límite sin desactivar su sandbox.
4. Mantener REG-07 parcial hasta revisar la entrega, completar la validación en navegador real y aprobar/publicar su commit. No hay migración nueva.

## Diseño, seguridad y rendimiento

Se reutiliza el componente existente `MatchCard`: etiquetas «Requirements to confirm» y «Unknown», sin cambiar su estructura, colores o tipografía. En el panel vigente: ink `#151515`, mist `#f4f3f0`, bronze `#a56b3d`, error `#a32020`, Montserrat 14px/1.5, Tenor Sans para encabezados; foco de 2px y responsivo existente. DESIGN.md distingue esos valores vigentes de las propuestas; no hay componentes ni tokens nuevos. Comprobar ancho 1280/390 y zoom 200%.

El servidor sigue calculando los estados con los datos autorizados existentes; no se añaden entradas, datos personales, registros, redes ni consultas. Widen reevalúa las coincidencias abiertas usando las fichas que ya carga para que el contador no dependa de rangos obsoletos; el coste adicional es lineal en esas coincidencias y se comprueba con fixtures representativos. Depuración sistemática identifica causa, TDD verifica RED→GREEN, ponytail limita el cambio y security-best-practices conserva las fronteras existentes. Impeccable, taste/redesign y antislop no requieren cambios visuales nuevos; la revisión se centra en la claridad del estado existente. No se añaden librerías.

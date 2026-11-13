# BUS-12 · Base desconectada de revisión de criterios

Fecha: 13-nov-2026. Base de trabajo `dcebce512a044e6d4f9caec00c0746803718d2dd`. El main avanzó después; esta unidad debe integrarse sobre el SHA más reciente con revisión del diff y sus dependencias. BUS-12 sigue **parcial**.

## Qué se ha preparado

- `server/search-criteria.js` lee una instantánea interna por ID de búsqueda, con revisión, estado, categoría, operación efectiva y estado de archivo. No consulta contactos, no cambia la búsqueda y no está conectado a rutas. Lee desde la sesión primaria cuando está disponible. Sin columna `criteria_revision` falla cerrado; no finge revisión cero.
- `criteria-revision.proposed.sql` es una **propuesta**, fuera de `migrations/`, sin ordinal reservado y ensayada solamente con datos ficticios. Añade una revisión para cambios de criterios y un trigger de actualización. Cero es el punto de partida para filas previas y nuevas, no una reconstrucción de su historial. La revisión se incrementa una vez por una actualización que cambie uno o más campos vigilados; guardar los mismos valores, cambiar etapa, estado de búsqueda o archivar no la incrementa.
- El lector conserva los JSON como valores almacenados, incluido `null`. No convierte prioridades antiguas desconocidas a flexibles y preserva tanto `preferred` como `must` explícitos; tampoco interpreta cero como desconocido. La selección inicial de parking en formularios sigue siendo responsabilidad de los formularios existentes.

El inventario de criterios incluye modalidad y categoría; presupuesto y preferencias de inmueble; zona, mascotas y hogar, incluidas edades y su fecha; necesidades libres; y términos comerciales originales con período y unidad. `viewing_availability` pertenece al contrato de franjas de visita; idioma preferido, asignación, contacto, etapa, archivo y estado no son criterios de matching. El estado y el archivo se leen por separado porque una revisión de criterios intacta **no** demuestra que la búsqueda siga disponible o autorizada. Una futura integración deberá revalidar ambas cosas junto con identidad, permisos, borrado y revisión en la misma transacción del efecto.

La propuesta compara el contenido de objetos de prioridades ignorando orden de claves y espacios; ante claves duplicadas compara el texto de forma conservadora para no ocultar un cambio de interpretación. El orden de arrays y el texto de las otras columnas JSON todavía se tratan como materiales: una serialización equivalente podría invalidar de más. Es un límite de la propuesta que debe revisarse con los escritores antes de adoptarla; no justifica inferir equivalencia entre declaraciones distintas.

## Escritores y pendientes reales

El editor de `server/routes/applicants.js` usa el bloqueo existente por `updated_at`, no el nuevo número de criterios. El registro público crea búsquedas; una presentación repetida conserva las existentes y registra una solicitud para revisión. Los cambios de etapa, archivo y ciclo de vida tienen sus propios escritores. Los futuros consumidores AUT-19/REG-13 y el recálculo BUS-12 deben integrar el contrato de revisión, ámbito y autorización sin reemplazar controles existentes.

**No está resuelto el CAS operativo por `criteria_revision`.** La sentencia condicional usada para ensayar una carrera en D1 aparece exclusivamente en el test; ninguna ruta nueva la expone ni se ha conectado a un escritor. Antes de activar se requiere elegir el ordinal libre sobre main, revisar el estado remoto y el impacto en esquemas poblados y triggers, implementar y revisar el CAS transaccional en cada escritor/consumidor pertinente, y comprobar revocación, borrado, efectos/eventos y regresiones. La guarda propuesta impide resetear o retroceder la revisión, pero no sustituye una lista permitida de campos ni autoriza a los escritores a modificarla directamente.

En D1 local, una modificación directa de una fila que antes devolvía `meta.changes = 1` devolvió 2 al sumarse la escritura del trigger propuesto; `SELECT changes()` en el mismo batch siguió dando 1. La edición de presupuesto también interactúa con triggers existentes. Antes de cualquier migración hay que revisar los consumidores que comparan estrictamente `meta.changes` y su composición con eventos/recalculo, sin asumir que un contador igual a 1 identifica una única fila directa.

## Verificación local

- `node --test tests/server/search-criteria.test.mjs`: revisión y datos desconocidos, una revisión por cambio, campos residenciales/comerciales/hogar, no-op, estado y archivo, preferencias explícitas e históricas, JSON ambiguo, rollback y rechazo del guardado obsoleto de la ruta existente.
- `node --test tests/server/search-criteria-d1.test.mjs`: todas las migraciones de la copia y SQL propuesto aplicados únicamente a D1/Miniflare local; preservación de fila previa y FK, carrera de dos escrituras condicionales **de prueba**, rollback, y dos solicitudes concurrentes a la ruta existente (200/409 y un evento) usando su control por `updated_at`.
- Suite completa local: 1.547 pruebas Node y 25 Python aprobadas. La aserción adicional de concurrencia de la ruta en D1 se ejecutó después mediante su prueba focal. `npm run build` y `npm run check:release` pasaron; la compilación conserva el aviso de tamaño de un chunk del panel.
- Playwright: no aplica; no hay cambios de interfaz. No se han consultado cuentas, D1 remoto ni producción; no se ha publicado, activado una ruta ni aplicado una migración remota. Revisión independiente pendiente.

## Ruling

La migración no se integra en esta entrega porque su estado remoto es desconocido y el encargo exige una base segura y desconectada. Coste: ninguna protección nueva de concurrencia está operativa hasta que se verifiquen e integren esquema y escritores; quienes dependan de la revisión deben permanecer cerrados.

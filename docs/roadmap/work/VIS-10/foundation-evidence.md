# VIS-10 · Base local de reglas de visita

Fecha: 2026-11-13. Base de construcción: `a78ca4fc76d1714e8206f5e3c66503a6fe978336`. VIS-10 queda **parcial**: esta unidad es una base desconectada, no una integración de reservas ni una activación.

## Alcance y decisiones

- `server/property-viewing-rules.js` valida el aviso configurado entre 0 y 168 horas, una lista explícita de identificadores de negociadores, una referencia sintáctica restringida de llavero y texto privado de hasta 2.000 caracteres. La validación de referencia **no acredita** identidad, llave, autorización ni consentimiento. Los datos que faltan o no se conocen no se convierten en hechos.
- La evaluación compara instantes UTC completos y devuelve solo estados y motivos, sin instrucciones ni referencias privadas. Incluso con todas las condiciones satisfechas, el resultado exige revisión de acceso humano. El aviso mínimo se aplica conservadoramente a las condiciones evaluadas; no acredita que se haya avisado a nadie ni establece una obligación legal general de 24 horas.
- La migración provisional `0051_property_viewing_rules.sql` define únicamente ámbito de ficha existente y operación, versión, aviso y lista de negociadores. No almacena instrucciones, referencias de llaves, nombres, contactos ni consentimientos. La baja de un inmueble borra sus reglas asociadas; cambiar su operación o archivarlo revoca la regla para impedir que se reanude al volver al estado anterior. Una lista modificada o un cambio de actividad del negociador avanza la revisión. Los identificadores de reglas se reservan para impedir que una versión obsoleta reaparezca por borrado y recreación; antes de activar se debe revisar su asignación aleatoria y retención, pues el esquema no crea un asignador.
- La precondición SQL vinculada comprueba reglas y revisión actuales, operación, estado de la ficha, negociador activo, pertenencia a la lista y aviso con el reloj de D1. **No es una autorización de reserva**: el dueño de la mutación debe combinarla en la misma transacción con sus demás guardas y enlazar los mismos valores que va a escribir. La función no se importa desde rutas ni se utiliza en los flujos actuales.
- Resolución de alcance: BUS-10 aún no acredita una propiedad física compartida ni su enlace con operaciones; se restringe esta base a la ficha propia y su operación exacta, sin extenderla por dirección o identidad inferida. Conectar la política a BUS-10 requiere resolver su transición de ámbito y evitar herencia entre casos.
- Resolución de seguridad: ADM-18 todavía no concede acceso por inmueble para este propósito, y no existe un productor integrado de evidencia de acceso acreditada. Por ello no se implementan escrituras ni lecturas privadas, API, editor, avisos al inquilino o creación automática de tareas. Ningún acceso se concede por estar en `admins` o por ser negociador activo.

## Pendiente para completar VIS-10

1. Definir y comprobar autoridad de lectura/escritura por inmueble, actor y operación; enlazarla con identidad y versión de sesión y revalidarla en el mismo batch. Definir retención y auditoría sin filtrar instrucciones, antes de guardar o mostrar texto y referencias privadas.
2. Integrar BUS-10, EST-16, VIS-09/18 y el dueño de reservas. Distinguir ocupación desconocida, ocupación acreditada y prueba válida/revocable de acceso. El aviso y la tarea manual requieren evidencia de su ejecución; no se ha contactado a ningún inquilino.
3. Añadir el editor y sus pruebas de interfaz aisladas; asegurar que web pública, formularios, correo, calendario y eventos no reciben notas privadas. Coordinar VIS-17 antes de habilitar consumidores externos y AUT-17 antes de cualquier aviso automático.
4. Verificar el estado remoto de migraciones, completar pruebas de integración y decidir la activación por separado. Una revisión independiente local ya detectó el problema de identidad corregido abajo. Esta migración solo se ha probado localmente; el estado remoto no está verificado y no se ha aplicado ninguna migración remota.

## Verificación local

- TDD de validación y precondición: los tests nuevos fallaron inicialmente por módulo o exportación ausentes y luego pasaron con fixtures sintéticos.
- D1 local con Miniflare: ámbito/operación, negociador activo y autorizado, avisos, cambio de revisión, concurrencia optimista, revocación dentro del batch, rollback de un fallo posterior, archivo, borrado y claves foráneas. Esto no verifica los permisos de staff ni una reserva integrada.
- Playwright: no aplica; no se ha modificado interfaz.
- `npm test`: 1.413 pruebas JavaScript y 25 de Python aprobadas tras el último cambio de esquema. La línea de evidencia inválida del manifiesto corresponde a un caso negativo de la suite, que terminó en OK.
- `npm run build`, `npm run check:release` y `npm run team:check`: aprobados en la copia aislada. Build conserva el aviso de tamaño de chunks.

## Corrección de revisión independiente · 2026-11-13

La revisión encontró que SQLite permite un `TEXT PRIMARY KEY` nulo y que `<>` no detecta cambios con `NULL`. Con ello, una regla podía pasar de A a `NULL` y a una identidad B previamente borrada, recuperando también la revisión de una precondición antigua. Una prueba sintética de D1 reprodujo el caso completo y falló antes de la corrección. La identidad se declara ahora `NOT NULL`, y la comprobación de identidad, ámbito y revisión usa `IS NOT` para tratar `NULL` como cambio. Las seis pruebas focales, incluida la reproducción y la prueba D1 de concurrencia y rollback, pasaron después de la corrección. No se ha aplicado la migración ni se han conectado permisos o rutas.

La integración local ensaya la secuencia 0048, 0049, 0050 y 0051; no verifica el estado de D1 remoto.

Verificación de la copia integrada: `npm test` aprobó 1.468 pruebas JavaScript y 25 Python; build, `check:release`, `team:check` y `check:packages` aprobaron. La prueba DOM de REG-06 se repitió con autorización explícita tras comprobar que usa JSDOM/Vite sin Chromium y pasó 1/1. Playwright no aplica a este cambio sin interfaz.

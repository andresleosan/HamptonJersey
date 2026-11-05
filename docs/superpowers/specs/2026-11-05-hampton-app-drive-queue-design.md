# Hampton App · Properties Queue: crear y publicar una propiedad desde una carpeta de Google Drive (PUB-21)

Fecha: 2026-11-05 · Estado: borrador para que Luis lo apruebe · Base: `main` (`eca54f1`, con el commit de Applicants `1719677` aún sin push)
Checklist PUB-21. Construye sobre PUB-01 (importación desde una carpeta del ordenador, spec 2026-11-03) y AUT-13 (Hermes, spec 2026-10-31).

## 1. Intención

Las casas de Hampton están en el Google Drive de `francopropertiesjersey@gmail.com`: una carpeta por casa, dentro de una carpeta madre, con fotos, Word y PDF. Hoy pasar una casa a la web es copiar a mano los datos de esos documentos, descargar las fotos y subirlas.

Con esta función, alguien del equipo pega en /admin el link de la carpeta de una casa y una nota con indicaciones («el precio bueno es el del Word», «son 4 habitaciones»). La casa entra en una cola, **Properties Queue**. Hermes lee los documentos, escribe la ficha y devuelve una propuesta. El equipo la revisa en el editor de siempre y pulsa **«Approve and publish»**: la ficha sale en la web y deja la cola.

Por qué: hay muchas casas ya en Drive y el equipo no debería teclear lo que ya está escrito. La nota existe porque los documentos se contradicen (ejemplo real, «27 Westpark Avenue Property Details.docx»: «más de £37.000 al año» y «£54.600 brutos al año»).

**Éxito (verificable):**
- Pegar un link de carpeta y una nota crea una fila en Properties Queue en «Waiting for Hermes» sin esperar a nada más.
- Hermes devuelve una propuesta: los campos de `property.txt`, un resumen y una descripción nuevos, la lista de fotos de «Edited» y de qué documento salió cada dato.
- Al abrir la fila, la app crea el borrador con esos datos (validados como en PUB-01) y sube las fotos de «Edited» reducidas y sin GPS, y abre el editor.
- «Approve and publish» publica la ficha solo si tiene el mínimo (§2, D11) y la saca de la cola.
- La carpeta de prueba es «27 Westpark Avenue» (id de Drive en el chat del 5-nov, no en el repositorio): 12 PNG en «Edited», un Word, «Records» y otras subcarpetas que no deben usarse.

**No-objetivos:**
- Actualizar una ficha que ya existe desde su carpeta (solo se crean fichas nuevas).
- Importar varias carpetas de una vez (se pegan una a una; la cola sí admite muchas).
- Recorrer el Drive buscando casas: la app solo abre la carpeta cuyo link se pega.
- Fotos de dentro de los documentos, vídeos, 360, PDFs como documentos de la ficha (PUB-11).
- Avisar en el canal del equipo cuando una fila está lista (se puede añadir después al avisador).
- La importación desde el ordenador (PUB-01) no cambia y sigue en «Add new property».

**Anti-objetivos (sería un fracaso aunque funcione):**
- Que algo salga en la web sin que una persona pulse «Approve and publish».
- Que la ficha publicada lleve datos de personas (propietario, inquilinos, teléfonos, emails) sacados de los documentos.
- Que la clave de Google acabe en GitHub o que la app pueda escribir o borrar en Drive.
- Que se use una foto de fuera de la carpeta «Edited» o algo de «Records».

## 2. Decisiones de Luis (5-nov-2026, en el chat)

| # | Decisión |
|---|---|
| D1 | **Origen:** el Drive de `francopropertiesjersey@gmail.com`. Se pega el link de la carpeta de una casa, y una **nota** con indicaciones u observaciones para la ficha y la base de datos. |
| D2 | **La lectura con IA la hace Hermes, en el VPS**, por su cola de trabajos (P-18, §6.6). Esto amplía H9 (spec 2026-10-31): Hermes ya no recibe solo fichas publicadas, también los documentos de la carpeta que el equipo manda. Luis limpia la carpeta antes de pasarla. Hermes nunca devuelve nombres, teléfonos, emails ni direcciones de personas, y la app avisa como hoy si el texto parece llevar un email o un teléfono. |
| D3 | **Datos:** los 20 campos de `property.txt` (`server/listing-import.js`, `FIELDS`). Lo que Hermes no encuentre o no sea válido queda vacío. |
| D4 | **Descripción nueva:** Hermes escribe resumen y descripción nuevos, en inglés, con los mejores detalles de todos los documentos y de la nota, solo con hechos que estén allí. |
| D5 | **Fotos:** solo las de la subcarpeta cuyo nombre lleve «Edited» o «Editadas» («Edited Photos», «Fotos editadas»), sin importar mayúsculas. Se ignoran las fotos sueltas, las de otras subcarpetas y las de dentro de los documentos. |
| D6 | **Sin carpeta Edited o con varias:** manda la nota. Si la nota no dice nada: sin ninguna, la propuesta sigue sin fotos con un aviso visible; con varias, entra la modificada más recientemente y el aviso dice cuál. |
| D7 | **«Records»** (cualquier carpeta con ese nombre, a cualquier profundidad) se ignora entera: ni Hermes ni la app la abren. |
| D8 | **Documentos:** Hermes lee cualquier documento de la carpeta y sus subcarpetas (Word, PDF, Google Docs, hojas, texto), salvo Records y las carpetas de fotos. Luis limpia la carpeta antes. |
| D9 | **La app recuerda de qué carpeta salió cada ficha.** Si se pega una carpeta ya importada (o ya en la cola), avisa con la referencia y un enlace, sin bloquear. |
| D10 | **Quién:** todo el que entra en /admin puede mandar carpetas, revisar y aprobar. La app solo ve lo que Franco comparte con su cuenta de servicio (D13). |
| D11 | **Properties Queue** es una sección del panel (no de la web pública) con todas las casas en proceso hasta que se aprueban. **Aprobar publica sola la ficha en la web.** El botón exige: título, venta o alquiler, precio (o «Price on application»), parroquia, al menos una foto y la descripción. Lo demás avisa pero no bloquea. Después se puede despublicar como hoy. |
| D12 | **Conflictos entre documentos:** manda la nota; si no dice nada, el documento modificado más recientemente; el dato se marca «conflicting» en la propuesta con los dos valores y sus documentos. |
| D14 | **Título = nombre de la carpeta, tal cual** (por lo general es el nombre de referencia de la casa, p. ej. «27 Westpark Avenue»). Quien revisa lo puede cambiar antes de publicar. La dirección de la casa puede ir en Road y Location; D2 se refiere a datos de personas, no a la casa. |
| D13 | **Acceso a Drive con una cuenta de servicio de Google** en el proyecto de Google Cloud de Luis (el del inicio de sesión del panel). Franco comparte con ella, **solo como lector**, la carpeta madre de las casas, una vez. Su clave vive solo como secreto de Cloudflare. |

## 3. Decisiones de Claude (Luis puede cambiarlas)

| # | Decisión | Por qué |
|---|---|---|
| C1 | **La clave de Google solo la tiene el Worker.** Hermes no habla con Drive: pide a la app, con su `HERMES_KEY`, la lista de documentos de su trabajo y el contenido de cada uno. La app recorre la carpeta (sin Records ni carpetas de fotos) y solo sirve archivos de esa carpeta. | Un solo sitio para la clave; Hermes solo ve lo de su trabajo; su VPS no gana salida nueva a internet (el proxy `squid` no cambia). |
| C2 | **Hermes devuelve un `property.txt`** (texto con el formato de la plantilla) más la descripción, las fuentes de cada campo y los conflictos. La app lo pasa por `parseProperty` de PUB-01. | Reutiliza la validación, los avisos y el aviso de email/teléfono que ya existen; Hermes no inventa formatos. |
| C3 | **Las fotos las elige la app, no Hermes:** las de la carpeta Edited (D5/D6), en orden de nombre, primera = portada, «floor plan» / «aerial» en el nombre como en PUB-01. Máximo 100. Si la nota dice otra carpeta Edited, Hermes lo indica en su respuesta (`photos_folder`) y la app usa esa, siempre que sea una subcarpeta Edited de la misma carpeta. | Una regla exacta no necesita IA; la nota solo elige entre carpetas Edited. |
| C4 | **El borrador se crea al abrir una fila «Ready to review»** en el navegador: igual que PUB-01, el navegador descarga cada foto a través de la app, la reduce (`admin/src/image.js`, 1600 px, sin GPS) y la sube. Las HEIC se piden a Drive ya convertidas (miniatura grande de Drive) o se saltan con aviso si Drive no la da. | Las fotos pasan por el mismo camino probado; el Worker no procesa imágenes. |
| C5 | **Estados de una fila:** Waiting for Hermes (en cola o leyendo) → Ready to review → In review (borrador creado, enlace al editor) → Published (sale de la vista principal) · Discarded · Failed (motivo y «Try again»). | Mismo modelo que los trabajos de Hermes (queued/working/draft/used/discarded/failed). |
| C6 | **Tiempo:** el reloj empieza cuando Hermes toma el trabajo, no al crear la fila. Si no devuelve la propuesta en 15 minutos (3 intentos de 5), Failed. Una fila en cola espera sin límite; si el reloj de Hermes lleva más de 30 minutos sin preguntar (AUT-01), la fila lo dice. | Si el VPS está caído, nada falla sin haberse leído. |
| C7 | **Discard** borra el borrador (si se creó) con sus fotos. Las filas terminadas desaparecen con el borrado de trabajos de Hermes de más de 90 días. | Nada sin publicar se queda colgado. |
| C8 | **Una ficha creada desde la cola no se publica con el Publish normal** mientras esté en la cola: el editor enseña «Approve and publish», que aplica D11 y cierra la fila. | Un solo camino a la web desde la cola. |
| C9 | **La nota** se guarda con la fila (máx. 2.000 caracteres) y solo la ven el panel y Hermes. | Es interna. |
| C11 | **Properties Queue no usa la lista de redactores** (bf3e7a9): por D10 la ve y la usa todo el panel. Si se reutiliza `jobs`, el filtro de redactores solo aplica a `listing_text`. | D10. |
| C12 | **Límites:** hasta 30 documentos por carpeta y 20 MB por documento; lo que pase se salta con aviso. Los Google Docs se exportan a texto y las hojas a CSV en el Worker; Word y PDF se entregan tal cual y Hermes los convierte. | Cabe en la memoria del Worker y en los límites de la puerta. |
| C13 | **El aviso de duplicado (D9) vale desde ahora:** las fichas ya publicadas no se emparejan con su carpeta. | Emparejarlas sería un paso a mano sin beneficio claro. |
| C10 | **Link aceptado:** cualquier URL de carpeta de `drive.google.com` (`/drive/folders/<id>`, con o sin `/u/N/`, `?usp=…`) o el id solo. Cualquier otra cosa: error en el formulario. | Lo que copia el equipo del navegador. |

## 4. Qué queda para quien lo construya

- La forma de la tabla (ampliar `jobs` con un tipo `drive_import` o una tabla de cola propia), la migración y el dato que recuerda la carpeta en `listings`.
- Las rutas nuevas del panel y de la puerta de Hermes, con los mismos límites de tamaño y validación que `server/routes/hermes.js`.
- Firmar el acceso de la cuenta de servicio desde el Worker (JWT RS256 con `jose`, ya instalado; permiso `drive.readonly`).
- Cómo Hermes convierte Word y PDF a texto en el VPS, y su instrucción (dentro de `/root/hampton-hermes`, que no está en este repositorio; push del taller solo con el «sí» de Luis).
- Dónde va «Properties Queue» en la barra del panel y cómo se ve, según DESIGN.md.
- Pruebas con un Drive falso (sin red) y el e2e con una cola sembrada.

## 5. Lo que tiene que hacer Luis (guiado paso a paso cuando toque)

1. Crear la cuenta de servicio en Google Cloud y activar la API de Drive.
2. Guardar su clave como secreto de Cloudflare (nunca en el repositorio).
3. Desde la cuenta de Franco, compartir la carpeta madre con la cuenta de servicio, como lector.
4. Aplicar la migración en remoto antes del push.
5. Actualizar Hermes en el VPS con la nueva instrucción.

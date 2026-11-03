# Hampton App · Añadir una propiedad desde una carpeta (PUB-01)

Fecha: 2026-11-03 · Estado: aprobado por Luis en el chat (descripción: «esta bien asi»; pregunta de la revisión: decisión 5; documento: «aprobado», 3-nov) · Base: `main` en producción (`bf3e7a9`)
Checklist PUB-01 (sigue parcial). Arquitectura §5.10. Es la idea de Luis del 3-nov-2026, «propiedades para publicar».

## 1. Intención

Hoy, para dar de alta una casa, se pulsa «New listing», se rellenan cinco campos y el editor se abre vacío. Allí se teclea el resto, se suben las fotos y se elige la portada. Pero el equipo ya guarda las fotos de cada casa en una carpeta del ordenador. Con «Add new property» eligen esa carpeta, con las fotos y un archivo de texto con los datos. La app crea el borrador con todo eso: las fotos en orden y con portada. Después, «Missing from this listing» dice qué falta, y se publica cuando se quiera.

**Éxito (verificable):**
- **Botón y formulario:** «New listing» pasa a llamarse «Add new property», en la cabecera de Listings y en el vacío de la lista. Abre el formulario de siempre con una zona de importación opcional arriba. Sin carpeta, el borrador se crea igual que hoy.
- **Resumen antes de crear:** al elegir una carpeta, sin subir nada todavía, un resumen dice:
  - cuántas fotos, planos y vistas aéreas entrarán, y cuál será la portada;
  - qué datos se leyeron de `property.txt`;
  - qué no se importa y por qué: línea que no es un campo, valor no válido, HEIC, PDF, vídeo…
- **Crear:** «Create draft» crea la ficha sin publicar con los datos válidos. Sube las fotos una a una en el orden de sus nombres. Pone de portada la primera foto que no sea un plano ni una vista aérea. Al final abre el editor (`#/p/<id>`).
- **Datos no válidos:** ningún dato no válido llega al servidor. El resumen lo enseña y se queda fuera. El servidor valida igual que hoy.
- **Fotos que fallan:** la ficha queda creada con las demás. La pantalla dice cuáles fallaron y ofrece abrir la ficha.
- **Más de 100 fotos:** la carpeta no se acepta y la pantalla dice por qué.
- **Título repetido:** si coincide con el de una ficha existente (de cualquier pestaña, también Archived), un aviso da su referencia antes de crear. El aviso no bloquea.
- **Sin cambios en el servidor ni en la base de datos:** no hay migración.
- **Fotos reducidas:** se reducen en el navegador como hoy (`admin/src/image.js`, 1600 px y miniatura de 640). Al volver a codificarlas pierden la ubicación GPS y los demás metadatos. Nunca se sube el original.

**No-objetivos:**
- **Alta guiada en el móvil:** el alta «New instruction» por familias de datos durante la valoración (§5.10) no entra, así que PUB-01 sigue parcial.
- **Textos de Hermes (PUB-13):** Hermes solo redacta fichas publicadas (decisión de Luis, 31-oct).
- **Documentos:**
  - PDFs, folletos y vídeos no se suben (PUB-11: hoy no se suben documentos).
  - Las fotos HEIC no se convierten.
- **Otros datos:** quedan fuera:
  - las filas de especificación (`specs`);
  - los campos de las familias que aún no existen (PUB-04 a PUB-09);
  - cualquier dato del propietario.
- **Otras formas de importar:**
  - varias propiedades a la vez;
  - una carpeta de la nube sin descargarla;
  - actualizar una ficha que ya existe.
- **La subida de fotos del editor** (`MediaManager.jsx`) no cambia. Solo gana el fondo blanco de `image.js` (§3.6).

## 2. Decisiones de Luis (3-nov-2026)

1. **Datos:** una plantilla de texto (`property.txt`) que la app lee y que se descarga desde el formulario.
2. **Un solo botón:** «Add new property» sustituye a «New listing». La carpeta es opcional y el alta a mano sigue igual.
3. **Fotos visibles:** se ven como las que se suben hoy a mano (`public = 1`). La ficha es borrador hasta Publish.
4. **Descripción aprobada en el chat:**
   - la carpeta se elige con «Choose folder» o se arrastra;
   - en el móvil, «Choose photos» sirve para elegir fotos sueltas;
   - hay un resumen antes de crear;
   - título, uso, operación, disponibilidad y país salen rellenos desde el texto y se pueden cambiar;
   - sin texto, el título sale del nombre de la carpeta;
   - hay barra de progreso y al final se abre el editor;
   - las fotos van por orden de nombre, la primera es la portada, y «floor plan» o «aerial» en el nombre las clasifica;
   - máximo 100 fotos, aviso si el título se repite y ningún dato del propietario.
5. **Solo la carpeta elegida** (respuesta a la revisión del diseño): entran las fotos sueltas en ella, junto a su `property.txt`.
   - Las subcarpetas no se leen: 360, vídeos, originales, documentos… El resumen dice cuáles se saltó.
   - Si las fotos buenas están en una subcarpeta, se elige esa.
   - Así no entran fotos repetidas, fotos 360 ni documentos escaneados que saldrían en la web al publicar.

## 3. Diseño

### 3.1 La plantilla

Archivo estático `admin/public/property.txt`. Vite lo copia y queda en `/admin/property.txt`, con las cabeceras de `/admin/*` (`site/_headers`: noindex y X-Frame-Options). El formulario lo enlaza con `download`. La regla D19 obliga a que esté en inglés. Contenido:

```text
# Property details for Hampton's "Add new property".
# Keep this file in the property's folder, next to the photos, and fill in what you know.
# One field per line, like "Bedrooms: 4". Leave a value blank if you don't know it:
# blank Use, Operation, Availability and Country keep the form's values, which you can change before creating.
# Never write the owner's name, phone number or email here: these details can end up on the website.
# Lines that start with # are notes for you and aren't imported.
#
# Type: house, flat, cottage, restaurant…   Use: Residential or Commercial.   Operation: Sale, Rent or Business.
# Availability: For sale, Under offer, Sold, To let, Lease, Not stated or Withdrawn.
# Parish: one of the twelve, like St Helier or Trinity.
# Tenure: Freehold, Flying freehold, Share transfer or Leasehold.
# Housing category: Qualified or Registered.   Restriction: First-time buyers only or Over 55s only.
# Price: an amount like 850000, £850,000, 1.25m or £2,500 pcm. Words like "Offers over £850,000" are shown as written.
# Rent period: Per month or Per year.   Currency: GBP or EUR (blank means GBP).   Tour URL: starts with https://

Title:
Type:
Use:
Operation:
Availability:
Country:
Parish:
Location:
Road:
Bedrooms:
Bathrooms:
Tenure:
Housing category:
Restriction:
Price:
Rent period:
Currency:
Tour URL:

# Summary: one point per line, up to the Description line.
Summary:

# Description: one paragraph per line, to the end of the file.
Description:
```

El constructor puede pulir la redacción de los comentarios. Lo que no cambia es esto:
- los nombres de campo;
- el orden, con Summary y Description al final;
- los valores en blanco, para que la plantilla sin tocar no contradiga nada de lo que se escriba;
- el aviso sobre los datos del propietario.

### 3.2 Cómo se lee el texto

- **Qué archivo:**
  - se lee `property.txt`, en cualquier mayúscula, suelto en la carpeta elegida (nunca de una subcarpeta);
  - si no lo hay, se lee el único `.txt` suelto en la carpeta;
  - si hay varios `.txt` y ninguno es `property.txt`, no se lee ninguno y el resumen pide llamar `property.txt` al bueno;
  - un `.txt` de más de 100 KB no se lee, y el resumen lo dice.
- **Codificación:**
  - se lee como UTF-8 y se quita el BOM si lo trae;
  - si el texto no es UTF-8 válido, se vuelve a leer como Windows-1252, que es como guarda el Bloc de notas antiguo y donde el «£» se rompería.
  - Los finales de línea pueden ser CRLF o LF.
- **Líneas:**
  - una línea con `Campo: valor` llena ese campo;
  - el nombre del campo vale en cualquier mayúscula y con espacios, guiones o guiones bajos de más (`tour url`, `Tour-URL`);
  - las líneas en blanco y las que empiezan por `#` se ignoran en todo el archivo;
  - si una línea no es un campo de la plantilla, el resumen la enseña con su número («Line 7: "Garage: double" isn't a field of the template») y se queda fuera;
  - si un campo aparece dos veces, vale la última línea y el resumen lo dice.
- **Summary y Description:** son bloques. `Summary:` llega hasta la línea `Description:`, y `Description:` llega hasta el final del archivo.
  - Así, una línea de la descripción como «Location: set in the heart of St Aubin» sigue siendo descripción. En los textos de agencia son habituales.
  - Si hay texto en la misma línea que `Summary:` o `Description:`, es la primera línea del bloque.
  - En Summary se quitan las viñetas de inicio (`- `, `• `, `* `), porque la web ya pone las suyas.
  - En Description, cada línea es un párrafo, como en el editor.
- **Valores de lista:** Use, Operation, Availability, Tenure, Housing category y Restriction aceptan la etiqueta del panel o el valor guardado. Da igual la mayúscula, los espacios, los guiones o los guiones bajos: «For sale», «for_sale» y «FOR-SALE» valen igual.
  - Restriction acepta además «First-time buyers only», «Over 55s only» y «None» (que la deja vacía).
  - Las etiquetas están en `admin/src/format.js:4-7` y `admin/src/ListingEditor.jsx:34-36`, y los valores en `server/listing.js` ENUMS.
- **Parish:** vale una de las doce parroquias (`server/applicants.js`), sin importar mayúsculas, puntos ni «Saint» frente a «St». «st. brelade» y «Saint Brelade» dan «St Brelade».
- **Country:** es texto libre, como en el editor, pero «jersey», «united kingdom» y «uk» se escriben siempre como «Jersey» y «United Kingdom». La referencia y los campos de Jersey dependen de esa forma exacta (`regionOf`, `server/listing.js:83`).
- **Bedrooms y Bathrooms:** un número entero, que puede llevar una palabra detrás («4», «4 bedrooms»). Lo demás («3-4») se queda fuera.
- **Price:**
  - Se guarda en el precio de la operación con la que se crea la ficha:
    - una venta va a `sale_price`;
    - un alquiler va a `rent`;
    - un traspaso de negocio va a `premium`.
  - Si la operación cambia en el formulario, el precio cambia con ella.
  - Formatos de cifra: con o sin `£`, `€`, `GBP` o `EUR`, con comas o espacios, con decimales y con `k` o `m` (`850k`, `1.25m`).
  - El símbolo o el código de la cifra rellenan Currency si esa línea está vacía.
  - Una coletilla de periodo rellena Rent period si está vacío:
    - al mes: `pcm`, `pm`, `per month`, `a month`, `/month`;
    - al año: `pa`, `p.a.`, `per annum`, `per year`, `a year`, `/year`.
  - Si el valor no es una cifra («Offers over £850,000», «POA»), se guarda como texto del precio (`price_text`, el «Displayed text» del editor) y la cifra queda vacía.
- **Rent period:** «Per month», «month», «monthly» o «pcm» dan mes. «Per year», «year», «yearly», «annual», «pa» o «per annum» dan año.
- **Currency:** GBP, EUR, `£` o `€`. Si hay cifra y nada dice la moneda, se pone GBP (Hampton está en Jersey).
- **Cifra con dudas, que no se importa:** en estos casos la cifra no se importa y el resumen dice por qué. Equivocarse multiplicaría o dividiría el precio por 12 o lo pondría en otra moneda, y el editor pedirá el precio igualmente («Add the sale price», «Add the rent»…). Son:
  - un alquiler sin periodo: «Rent: say per month or per year»;
  - una coletilla de periodo en una venta o un traspaso, porque `pcm` y `pa` solo valen para alquileres;
  - una cifra cuyo símbolo o coletilla contradice la línea Currency o Rent period: `€` con «Currency: GBP», o `pa` con «Rent period: Per month»;
  - una cifra con una línea Currency no válida («USD»), porque no se sabe la moneda.

  Como el precio sigue a la operación del formulario, el resumen se vuelve a calcular cuando esta cambia.
- **Límites y formatos:** los decide `validateListing` (`server/listing.js:64`), el mismo código que usa el servidor. Por ejemplo, el título tiene 200 caracteres como máximo y el Tour URL tiene que empezar por `https://`. Un campo que no pasa se queda fuera y el resumen da el mensaje del servidor. También se comprueba la regla de moneda y periodo de `checkPrice` (`server/listing.js:75`).
- **Solo campos de la plantilla:** el texto nunca puede fijar `published`, `matchable`, `featured_rank`, `id` ni ningún otro campo.
- **Aviso de contacto:** el resumen avisa, sin bloquear, si Title, Location, Road, Summary o Description parecen llevar un email o un teléfono (un número de 10 cifras o más escrito como teléfono). Esos textos se ven en la web cuando la ficha se publica.

### 3.3 Cómo se leen las fotos

- **Qué se sube:** las fotos `.jpg`, `.jpeg`, `.png` y `.webp`, en cualquier mayúscula, sueltas en la carpeta elegida (decisión 5).
- **Subcarpetas:** no se leen. El resumen las nombra: «Subfolders not read: 360 photos, Videos».
  - Con «Choose folder», el navegador entrega todos los archivos, también los de las subcarpetas. La app descarta los que tienen más de un nivel en su ruta (`webkitRelativePath`).
  - Al soltar una carpeta, la app solo lee sus entradas directas.
- **Lo que se ignora sin avisar:**
  - los archivos y carpetas cuyo nombre empieza por `.` (también los `._IMG_1234.jpg` del Mac);
  - `Thumbs.db`, `desktop.ini` y la carpeta `__MACOSX`, que tampoco se nombra en el resumen.
- **Lo que no se sube, con su motivo en el resumen** (agrupado cuando son varios):
  - HEIC/HEIF: «HEIC photos: export them as JPG first»;
  - PDF;
  - vídeo (`.mp4`, `.mov`, `.m4v`, `.avi`);
  - Word y similares (`.doc`, `.docx`, `.pages`, `.rtf`, `.odt`): «only property.txt is read»;
  - cualquier otro archivo;
  - una foto de más de 40 MB, el mismo límite que el editor.
- **Orden:** orden natural del nombre del archivo: «2» va antes que «10». Se usa `localeCompare(…, { numeric: true, sensitivity: "base" })`.
- **Tipo:**
  - si el nombre del archivo contiene «floor plan» (también «floorplan», «floor-plan» o «floor_plan»), es Floor plan; la web enseña todos los planos;
  - si contiene «aerial» o «drone», la primera en el orden es Aerial, porque la web solo enseña una vista aérea (`toPublic`, `server/listing.js:101`); las demás entran como Photo, en la galería;
  - si no, es Photo.
- **Etiqueta:** es el texto alternativo de la foto en la web (`toPublic`, `server/listing.js:94`).
  - Sale del nombre del archivo sin la extensión.
  - Se quita la numeración del principio («01 - Kitchen», «1. Kitchen», «01_kitchen»), pero no las cifras que empiezan una palabra («1st floor plan», «3D floor plan»).
  - Los guiones bajos y los espacios repetidos pasan a un solo espacio.
  - Los nombres de cámara o del móvil no dan etiqueta, porque no describen nada: `IMG_1234`, `DSC01234`, `DSCN…`, `DSCF…`, `PXL_…`, `P1010001`, «WhatsApp Image…», «Screenshot…», «Photo 12», `image1` y los que son solo números. En ese caso la web usa el título de la ficha, como hoy con una foto sin etiqueta.
- **Portada:** la primera Photo en ese orden cuyo nombre no diga «aerial» ni «drone». Si todas lo dicen, la primera Photo. Nunca un plano.
- **Límite:**
  - con más de 100 fotos, la carpeta no se acepta: «This folder has 140 photos. The limit is 100: choose the property's own folder»;
  - una carpeta sin fotos y sin `.txt` tampoco se acepta: «No photos or property.txt in this folder».
- **Nombre de la carpeta:** el nombre de la carpeta elegida rellena el título cuando el texto no trae Title.
- **«Choose photos» (móvil):** sigue las mismas reglas, sin texto y sin nombre de carpeta. El selector pide JPG, PNG o WebP. El iPhone suele entregar sus fotos como JPG al elegirlas de la fototeca; si llega un HEIC, sale en el resumen como no subido.

### 3.4 El formulario

Sustituye a `NewListing` (`admin/src/Listings.jsx:129-151`) y se abre desde los dos botones de Listings (`:67` y `:125`), que pasan a decir «Add new property».

- **Cabecera:** el título h2 dice «Add new property». Debajo, una línea en `.muted` dice que se guarda como borrador y que nada sale en la web hasta Publish.
- **Zona de importación:** una `div.dropzone` (la clase que ya usan las fotos del editor, `styles.css:112-115`) contiene:
  - el título «Import a folder (optional)» y una línea que explica que se suelte aquí la carpeta de la propiedad, con sus fotos y `property.txt`;
  - dos botones de verdad, «Choose folder» y «Choose photos» (`.btn ghost sm`), que abren dos `<input type="file" hidden>`:
    - el de carpeta lleva `webkitdirectory=""` (como texto: en React 19 un `true` no llega al DOM);
    - el de fotos lleva `multiple` y `accept="image/jpeg,image/png,image/webp"`;
  - el enlace «Download the template (property.txt)».
  - Soltar en la zona una carpeta, o solo archivos sueltos, equivale a elegirlos.
    - Si se sueltan varias carpetas, o carpetas y archivos mezclados, no se acepta nada: «Drop one property folder at a time».
    - La carpeta se lee con `DataTransferItem.webkitGetAsEntry()` y `readEntries`. Esa función entrega las entradas en tandas, así que hay que repetirla hasta que vuelva vacía.
  - Cada elección sustituye a la anterior.
  - Los botones son la alternativa sin arrastrar (WCAG 2.5.7).
- **Resumen** (tras elegir):
  - una línea con la carpeta y las cifras: «Le Clos · 24 photos, 1 floor plan, 1 aerial · details from property.txt»;
  - la lista de todos los archivos que se van a subir, en orden y con su tipo, con la portada marcada. Sirve para ver, antes de crear, una foto que no toca, como un documento escaneado. El constructor decide cómo se pliega cuando es larga;
  - los datos leídos, con su valor (los textos largos, recortados);
  - lo que no se importa, en una caja `.warn` («Not imported:»);
  - en otra caja, lo que sí se importa pero conviene revisar antes de publicar («Check before you publish:»): un email o un teléfono en el texto, o una línea repetida (revisión del diseño, 3-nov);
  - un botón «Remove» que vacía la elección.
  - Al leer la carpeta, un `role="status"` corto lo anuncia.
- **Campos:**
  - Title (obligatorio), Use, Operation, Availability y Country, como hoy;
  - cada elección empieza de cero: los cinco campos vuelven a los valores de partida (título vacío, Residential, Sale, For sale y Jersey) y luego toman los del texto, y el título vacío, el nombre de la carpeta;
  - así nunca se mezclan los datos de una casa con las fotos de otra;
  - «Remove» también devuelve los cinco campos a los valores de partida;
  - lo que se teclea después de elegir manda.
- **Título repetido:** si coincide (sin mayúsculas y sin espacios de los lados) con el de una ficha de la lista, aparece un `.warn` bajo el campo, unido a él con `aria-describedby`: «A listing with this title already exists: HE-R003.» Vale también para el alta a mano.
- **Errores y progreso:** los errores van como hoy (`role="alert"`, `.err`, con los errores de campo del servidor). Una carpeta rechazada dice también lo que se saltó (por ejemplo, las fotos HEIC). El progreso va en un `role="status"`, «Creating the draft…» y «Uploading photo 3 of 24…», con una barra `<progress>` mientras se suben las fotos.
- **Botones:** «Create draft» y «Cancel». Mientras trabaja, los botones y los campos están desactivados.

### 3.5 Crear y subir

1. **Crear la ficha:** `POST /admin/listings` con los cinco campos del formulario, los campos válidos del texto y el precio en la clave de la operación (`server/routes/listings.js:80-99`). Si falla, no se sube nada, el error se muestra como hoy y la elección se conserva.
2. **Subir las fotos:** una a una y en orden, porque el servidor da la posición al llegar cada foto (`server/routes/media.js:64`).
   - Cada foto pasa por `resizeImage(file, 1600)` y `resizeImage(file, 640, 0.8)` y después va a `POST /admin/listings/<id>/media` con `label`, `kind`, `width` y `height`. Es el mismo bucle que `MediaManager.jsx:39-61`.
   - Si una foto falla, se apunta su nombre y su motivo y se sigue con la siguiente.
   - Durante la subida, `setUnsaved(true)`, así que cerrar la pestaña o salir de la página pide confirmación. Al acabar vuelve a `false`.
   - Si la persona sale igualmente, el bucle se para: no sube más ni la lleva luego al editor. La ficha queda con lo ya subido.
3. **Portada:** si se subió al menos una Photo, se pide `GET /admin/listings/<id>` para tener `updated_at` y se envía `PUT /admin/listings/<id>/media` con `{ items: [], cover_media_id, updated_at }` (`server/routes/media.js:17-46`). Si esto falla, no pasa nada grave: el resumen dice que se elija la portada en el editor, y «Missing from this listing» lo pide igual.
4. **Final:**
   - Si todo fue bien, la app va a `#/p/<id>`.
   - Si alguna foto falló, se queda en la pantalla con «Draft HE-R007 created. 22 of 24 photos uploaded.», la lista de las que fallaron, un botón «Open the listing» y otro «Close», que cierra el formulario y recarga la lista.

### 3.6 Dónde va el código

- `server/listing-import.js`: un módulo nuevo y puro, sin DOM ni APIs del servidor.
  - Lo comparte el panel, como `server/applicants.js`, y lo prueba node.
  - Contiene la lectura del texto (§3.2) y el plan de fotos (§3.3).
  - También la lectura de una carpeta soltada: sus entradas directas, con sus subcarpetas nombradas. Recibe objetos con la forma de `FileSystemEntry`.
  - Importa `validateListing`, `checkPrice` y `ENUMS` de `./listing.js`, para no copiar reglas.
- `admin/public/property.txt`: la plantilla.
- `admin/src/Listings.jsx`: los dos botones y el formulario. El constructor decide si el formulario va a un archivo propio (`admin/src/NewProperty.jsx`) si crece mucho.
- `admin/src/styles.css`: solo lo que falte, con clases (sin `style=`).
- `admin/src/image.js`: pinta un fondo blanco antes de dibujar la imagen.
  - JPEG no tiene transparencia, así que un plano en PNG transparente sale hoy con el fondo negro y no se ven sus líneas.
  - Es una línea, y arregla también la subida del editor: es el único cambio fuera de la importación.
- Pruebas: `tests/server/listing-import.test.mjs` (nuevo) y `tests/e2e.cjs`.

## 4. Seguridad y privacidad

- **Datos del propietario:**
  - la plantilla no tiene campos para ellos y su cabecera avisa de no escribirlos;
  - el aviso de contacto (§3.2) señala emails y teléfonos en los textos que se publican.
- **Fotos:** se vuelven a codificar en el navegador, así que no llevan GPS ni metadatos. Nunca se sube el original.
- **Archivos sin confianza:**
  - los nombres de archivo y el contenido del texto se tratan como datos de fuera y se muestran siempre como texto de React, nunca con `dangerouslySetInnerHTML`;
  - las rutas solo sirven para ordenar y mostrar.
- **Validación:** el servidor valida igual que en el alta a mano (lista blanca, longitudes, `https://` del tour, reglas de precio). La comprobación del navegador solo ayuda.
- **Campos fijados:** solo los de la plantilla. La ficha nace sin publicar (`published = 0`), y el servidor fija `matchable` como hoy.
- **Permisos:** no hay ruta nueva ni permiso nuevo. Puede importar quien hoy puede crear fichas, y las llamadas van con la sesión del panel.
- **Memoria del navegador:** nada se guarda en `localStorage`. El texto y las fotos solo están en memoria mientras el formulario está abierto.
- **La plantilla publicada:** es un archivo estático sin datos, servido con las cabeceras de `/admin/*`.
- **Repositorio público:** las pruebas usan datos inventados, sin direcciones ni personas reales.

## 5. Pruebas

- **Unitarias**, en `tests/server/listing-import.test.mjs`; primero la prueba que falla:
  - la plantilla de `admin/public/property.txt` se lee sin avisos;
  - un ejemplo relleno da todos los campos;
  - cada regla de §3.2:
    - nombres de campo en cualquier forma;
    - CRLF, BOM y Windows-1252 con «£»;
    - valores de lista por etiqueta y por valor;
    - parroquias y país;
    - números;
    - formatos de precio, periodo y moneda;
    - precio en texto, alquiler sin periodo y cada caso de cifra con dudas;
    - el precio que sigue a la operación;
    - mensajes de `validateListing` (longitud, `https://`);
    - líneas repetidas o desconocidas, bloques, `#` y viñetas;
    - aviso de contacto;
  - cada regla de §3.3:
    - ocultos;
    - tipos y etiquetas, también la segunda vista aérea, que entra como Photo;
    - orden y portada (nunca un plano, y una vista aérea solo si no hay más remedio);
    - HEIC, PDF, vídeo, Word, otros y 40 MB;
    - qué texto se elige;
    - las subcarpetas, que no se leen y salen nombradas;
    - más de 100 fotos;
    - nombre de la carpeta;
  - la lectura de una carpeta soltada, con entradas falsas que entregan los archivos en dos tandas e incluyen una subcarpeta;
  - el rechazo de varias carpetas soltadas a la vez.
- **e2e** (`tests/e2e.cjs`, un paso `folderImport(page)` después de `hermesDrafters`, para no cambiar los recuentos de antes):
  - **Carpeta de prueba:** se crea una temporal con:
    - un `property.txt` inventado;
    - cuatro copias de `tests/fixtures/photo.jpg` («01 Front.jpg», «02 Kitchen.jpg», «Floor plan.jpg», «IMG_1234.jpg»);
    - un plano en PNG transparente («Floor plan 2.png», creado en la prueba). Se comprueba que en el editor sale con el fondo blanco;
    - un PDF, un `.heic` y un `.DS_Store`;
    - una subcarpeta «360 photos» con una foto dentro, que no debe subirse y debe salir nombrada en el resumen.
  - **Antes de crear:** se elige con `setInputFiles` en el input de carpeta y se comprueban:
    - el resumen: 3 fotos y 2 planos, el PDF y el HEIC como no subidos, y la línea desconocida;
    - el aviso de título repetido con el título de una ficha de la semilla;
    - que «Remove» devuelve los cinco campos a los valores de partida (y después se vuelve a elegir la carpeta).
  - **Después de crear:** se pulsa «Create draft» y, en el editor, se comprueban:
    - los campos leídos;
    - las fotos en orden, con sus etiquetas y tipos;
    - la portada puesta: «Missing from this listing» no dice «Choose a cover photo».
  - **Móvil:** captura a 390 px del formulario con el resumen y comprobación de que no hay desplazamiento lateral.
- **Comprobaciones finales:** `npm test`, `npm run build`, el e2e completo desde una base de datos limpia y un recorrido en local a 1280 y 390 con capturas. Nunca en producción.

## 6. Documentos (en el mismo commit)

- **Checklist, PUB-01:** sigue «parcial». Hay que actualizar «hecho» (el alta «Add new property», a mano o desde una carpeta), «falta» (el alta guiada para el móvil y las familias PUB-04 a PUB-09) y la evidencia.
- **Checklist, AUT-13 y AUT-14:** desde el 3-nov el avisador y el canal funcionan y la puerta está abierta. Es la corrección que dejó pendiente el relevo.
- **ESTADO:** hay que actualizar su sección de Hermes y la «Siguiente tarea» con lo mismo.
- **Arquitectura §5.10:** una línea sobre la importación desde una carpeta.
- **Fecha:** la fecha `actualizado` del checklist.

## 7. Lo que queda al constructor

- **Código:** cómo se reparten las funciones y sus nombres.
- **Textos:** la redacción exacta, dentro de DESIGN.md: inglés funcional, sin mayúsculas de título, sin exclamaciones, sin emoji y sin «—» como separador.
- **Reglas de nombres:** las expresiones regulares y la lista exacta de nombres de cámara.
- **Resumen:** su forma (lista o tabla) con las clases del panel y cómo se agrupan los avisos.
- **Formulario:** si se queda en `Listings.jsx` o pasa a un archivo propio.

## 8. Decisiones mías, para que Luis las revise

1. **El precio va con la operación:** «Price» se guarda en el precio de la operación con la que se crea la ficha (venta, alquiler o traspaso).
   - `£` y `€` rellenan la moneda, y «pcm» y «pa» el periodo. Sin moneda, se pone GBP.
   - Si el precio contradice otra línea, la cifra no se importa y el resumen lo dice. La plantilla viene con los valores en blanco, para que no contradiga nada.
2. **Precio en palabras:** un precio que no es una cifra («Offers over £850,000», «POA») se enseña tal cual en la web, como texto del precio.
3. **Alquiler sin periodo:** no se importa, porque podría salir 12 veces más alto o más bajo. El editor lo pide.
4. **Summary y Description al final:** llegan hasta el final del archivo, así que «Location: …» dentro de la descripción no se confunde con un campo.
5. **Emails y teléfonos:** si el texto parece llevar alguno, el resumen avisa sin bloquear, porque la descripción se publica en la web.
6. **Nombres de cámara:** IMG_1234 y similares no se usan como descripción de la foto, y la web pone el título de la ficha.
7. **Más de 100 fotos:** no se importa nada, en vez de subir las 100 primeras.
8. **Salir a mitad de subida:** la subida se para y la ficha queda con lo ya subido.
9. **Fotos que fallan:** la pantalla se queda para enseñar cuáles fallaron, con un botón para abrir la ficha.
10. **Archivos del sistema:** los archivos ocultos del sistema (`.DS_Store`, `Thumbs.db`…) se ignoran sin avisar.
11. **«Jersey» bien escrito:** si alguien pone «jersey», se guarda como «Jersey». Si no, la ficha saldría como internacional (HE-I).
12. **Sin campo «Price text» en la plantilla:** el propio Price lo cubre (decisión 2).
13. **Una sola vista aérea:** como la web solo enseña una, la primera con «aerial» o «drone» en el nombre es la vista aérea. Las demás van a la galería, pero nunca de portada si hay otra foto.
14. **Cada carpeta empieza de cero:** elegir otra carpeta o pulsar «Remove» devuelve los cinco campos a los valores de partida, para que no se mezclen dos casas.
15. **Lista completa antes de crear:** el resumen nombra todos los archivos que se van a subir, para ver antes una foto que no toca.
16. **Fondo blanco:** los planos en PNG transparente salen con fondo blanco en vez de negro. Esto arregla también la subida del editor.

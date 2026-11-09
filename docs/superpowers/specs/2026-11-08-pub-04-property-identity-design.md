> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PUB-04 · Identificación y ubicación de la ficha

Fecha: 8-nov-2026. Lista 4. Encargo: **solo planificación local**, sin reservas ni construcción. Los detalles siguientes son propuestas técnicas para revisión, no decisiones de negocio atribuidas a Luis.

## Objetivo y fuentes

Completar la dirección interna con número/nombre de casa o unidad, código postal, estado del inmueble y promotor cuando corresponda. Conservar referencia HE, operación, uso, país, parroquia y disponibilidad existentes. Separar claramente los datos internos del texto de ubicación que la app ya publica.

Fuentes: tarea `docs/roadmap/tasks/PUB-04.json`, checklist, arquitectura §5.10 y contrato local de property_condition acordado como propuesta en PUB-05. Base main/HEAD/GitHub verificada: `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. El comando local plan confirma reserved:false/buildAuthorized:false; las dependencias y reservas de construcción no bloquean este diseño.

Referencia postal consultada el 8-nov-2026: [normas de dirección de Jersey Post](https://www.jerseypost.com/letters-and-parcels/resources/addressing-standards/) separan inmueble, calle, parroquia y código; [Address Finder](https://www.jerseypost.com/tools/address-finder/) sirve para comprobación manual y advierte que desarrollos aún no construidos pueden no aparecer. No es una API incorporada ni prueba de que un código propuesto exista. El documento privado original de Luis no está en esta copia; no se copió.

## Estado real

- listings ya guarda country, location, road_name y parish. `location` se convierte en `toPublic().place` y llega a catálogo, ficha y SEO; road_name no está en esa proyección.
- Type, Use, Operation y Availability ya tienen su función; el estado de conservación no debe reemplazar el estado comercial.
- ID se genera con idPrefix/nextId al crear; editar use/country no renombra la referencia ni los enlaces existentes.
- withFeatures y recalc infieren parroquia de los textos actuales, conservando la prioridad humana. No hay datos de dirección nueva ni property_condition en la base actual.
- Eventos EST-18 guardan valores de campos estructurados seleccionados y solo nombres para textos libres; aplicar esa distinción a dirección/promotor.

## Alternativas y elección propuesta

1. **Recomendada:** añadir los componentes internos mínimos, reutilizar Road/Parish/Country y mantener location como texto público independiente. El estado es un solo property_condition compartido con PUB-05.
2. Sustituir location por la dirección completa: confunde uso interno/publicación y puede revelar datos por catálogo/SEO. Descartada.
3. Integrar geocodificador o Address Finder automático: añade servicio, intercambio de datos y credenciales sin ser necesario para esta tarea. Descartada; solo enlace estático para consulta voluntaria.

## Datos y validación

Todos opcionales. PUT parcial omitido conserva; null o texto vacío/espacios borra. Rechazar tipos no textuales para los campos de texto, no convertir números/bools/objetos/arrays en strings.

| Campo | Contrato propuesto |
| --- | --- |
| `building_name_or_number` | TEXT nullable, máximo 200 caracteres tras trim. Puede contener unidad y nombre/número, por ejemplo un apartamento dentro de una casa. Conservar acentos, apóstrofos, comas y barras; no exigir un número. Es interno. |
| `postcode` | TEXT nullable, máximo 32 caracteres. Trim, colapsar espacios y pasar letras a mayúsculas. Cuando tenga forma JE válida, insertar un solo espacio antes de los últimos tres caracteres. Es interno; no se añade a place ni JSON-LD. |
| `property_condition` | TEXT nullable compartido con PUB-05: `new_build`, `existing`, `good`, `needs_modernisation`, `needs_renovation`. Labels `New build`, `Existing (condition not assessed)`, `Good condition`, `Needs modernisation`, `Needs renovation`. Null `Not known`; existing no afirma good. |
| `developer_name` | TEXT nullable, máximo 200 caracteres tras trim. Nombre del promotor, sin convertirlo en un contacto, teléfono o enlace. Mostrar si new_build o si hay un valor previo que el equipo deba revisar/borrar. Interno. |

Los textos nuevos usan el límite de longitud existente de JavaScript, sin filtros ASCII para nombres. No extraer datos automáticamente de location/title/specs ni rellenar desde una dirección de contacto. Los demás campos existentes conservan sus límites y semántica.

## Decisiones

| ID | Decisión propuesta |
| --- | --- |
| D1 | Validación postal de Jersey solo de forma: con country canónico Jersey, usar `^JE[0-9]{1,2} [0-9][A-Z]{2}$` después de normalizar. Se admite input sin espacio o con espacios repetidos; `je2  3ab` →`JE2 3AB`. Esta regex es una propuesta permisiva de formato, no lista de distritos asignados, coincidencia con parroquia ni certificación postal. Blank sigue siendo válido para dirección desconocida/nueva. |
| D2 | Fuera de Jersey, aceptar texto postal normalizado hasta 32 caracteres, sin imponer JE ni validar formatos extranjeros. Country no se infiere del código; conservar la lógica actual del país y no borrar postcode al cambiarlo. Revalidar sobre fila fusionada si se cambia a Jersey; un código no JE existente produce error de campo antes de guardar. |
| D3 | Edición interna y publicación son independientes. `building_name_or_number`, postcode y developer_name no se añaden a toPublic, place, JSON-LD, metadatos, URLs, sitemap, mensajes públicos o plantillas. location se etiqueta `Public location` con hint `Shown on the website. Enter only the location you want to publish.` No copiar datos internos a ese campo. |
| D4 | Etiquetas `Building name or number (internal)`, `Postcode (internal)`, `Road (internal)` y `Developer (internal)`. Preview `Internal address` une únicamente componentes presentes de inmueble, road_name, parish, country y postcode, en ese orden. Nunca incluye dueño/ocupante y no rellena componentes desconocidos; no es un destinatario ni etiqueta postal verificada. |
| D5 | Solo cuando country sea Jersey, mostrar link fijo `Check with Jersey Post` a https://www.jerseypost.com/tools/address-finder/, target blank y rel noopener noreferrer. No añadir dirección/código a query, fragment o referrer propio ni integrar búsquedas automáticas. Hint `Format checked only. The address has not been verified.` únicamente para postcode no vacío de Jersey que cumpla la regex tras normalizar; no mostrarlo para vacío, inválido o extranjero, ni un sello Verified. |
| D6 | property_condition es el mismo campo de PUB-05: un registro de enum y una columna. Si PUB-05 ya lo integró, reutilizar; si no, PUB-04 puede introducirlo sin construir el resto de PUB-05. La tarea que se implemente después lo consume. No hay ciclo ni dependencia de integración para redactar planes. |
| D7 | developer_name es opcional incluso en new_build. Al cambiar condición no se borra: conservar y mostrar el valor previo con hint `Only applies to new builds. Clear this value if it no longer applies.` Si no hay dato y condición no es new_build, puede ocultarse. No publicar el nombre por inferencia. |
| D8 | Referencia HE se mantiene estable. No regenerar ID al cambiar use/country, no hacer merges de propiedades por código postal y no inferir propiedad duplicada por compartir edificio/código. Conserva FKs, medios y canonical por ID. |
| D9 | No inferir parroquia a partir de building_name_or_number o postcode. Mantener extracción actual de location/road_name y prioridad de parish manual; no cambiar matching, geolocalización, filtros ni elegibilidad de vivienda. Cambiar datos internos/condición no confirma disponibilidad ni mueve la fecha de confirmación. |
| D10 | Identificación opcional no añade requisitos de Publish ni reemplaza checks existentes. Errores de tipo/formato aparecen por campo y conservan el borrador. Nada fuerza completar una dirección que aún no tenga código asignado. |
| D11 | Auditoría: property_condition enum puede guardar antes/después; building_name_or_number, postcode y developer_name aportan solo el nombre en fields/changed, nunca su contenido en before/after. Mantener regla de textos libres para road_name/location. Sin copia a logs/localStorage; actor y fecha existentes bastan. |
| D12 | property.txt y Properties Queue conservan sus whitelists. No convertir automáticamente Location/Title en dirección interna o viceversa, ni ampliar importación silenciosamente. Los campos nuevos se editan después de crear el borrador; extender importadores sería otra entrega. |
| D13 | Cambios en esta entrega no revisan ni redactan datos ya publicados en title/location/summary/description. Los hints explican qué campo es público; no prometer que una dirección presente voluntariamente en otro texto vaya a ocultarse. La garantía se limita a no exponer los campos internos nuevos ni copiarles sus valores a campos públicos. |

## Errores y estado del editor

- Tipo no textual: `Must be text`; longitud: `At most 200 characters` o `At most 32 characters`, según campo.
- Postcode de Jersey con formato incorrecto: `Enter a Jersey postcode in JE2 3AB format, or leave blank if unknown`.
- Condición fuera de enum: `Choose a listed condition or Not known`.
- Normalización se confirma al guardar/recargar; no desplazar cursor convirtiendo la entrada a mayúsculas en cada pulsación. Una vista previa puede mostrar el formato esperado sin sustituir el texto del borrador.
- Save/Discard, sesión, CSRF y versión updated_at existentes. Un 400/409 conserva todos los campos y se muestra como error accesible; no-op no agrega evento, y fallo del evento revierte la escritura.

## Grill-me: cuestiones resueltas

- Dirección completa frente a lugar publicable: D3/D4/D13; no switch que publique toda la dirección ni migración que copie datos actuales.
- Código desconocido o de nueva construcción: D1/D5/D10; formato no es existencia y Address Finder no es un requisito para guardar.
- Vivienda/negocio/extranjero: mismos campos opcionales; country y use no cambian la identidad de la ficha; no imponer un código JE a fichas fuera de Jersey.
- Estado compartido y promotor: D6/D7; campo único, conservación de valores y ninguna obligación de contacto o publicación.
- Ubicación y matching: D9; no convertir el distrito postal o nombre de una casa en prueba de parroquia.
- Privacidad/historial: D11/D13; datos internos protegidos por las rutas admin actuales, eventos sin copia de dirección y límites explícitos respecto a textos públicos existentes.

No quedan decisiones funcionales necesarias para redactar el plan. Son propuestas listas para revisión; no autorizan código, reserva build, publicación de dirección ni verificación postal externa.

## Aceptación

| ID | Resultado verificable |
| --- | --- |
| A1 | Crear/editar/recargar/borrar campos; PUT omitido conserva, null/blank borra y nombres no ASCII se mantienen. |
| A2 | JE normalizado, inválidos rechazados y blank admitido; extranjero sin regla JE, cambio de país validado sobre fila fusionada. |
| A3 | Dirección interna/preview separada de Public location; catálogo/API pública/SEO/sitemap/URLs no incluyen campos internos. |
| A4 | ID, referencias y enlaces conservados tras cambios de country/use; no se fusionan propiedades por dirección/código. |
| A5 | Condición compartida con PUB-05; promotor opcional, conservado y accesible para borrar después de cambiar condición. |
| A6 | Parish y confirmed_at mantienen sus reglas; campos internos no alimentan extracción, requisitos o disponibilidad. |
| A7 | Auditoría con nombres de campos privados, before/after solo de enum; no-op/400/409/rollback y migración preservan datos/FKs/historia. |
| A8 | Desktop 1280/móvil 390, teclado/foco/zoom 200 %, Discard/errores y link postal estático sin datos; importaciones sin cambios. |

[Plan de construcción](../plans/2026-11-08-pub-04-property-identity.md) · [ledger](../plans/2026-11-08-pub-04-property-identity-ledger.md).

# REG-08 ampliado · Must-have por requisito y edades de los niños

Fecha: 7-nov-2026. Estado: diseño aprobado por Luis («Vale, está bien, ahora construyelo»); implementación autorizada, publicación por SHA pendiente. Sustituye el diseño inicial limitado a parking.

## Encargo y decisiones de Luis

Luis pide un control en cada apartado pertinente del registro para que el aplicante marque lo imprescindible: parking, aceptación de mascotas, St Helier u otro parish. También solicita recoger la edad de los niños. Su última indicación concreta el diseño: interruptor a la derecha de cada apartado del formulario, incluidos Parking, Bedrooms, Children y Pets. Esto amplía REG-08 a prioridades de los requisitos residenciales y datos del hogar; ya no basta con añadir una prioridad exclusiva al parking. La corrección no se registra como aprobación de un diseño todavía no presentado.

Se trabaja sobre la aplicación actual, en `/tmp/hampton-reg08`, main y base publicada cf0c86dc8a18dc4e1cd71aee822f5d657e0b176e, verificada por fetch a las 21:50:22 UTC. Se preservan las otras copias y las entregas de otras sesiones. AGE-04, el directorio, contactos de agencias, permisos de imágenes y la investigación externa no forman parte del cambio. La independencia de módulos no elimina la necesidad de comprobar migraciones/documentos compartidos al integrar.

## Enfoque y tamaño

Es una ampliación transversal del registro residencial, el panel y su evaluación de coincidencias. Se propone **un control reutilizable Must-have junto al requisito**, con el mismo significado en web y panel. No se construyen formularios independientes por criterio. Un indicador exclusivo para parking ya no cubre lo pedido; un motor comercial completo, consultas a agencias y extracción con IA exceden esta entrega.

Se incorporan las partes necesarias de REG-04/05/06/07/08/09/11 y BUS-12. El checklist distinguirá exactamente lo construido y lo que siga pendiente: no se declaran completados todos esos códigos, todo M04 ni el matching comercial. La amplitud es mayor que la propuesta inicial; requiere aprobación del diseño ampliado.

## Control visible y significado

Decisión visual de Luis: **interruptor a la derecha de cada apartado**, alineado con su título. Título a la izquierda; etiqueta estable **Must-have** e interruptor a la derecha; cantidades, opciones y ayudas debajo. Se utiliza el mismo patrón en web y panel, incluidos Parking, Bedrooms, Children, Pets y Location. El interruptor no queda flotante, en una columna separada del apartado ni al final del formulario.

Control tipo switch, con nombre accesible específico del criterio, `role="switch"` y `aria-checked`; no se usa `aria-pressed` para representar un interruptor. La etiqueta Must-have permanece estable. La posición del mando y texto de estado On/Off distinguen encendido/apagado sin depender solo del color. Espacio/teclado, foco visible y área pulsable suficiente; su activación no envía el formulario ni abre/cierra los campos. La ayuda común explica «Turn on Must-have for requirements that are essential for your new home».

En escritorio y móvil se mantiene en el extremo derecho del encabezado de su propio apartado. Los títulos y la ayuda pueden ocupar varias líneas sin solaparse; el control no se reduce para hacerlo caber. En zoom 200% se conserva la asociación visual y accesible, con reajuste de línea si hace falta y sin desplazamiento horizontal. Se reutilizan paleta, tipografía y foco de cada superficie según DESIGN.md.

El bloque Bedrooms tendrá un interruptor general a la derecha del título para hacer imprescindible el rango mínimo/máximo declarado; Bedrooms ideally permanece como preferencia. El anterior diseño con un interruptor por cada límite queda sustituido por este patrón de apartado. Las opciones independientes como jardín/terraza/balcón conservan su control a la derecha de su propia fila para poder hacer imprescindible solo la característica elegida.

Para una respuesta nueva, seleccionar un valor y dejar el botón apagado expresa preferencia. Campo sin contestar no significa flexible, no necesario ni cero. Marcar un imprescindible requiere un valor o una respuesta explícita pendiente de concretar; la UI explica qué falta. No se puede marcar un valor contradictorio (por ejemplo, No parking needed con plazas imprescindibles).

Las prioridades pertenecen a la búsqueda; el aplicante las declara al registrarse y el equipo puede corregirlas después con historial y control de versión. La selección no sirve solo de decoración: llega a la API y cambia la evaluación. En compra y alquiler simultáneos se comparten inicialmente los criterios comunes como hoy, con presupuestos separados; cada búsqueda queda editable por separado.

### Requisitos que tendrán el control

| Apartado residencial | Significado aprobado |
| --- | --- |
| Parking | Tener al menos las plazas indicadas. Se conservan No parking needed y Not sure como respuestas diferentes. |
| Zona | Estar en una de las parroquias elegidas; varias parroquias son alternativas aceptadas, nunca la obligación imposible de estar en todas. St Helier solo + Must-have exige St Helier. |
| Tipo de vivienda | Ser uno de los tipos seleccionados; opciones alternativas, no exigir simultáneamente casa y piso. |
| Dormitorios | Un interruptor a la derecha de Bedrooms hace imprescindible el rango mínimo/máximo declarado. Ideal sigue siendo una preferencia; no se convierte el valor ideal en otro límite. |
| Baños | Cumplir el mínimo indicado. |
| Exterior | Control junto a cada opción elegida: jardín, terraza o balcón. Un jardín imprescindible no queda satisfecho solo por tener balcón. Las opciones preferidas no pasan a obligatorias junto con otra. |
| Amueblado | Cumplir la elección de furnished/unfurnished; Either no es una exigencia. Solo cuando aplica al alquiler. |
| Aceptación de mascotas | Interruptor a la derecha de Pets: «Pets must be allowed», asociado a tipos y cantidades declarados. Tener mascotas es un hecho separado y nunca se borra al apagarlo. |
| Niños / hogar | Interruptor a la derecha de Children: prioridad de comprobar que la vivienda sea adecuada para el hogar indicado. No representa si hay niños ni hace opcionales sus datos. |
| Presupuesto | Mantener el tope final aceptado: la ampliación explícita si existe, o el máximo ordinario si no. El control muestra ese importe; no autoriza ampliaciones nuevas ni transfiere presupuesto entre compra y alquiler. |
| Fecha y duración | Cumplir la fecha necesaria o duración indicada cuando aplique. Si el inventario no permite verificarlo, permanece pendiente. |
| Cercanía y requisitos libres | Se puede indicar que son imprescindibles. Mientras no exista evidencia estructurada suficiente, quedan como requisito que debe comprobar el equipo; no se finge resolver distancia o texto libre. |

**Presupuesto, regla concretada tras revisión:** se conserva la semántica actual del tope ampliado expresamente aceptado. Máximo preferido £2.000 + «I can stretch to £2.200» + Must-have evalúa un límite final de £2.200: una vivienda de £2.100 cumple ese límite, aunque esté sobre el presupuesto preferido. El botón y su ayuda mostrarán «Must stay within £2,200 per month» (o el precio de compra), sin presentar £2.000 como absoluto a la vez. Para hacer £2.000 el límite absoluto se elimina/reduce la ampliación explícitamente; pulsar Must-have no borra importes. Es la propuesta del constructor apoyada en el contrato existente, no una decisión nueva atribuida a Luis. La puntuación puede seguir reflejando la banda preferida; no altera el límite final.

No se añade un interruptor a cada dato personal (nombre, teléfono, email, consentimiento, situación de vivienda, número de adultos o edad individual), situación hipotecaria o franja de visitas. En Children sí existe el interruptor del apartado pedido por Luis; su significado es la adecuación de la vivienda al hogar, y no que los niños o sus edades sean opcionales. Las restricciones vigentes de operación, disponibilidad y elegibilidad se mantienen. Los parishes excluidos siguen siendo exclusiones explícitas; una parroquia no puede estar a la vez aceptada y excluida.

REG-06 seguirá distinguiendo pendiente la mejora de preferir una zona dentro de un conjunto aceptable si esta entrega solo cubre la prioridad del conjunto; no se declara resuelto ese caso por tener un único botón.

El alcance actual es residencial. Los formularios comerciales conservan su contrato REG-11; no se presentan como evaluados por un motor residencial. Esta limitación se mostrará en el cierre y en el checklist.

## Niños y edades

Actualmente existen número de adultos, número de niños, estado conocido/desconocido/no aplica y total cuando se conocen ambos componentes. Se amplía la misma sección: encabezado Children con interruptor Must-have a la derecha; debajo número de niños y, si se indican dos, «Child 1 age» y «Child 2 age». Si no hay niños, no se piden edades.

Propuesta funcional para ese interruptor: «The home must suit our household». Es una prioridad explícita de revisar la adecuación de la vivienda al hogar declarado. Apagarlo nunca borra los niños, cambia sus edades ni convierte una incompatibilidad conocida en compatibilidad. No es el interruptor de mostrar/ocultar los campos. No aplica cuando se ha declarado cero niños; la UI mantiene el control en el apartado, apagado y no activable, con una explicación accesible. Si se declara que hay niños sin concretar cantidad/edades, esos datos permanecen pendientes según las reglas de captura.

No existe hoy evidencia estructurada suficiente en el inventario para certificar esta adecuación familiar. Cuando se marca imprescindible queda pendiente de comprobar por el equipo, con su razón visible; no se deduce del número de dormitorios, de la edad ni de una expresión genérica como family-friendly. No se construye un clasificador de familias o un filtro automático por edades. Esta semántica formó parte del diseño aprobado para construir.

Edad declarada en años, con opción «Under 1» y edades 1–17; adultos se presentan como 18+. No nombres ni fechas de nacimiento de los niños. Las edades se guardan como declaración a una fecha, sin incrementarlas automáticamente ni inventar cumpleaños. Son información del hogar para el equipo, no un filtro automático que descarte una vivienda por tener niños o por su edad.

La cantidad y las edades deben ser coherentes. Desconocer edad no significa cero ni Under 1. Se conserva una posición por niño y, si se permite, un estado «To confirm». Los registros históricos conservan sus cantidades sin inventar edades; un cambio ajeno al hogar no obliga al equipo a rellenarlas ni las elimina. Una respuesta pública duplicada sigue el flujo de revisión de duplicados, sin sobrescribir silenciosamente a una familia existente.

**Diseño aprobado:** permitir enviar con «To confirm» en las edades que no se conocen. Esta opción formaba parte de la propuesta aprobada por Luis con «Vale, está bien, ahora construyelo»; no se infiere una respuesta del silencio anterior.

Se excluyen también las edades de sessionStorage/localStorage igual que los demás datos personales del hogar. Se guardan bajo los mismos accesos, exportación y borrado que la búsqueda; sin nuevos destinatarios ni logs con esos valores. El equipo ve y corrige la declaración en el panel. No se añade envío a agencias.

## Plazas de la propiedad: número y certeza

Hoy `feat_parking=1` puede proceder de «Garage» o de «Parking for one car»; no son la misma evidencia. Se mantiene la extracción precomputada: el evaluador no relee descripciones en cada comparación.

La lectura de parking transportará, además de su valor y frase, si es un número expresado, un mínimo inferido o una cantidad no determinada. Decisión técnica del constructor tras revisar los consumidores: guardar la certeza como metadato estructurado en `feat_evidence`, con clave propia y versión, conservando las frases existentes. El evaluador es el único consumidor actual de esas frases; EST-18 registra el campo como derivado. No hace falta una segunda columna en listings ni cambiar el contrato de otros criterios.

Reglas conservadoras:

- Cantidad explícita y pertinente de plazas propias: se usa el número declarado y se conserva la frase que lo respalda.
- «Parking», «Garage» o una respuesta genérica afirmativa acreditan como mucho un mínimo, no un total exacto. Si ese mínimo es menor de lo solicitado, falta confirmar; no se afirma incumplimiento.
- «Garage: No» no prueba ausencia de todo parking. «Parking: No» o «Parking spaces: 0» sí pueden declarar ausencia de plazas propias si no hay información contradictoria.
- Parking de visitantes, público, cercano o alquilable aparte no se cuenta como plazas propias, también cuando incluye un número.
- Rangos, «up to», varias cifras incompatibles o contradicciones no se convierten en capacidad garantizada. Se conserva incertidumbre; no se suman componentes ni se escoge una certeza que el texto no justifique.
- Sin metadato nuevo válido, ninguna cifra histórica demuestra capacidad o ausencia con la certeza nueva: también podría proceder de visitantes o de un garaje ausente. Se marca pendiente hasta releer la ficha, aunque la cifra parezca suficiente. Una búsqueda que no necesita parking no requiere esa comprobación.

No se llama a una extracción «confirmación humana». Confirmación comercial de disponibilidad, fuentes y permisos de AGE-04/EST-16 siguen siendo ámbitos distintos. Los cambios derivados de guardar/recalcular la ficha siguen entrando en EST-18, sin copiar texto libre al historial.

## Mascotas y certeza de los otros requisitos

Tener dos perros es un hecho. Desmarcar Must-have no convierte ese hogar en uno sin animales ni una propiedad que los prohíbe en compatible confirmada. Puede conservarse una alternativa interna con su incompatibilidad explicada; aceptar condiciones diferentes requiere una decisión posterior del cliente y una edición explícita. Lo mismo ocurre con el número de ocupantes: no se elimina para mejorar resultados.

La extracción actual agrupa «pets considered/by negotiation» y «pets allowed» como yes. Eso no basta para afirmar que cumple un imprescindible: los casos condicionales quedan pendientes, y las restricciones de especie/cantidad o contradicciones no se convierten en permiso general. Se usa certeza precomputada con evidencia, sin confirmar condiciones comerciales ni permisos externos por inferencia. La aceptación de la familia concreta sigue siendo un ámbito posterior.

Para exterior, las menciones negativas o incidentales (por ejemplo «no garden») no acreditan una característica imprescindible. Cuando no sea fiable resolver una negación, una condición o la pertinencia de la frase, se devuelve desconocido. La extracción debe aportar evidencia suficiente para los criterios que declare satisfechos. No se añade un parser general ni IA para resolver texto libre; una condición sin dato comprobable permanece pendiente.

## Evaluación y revisión

Se conserva por separado valor, prioridad, certeza y resultado de cada criterio. Las prioridades nunca se deducen del score. Para los requisitos cubiertos por esta entrega:

- Imprescindible satisfecho por los datos disponibles: cumple ese requisito, sin llamar confirmación comercial a una lectura del anuncio.
- Imprescindible con incumplimiento conocido: alternativa interna, con criterio y motivo; no coincidencia completa aunque score sea 100.
- Imprescindible con dato ausente, ambiguo o condición no evaluable: pendiente de confirmar.
- Preferencia no satisfecha: se explica como preferencia incumplida; no se transforma en prohibición ni modifica el valor solicitado.
- Sin respuesta o prioridad histórica desconocida: pendiente de precisar, no preferencia flexible inventada.

Ejemplos de aceptación: St Helier imprescindible y vivienda en St Saviour → alternativa; dos plazas imprescindibles y una plaza total fiable → alternativa; Garage sin cifra suficiente → pendiente; jardín imprescindible y solo balcón → no cumple jardín o pendiente si no se sabe si también tiene jardín; mascotas por negociación → pendiente; edades 2 y 7 guardadas para dos niños → información del hogar sin nuevo filtro de exclusión.

El resultado agregado expresará el cumplimiento de los imprescindibles declarados, distinguiendo satisfechos, pendientes e incumplidos. No afirmará que se ha completado todo BUS-12 o la confirmación de disponibilidad. Operación incompatible, propiedad no disponible, restricciones vigentes y exclusiones explícitas siguen fuera del conjunto pertinente. Los antiguos descartes por criterios de preferencia se revisan para que el botón tenga significado: un criterio negociable no puede seguir ocultando candidatos como si fuera obligatorio. Requisitos incumplidos conocidos pueden conservarse como alternativas internas.

Los candidatos que cumplen los imprescindibles se ordenan antes que los pendientes y las alternativas; dentro de cada grupo se conserva la puntuación y una ordenación estable. No se introduce aún el ranking de distancias de BUS-17 ni una compensación entre libras, plazas y habitaciones. Si hay varios incumplimientos, se muestran todos; un dato conocido incompatible no se oculta detrás de otro desconocido.

Found/Shortlisted/Rejected sigue siendo decisión humana independiente de esa evaluación. Shortlist no borra incumplimientos. Rejected no reaparece; Shortlisted no se borra si cambia el requisito, pero muestra su evaluación actualizada. No se envían mensajes ni se contacta con agencias.

## Datos históricos y activación

Se conservarán valores históricos sin atribuir prioridad a Luis o al aplicante. El contrato nuevo de prioridades debe distinguir falta de respuesta antigua de un Preferred declarado en el formulario nuevo. Editar un campo ajeno conserva todos los valores y prioridades existentes.

Decisión técnica: un contrato de prioridades versionado y validado por lista de criterios permitidos, compartido por web/panel/servidor, en lugar de columnas improvisadas para cada botón. El plan concretará su representación, coherencia con cantidades y opciones, y cómo se versiona junto con la búsqueda. Las edades del hogar tienen almacenamiento propio y no se mezclan con esos criterios.

La evidencia derivada conserva las frases actuales y añade metadatos versionados cuando haga falta certeza. Los consumidores actuales permiten esa extensión. La lectura de tarjetas evaluará los criterios cubiertos con datos estructurados actuales y una función pura compartida con el recálculo: sin analizar descripciones ni escribir al abrir una ficha. No se heredan Meets antiguos como prueba de los nuevos imprescindibles. Sin evidencia suficiente se muestra pendiente. Cubre ficha, Review y respuesta de revisar/deshacer, incluso cerradas y Rejected, sin cambiar decisiones humanas.

El motor almacenará el contrato nuevo en los recálculos/guardados posteriores, manteniendo los controles de versión y estado activo. La transición de resultados y su ordenación se concretará en el plan para no exponer una ordenación histórica como nueva, ni mezclar dos evaluaciones sin indicarlo. No se ejecuta recálculo remoto sin aprobación.

Migración nueva 0031 tras integrar AGE-04 en 9d4429c y conservar su 0030. No usar 0028 (NOT-11 local) ni modificar 0029 (EST-18 publicada). Los documentos públicos de EST-18 se actualizan con la evidencia ya comprobada en esta sesión. NOT-11 no se publica como efecto secundario.

## Interfaz, seguridad y validación

Reutilizar controles, colores, tipografías, espaciados y estados de DESIGN.md; el plan recogerá sus valores exactos por superficie. El botón debe ser legible en móvil y con zoom, no solo por color. Nombres accesibles específicos («Parking must-have», «Location must-have»), foco visible, errores asociados al criterio y sin alternancias que se pierdan al volver atrás. Sin librerías, fuentes o servicios nuevos.

Validación autoritativa en servidor, whitelist de criterios, rechazo de valores incoherentes y conservación de autenticación/CSRF/Turnstile y versiones. No se cambian permisos, servicios ni controles del VPS. No se usan datos privados de clientes para pruebas. Los datos del hogar permanecen fuera del almacenamiento del navegador y siguen la conservación existente.

Comprobaciones necesarias:

1. Must-have aparece como interruptor a la derecha del título de cada apartado pertinente, incluido Children, en web/panel y a 1280/390; persiste por criterio, admite vuelta atrás y compra/alquiler simultáneos, y aparece en resumen/Review/historial. Nombre/estado accesibles, teclado y zoom 200%; no altera datos inaplicables ni borra valores al apagarse. Bedrooms aplica al rango declarado.
2. Matriz por cada criterio; varios imprescindibles, score 100, lista de parroquias alternativa y exteriores independientes; propiedad incompatible nunca se muestra con todos los imprescindibles satisfechos.
3. Mascotas condicionales/restringidas y parking/exterior inciertos no generan falsos cumplimientos. No se borran mascotas ni niños para flexibilizar una búsqueda.
4. Cantidad de niños y edades coherentes; bebé, 17, desconocido según decisión, ninguno, respuestas inválidas y legado. Apagar el interruptor de Children conserva los datos, encenderlo solicita comprobar adecuación del hogar y no inventa una confirmación; cero niños lo deja no aplicable. No se guardan en almacenamiento del navegador ni se filtran por los logs nuevos.
5. Prioridades antiguas sin inventar, edición parcial, duplicados, conflicto de versión, búsqueda cerrada, recálculo tardío, idempotencia y conservación de decisiones humanas.
6. Transición de checks y ordenación tras despliegue verificada. EST-18 sigue registrando los cambios derivados y las coincidencias no duplican avisos al recalcular.
7. npm test, build, check:release, e2e general/focal y Playwright MCP local a 1280/390: éxito, errores, vacíos, teclado, foco, zoom 200%, consola/red. Migración local poblada y revisión independiente antes de commit.
8. Código, ESTADO, checklist, reconciliación y evidencia en un mismo commit revisado; publicación/migración solo con aprobación del SHA final. Pruebas locales no demuestran producción.

## Grill-me: decisiones y revisión

Decidido por Luis: control de imprescindibles por apartado, incluidos parking/mascotas/parish, edades de los niños e interruptores alineados a la derecha de cada apartado, incluyendo Children y Bedrooms. Decidido por la hoja de ruta: hechos del hogar preservados, incertidumbre pendiente, incumplimiento imprescindible nunca completo y decisiones humanas separadas. Propuestas del constructor: etiqueta Must-have, grupos de alternativas para zonas/tipos, prioridad por opción exterior, registro de edades sin fecha de nacimiento, estructura versionada y ámbito residencial actual.

Builder check de la ampliación realizado por reg08_expanded_design_review. La cuestión de máximo frente a ampliación aceptada se resolvió conservando el tope final que incluye solo la ampliación explícita, visible junto al botón; ejemplo £2.000/£2.200 documentado arriba. No quedaron otras preguntas del revisor. Luis aprobó después la propuesta completa, incluidas edades pendientes. El constructor resuelve nombres, contratos y algoritmos.

### Ajuste visual posterior a la revisión

Luis especificó interruptores a la derecha, incluyendo Children, y después aprobó la construcción completa. La semántica familiar y el control de Bedrooms por apartado quedan descritos arriba. La publicación y la migración siguen sujetas a aprobación del SHA final.

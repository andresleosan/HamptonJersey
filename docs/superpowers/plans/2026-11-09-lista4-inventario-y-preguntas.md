# Lista 4 · Inventario y decisiones para completar planes

GitHub main observado `064aa7f3725ee3f8b13a39b3443778e2cf60da56`, copia aislada `[copia local de planificación]`. Documento de evaluación, no plan de implementación ni aprobación de despliegue. Luis pidió planes listos para otros agentes y preguntas agrupadas. Decisiones técnicas no atribuidas a Luis.

## Cambio de alcance: tours

Luis descartó por ahora T3D-01–T3D-12 y PRE-27 (equipo 360). Se actualizan las fuentes de esas 13 tareas a `descartado` y PRE-19 conserva sus decisiones previas de búsqueda; esos 13 códigos no integran nuevas tandas. Esto no elimina funciones existentes ni cierra la posibilidad de una futura decisión explícita. Solo consta en esta copia hasta una publicación autorizada.

## Plan listo en copia previa

- **PUB-17**, aviso de fichas con muchas aperturas y pocas solicitudes: `2026-11-09-pub-17-salud-fichas.md`. Revalidar GitHub antes de construir.

## Planes previos: revisar y adaptar a la versión vigente

- **SPR-01** tarjeta con baños y fecha; **PUB-04, PUB-05, PUB-06, PUB-07** familias de identificación, características, economía y datos legales. Sus planes de 8-nov existen en copias `[copia local de planificación]` y `[copia local de planificación]` a `hampton-pub07-plans-20261108`; confrontar migraciones, triggers, privacidad y relaciones entre ellos antes de darlos listos en esta base. BUS-13 sigue aparte.
- **PRE-16** tiene plan listo del tramo fotos (`2026-11-09-pre-16-fotos-equipo.md`), no de la migración completa; otras actuaciones se citan abajo.

## Planes por completar o elaborar, agrupados por funcionalidad

1. **SPR-02, SPR-03, SPR-07, SPR-08:** historial adicional de matches/visitas/ofertas, fuente y verificación, ficha compartida, descargas, notas y anuncios. History de eventos de ficha ya está publicado; etapas futuras dependen de BUS-10, EST-16, AGE-06 y productores reales. El borrador de ficha multifuente requiere contratos de captura y recuperación; planificar sin afirmar que las dependencias existen.
2. **PUB-01, PUB-02, PUB-12:** alta guiada, porcentaje de completitud y condición de Publish. Ya existe un borrador con porcentaje como fase independiente. Falta la decisión de bloquear o permitir publicación incompleta y concretar el alta guiada.
3. **PUB-08, PUB-09, PUB-16:** campos de contenido y estados del ciclo de ficha. Existe plan parcial de PUB-08/09 y borrador de PUB-16; conciliar EST-17 actual y las decisiones posteriores de Luis sobre Let agreed, retiro, corrección y visitas. Redes manuales y portales fuera del alcance. No repetir preguntas ya respondidas sobre plazo y cancelaciones.
4. **PUB-11:** controles de fotos y carga segura de documentos. El sistema actual acepta fotos, no documentos. Definir quién ve los documentos y si advertencias de calidad impiden continuar.
5. **PUB-13:** solo capacidades de IA pendientes realmente requeridas: alt y etiquetado, trazabilidad de afirmaciones y cualquier otra capacidad acordada. Luis confirma que el flujo de redes con Hermes existe y funciona; no volver a construirlo ni preguntarle por su funcionamiento.
6. **PUB-10, PUB-19, PUB-20, ANA-10:** formulario de valoración, cifras de demanda, folleto y procedencia. Requieren definición de contacto, recuento fiable, reglas de privacidad, QR y dependencias legales PRE-03/PRE-09. Hay borrador preliminar de captación, no listo.
7. **ANA-01, ANA-04, ANA-05:** actividad, tendencias y embudo. Datos agregados no prueban que una persona pasó por todas las etapas; seguimiento individual necesita una decisión explícita y revisión de privacidad. Hay borrador de métricas aún incompleto.
8. **ANA-06:** planificar las reglas ya acordadas para disponibilidad y tiempo laboral; depende de hechos reales AGE-06/AGE-11 para respuestas y entrega confirmada. No medir con fechas inventadas; distinguir plan y disponibilidad de las dependencias.
9. **PRE-14:** completar el diseño de respaldo/restauración, con barrera para todas las fuentes de escrituras, consistencia D1/R2, cifrado, retención y ensayos de restauración aislada; las decisiones de calendario y retención ya se acordaron. No inventar una pausa efectiva que no controle todos los escritores.
10. **PUB-21:** conexión con Drive se pospuso por Luis. Función parcial existente; no planificar ni configurar ahora la conexión aplazada.

## Gestiones externas o legales, no equivalen a plan de código

- **PUB-14:** enviar sitemap a Search Console con dominio verificado.
- **ANA-03:** activación de Web Analytics y decisión sobre disponibilidad de datos en Insights; revisar acceso/capacidad real antes de diseñar integración.
- **ANA-09 y PRE-06:** reglas de seguridad / doble factor en cuentas; preparar instrucciones específicas después de verificar opciones existentes y sin alterar controles por esta planificación.
- **PRE-13, PRE-28, PRE-33:** acuerdos, titularidad de cuentas y paquete para abogado; requieren decisiones de titulares y revisión profesional. Preparar materiales, sin enviar ni firmar.
- **PRE-16:** cambio a dominio actual ya hecho; quedan comprobaciones reales, fotos, sitemap y decidir cuándo dar de baja Wix. No activar ni cancelar servicios durante planificación.
- **PRE-19:** la antigua decisión de tours queda descartada por ahora; las decisiones de búsqueda ya adoptadas se conservan. Revisar cierre documental, sin un plan de software separado.

## Fuera de esta tanda

**PUB-03:** Luis publica manualmente y confirma Hermes funcionando. **PUB-15:** portales para más adelante. **ANA-08:** el destino solicitado por Luis es Inbox, ya construido; el email histórico no se planifica mientras no lo vuelva a pedir. **PUB-21:** conexión Drive para más adelante. Tours 3D y equipo 360 descartados por ahora.

## Preguntas de producto, reunidas para Luis

1. **PUB-01/02/12:** ¿Se puede publicar una ficha aunque falten campos recomendados, siempre que tenga los datos básicos y una foto pública, o debe bloquearse hasta completar todo? Recomendación: permitir con aviso claro y validaciones básicas, porque ya se puede publicar así y a veces el precio es privado.
2. **PUB-11:** ¿Los PDF/documentos de una propiedad deben ser privados para Staff por defecto, y los avisos de calidad de fotos deben permitir continuar? Recomendación: sí a ambos; solo publicar un documento con una acción explícita futura.
3. **ANA-01/04/05:** ¿Prefieres estadísticas agregadas sin seguir a cada visitante, o necesitas ver las propiedades y búsquedas de cada persona identificada? Recomendación: empezar con agregados; no afirmar un embudo individual sin eventos vinculados y revisión de privacidad.
4. **PUB-10/19/20 y ANA-10:** ¿Para pedir una valoración, qué datos de contacto y propiedad debe introducir el dueño? ¿Las cifras públicas deben contar personas distintas que buscan por parroquia y dormitorios, ocultando grupos de menos de cinco? Recomendación: nombre, teléfono o correo, parroquia, tipo de propiedad y mensaje opcional; contar personas distintas con protección contra deducciones.
5. **PRE-28/PRE-13:** ¿Quién debe ser titular de las cuentas principales de la aplicación y servicios, Hampton u Optimyze? Recomendación: Hampton como titular y Optimyze con acceso de operador, sin cambiar cuentas actuales hasta preparar transición.

Estas preguntas no sustituyen la revisión de código, contratos, privacidad ni requisitos externos; decisiones técnicas menores las adopta el planificador. Publicación, migraciones, servicios y envío de documentación no forman parte de este trabajo.

## Respuestas de Luis del 9 de noviembre

1. Acepta publicación sin campos recomendados con datos básicos y foto pública; precio puede ser privado. Plan: `2026-11-09-pub-12-completitud-publicacion.md`.
2. Acepta PDF/documentos privados por defecto y advertencias de calidad que no impiden continuar. Falta concretar el protocolo seguro de cargas, borrado y formatos antes de declarar PUB-11 lista.
3. Prefiere estadísticas generales; no planificar seguimiento individual de visitantes para ANA-01/04/05 sin una decisión posterior. No llamar embudo individual a agregados.
4. Indica que los compradores tienen que comunicarse con Hampton Estates; no confirmó el formulario ni qué ocurre con propietarios que solicitan valoración, por lo que no inferir que rechazó o aceptó ese formulario.
5. Hampton como titular de cuentas y Optimyze como operador autorizado. No autoriza cambios de titularidad, accesos, credenciales ni acuerdos por sí solo.

## Aclaración de Luis: valoración

La persona utiliza el mismo formulario existente y marca una casilla si requiere valoración; no crear un segundo formulario. Debe quedar reconocible por el equipo para atenderla. La aplicación contiene tanto el registro de búsqueda como la reserva de visita/consulta general; falta confirmar cuál de los dos llama Luis «el mismo formulario» antes de asociar la casilla a un flujo concreto. No asumir que la casilla autoriza publicidad comercial ni registrar una valoración como completada.

## Decisión de Luis: registro de propietarios y valoración

En el registro de una persona que quiere vender su casa o alquilar su propiedad, usar el mismo formulario para ambas finalidades e incluir una casilla opcional para indicar si requiere una valoración. La solicitud llega a Hampton para que el equipo contacte a la persona; marcar la casilla no equivale a aceptar marketing ni supone una valoración realizada. No sustituir el registro de compradores/inquilinos por el de propietarios ni inventar campos confirmados para el formulario.

Comprobación de base `064aa7f`: `site/apply.js` es el registro de búsqueda de compradores/inquilinos, y el formulario de `site/index.html` es reserva de visita/consulta; no se identificó un registro público específico de venta/alquiler del propietario. PUB-10 tendrá que planificar ese registro compartido de propietario, usando patrones existentes, sin afirmar que ya existe ni asumir que la reserva de visita es el registro mencionado. El tratamiento del contacto y aviso de privacidad requiere resolver la dependencia PRE-03/PRE-09; no bloquear el diseño ni activar captación sin cubrirlas.

## Respuestas de Luis: captación, QR, documentos y fotos

- **PUB-10:** el registro del propietario exige nombre, teléfono, correo electrónico, dirección completa de la propiedad, elección de vender o alquilar y casilla para indicar si necesita valoración. Los registros generan tarea para que Staff contacte al propietario, marcando si requiere valoración. Se conservan PRE-03/PRE-09 como requisitos de activación ya documentados.
- **PUB-19/20:** sí a mostrar demanda real por parroquia y dormitorios, con umbral de cinco personas acordado en la pregunta; no exponer personas individuales y proteger contra deducciones.
- **PUB-20/ANA-10:** los folletos dirigen mediante QR; preparar el destino y el conteo de redirecciones. Luis pidió contar personas redirigidas pero eligió estadísticas generales sin seguimiento individual: el dato medible sin identificación es aperturas/redirecciones, no personas únicas; decirlo expresamente y no prometer visitantes únicos ni conversiones. Diferenciar redirección de registro. No atribuir a Luis la selección anterior de canales por carteles o recomendación que no confirmó.
- **PUB-11:** formatos requeridos: PDF, documentos Word, Markdown `.md` e imágenes. Definir tipos concretos y validación segura en el plan sin fingir que ya existen; documentos privados por defecto. La carga de imágenes actual se conserva.
- **SPR-03/08:** Luis rechazó añadir un paso de revisión/autorización previa del equipo antes de compartir fotos. No añadir tal paso ni asumir por ello permiso de terceros o modificar controles/procedimientos de derechos existentes.
- **PUB-13:** Luis rechazó añadir propuestas de Hermes para textos alternativos y etiquetas de estancia en esta planificación. No introducirlas como requerimiento ni reconstruir la función de redes que afirmó ya operativa.

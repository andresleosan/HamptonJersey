# Lista1 · Cierre de decisiones para construir

8-nov-2026. Solo entrevista y actualización de planes; sin construcción. Base main c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1, remoto comprobado19:56:47UTC, con96Markdown preparados conservados. La entrevista revisa las dos tandas y registra decisiones humanas separadas de datos y validaciones externas.

## Ya acordado: no volver a preguntar

- SAP02: found / approved / availability confirmed, con significados independientes.
- D02: disponibilidad48h alquiler/7d compra configurable; contradicción exige reconfirmación.
- D03/D04/D09: conservar reloj, tarea por episodio, diferencias explicadas sin sumar unidades distintas.
- D10: purga de archivos sin uso activo, con mínimos/evidencias e historial conservados.
- AUT19/REG13: preparar flujo del panel con revisión antes/después y adaptador IA desactivado. Elegir proveedor es gate de activación futuro, no una pregunta repetida para construir ese núcleo.
- REG15D1: dirección confirmada, resumen diario solo con nuevas viviendas y cancelación, sin promesa de disponibilidad.
- D06 se mantiene desactivada y D12 fuera del primer alcance: no hace falta decidir pausa para implementar lo ya delimitado.

## Preguntas humanas que deben resolverse

| ID | Tareas | Decisión o dato necesario | Estado |
|---|---|---|---|
| Q01 | SAP09 / AUT20, consumidor AGE11 | Revisión y envío final de presentación por empleado (D05) | Aprobada por Luis: revisión final y envío explícito por empleado |
| Q02 | PRE12 / REG16 / PRE09 | Acceso a datos personales/copia, separado de presentación | Aprobada: email, verificación y tramitación por equipo; portal aplazado |
| Q11 | SAP09 / AUT20, productor AGE11 | Fotos visibles en email, adjuntas o ambas | Aprobado: texto breve y fotos adjuntas para descargar |
| Q12 | SAP09 / SAP08 / AUT20, productores AGE11/AUT17 | Respuesta del cliente tras recibir fotos; no asumir botones/portal | Criterio del planificador por sencillez: responder al email y revisión humana, sin automatizar decisiones |
| Q03 | PRE12 | Copia revisada por equipo y campos divulgables | Cerrada: gestión manual, formato JSON técnico; campos/textos se introducirán por Hampton |
| Q04 | PRE12 | Responsable operativo de solicitudes, revisión de identidad y escalado; sin SLA jurídico inventado | Equipo aprobado; elegir un empleado de admins al abrir cada caso, sin pedir nombre ahora |
| Q05 | PRE12 | Conducta ante aviso previo fallido/suprimido/resultado incierto | Aprobada: detener borrado de ese contacto y crear tarea de revisión |
| Q06 | REG15 | Duración operativa de suscripción y renovación/inactividad | Aprobada: seis meses, un correo de renovación al final y detener si no renueva |
| Q07 | REG15 / PRE10 / REG16 | Política documentada de conservación tras baja y evidencia mínima, sin confundir hash con anonimato | Cerrada: plazos configurables con validación completa antes de activar |
| Q08 | PRE09 | Identidad visible vigente: Hampton Estates LTD | Cerrada por respuesta final; ver decisiones vigentes abajo |
| Q09 | BUS13 | Ámbito de Qualified/Registered: solo Lettings residencialJersey | Cerrada por respuesta final; ver decisiones vigentes abajo |
| Q10 | BUS13 / PRE09 / PRE10 / PRE12 / REG16 | Textos/parámetros profesionales disponibles y añadidos manualmente fuera de trámites del maestro | Cerrada: Luis confirma datos disponibles y entrada manual; fuera de trámites del maestro |

Cada respuesta puede resolver más de un ID. Instrucción posterior expresa de Luis: todas las preguntas restantes juntas, no una por una. Se actualiza el plan afectado con cada respuesta; no se obliga a Luis a elegir detalles de código, tamaños, índices o firmas que el constructor puede resolver. No se pedirán datos de clientes, credenciales, accesos o conversaciones privadas.

## Condiciones técnicas que no son preguntas para Luis

Dependencias de productores, migraciones, alcance build, permisos por recurso, CAS, idempotencia, rollback, snapshot, pruebas y revisión independiente se comprueban por el agente al construir. Un productor ausente sigue siendo una dependencia de integración, no una decisión de negocio. Las entregas REG05/07/08/11/17 se verifican por la guía existente; no requieren que el usuario recuerde qué SHA o migración publicó otro taller.

## Cierre esperado

Cada plan queda marcado como listo en su alcance técnico cuando sus decisiones están respondidas, las referencias externas están definidas y sus contratos/pruebas son concretos. La validación jurídica real, datos institucionales y habilitación de un canal no se presentan como aprobados por una respuesta genérica. Si falta evidencia externa, se distingue núcleo construible del tramo que debe esperar. No declarar toda la tarea lista cuando solo quedó definido un tramo.

## Respuesta Q01 · D05 aprobada

Luis respondió «si asi esta bien» a revisión final humana antes de enviar presentaciones. Un empleado revisa el contenido y pulsa Enviar cada vez, aunque match y disponibilidad ya estén aprobados/confirmados. No hay envío automático por satisfacer condiciones. Preparar, abrir, recalcular o aprobar contacto con anunciante no envían. AGE11 debe revalidar permisos/hechos/versiones al ejecutar la confirmación; una versión material distinta invalida la revisión y exige volver a revisar. Se registra actor, instante y versión de la presentación confirmada. La implementación permanece en AGE11; SAP09 la consume y AUT20 prueba el recorrido.

## Aclaración de presentación

Luis: «solamente le vamos a mandar fotos por correo directamente al cliente […] la presentación […] preparada y hecha por hermes». Se registra email directo con fotos, preparado por Hermes, sin portal para visualizar. Se mantiene el envío explícito del empleado de Q01; no se presupone autorización de datos privados al modelo. Q02 sobre datos personales no fue contestada con esta aclaración y no se marca aprobada ni cancelada. Primero cerrar formato Q11 y respuesta Q12.

## Respuesta Q11 y simplificación

Luis pide «archivo adjunto para descargar […] un texto […] y fotos de adjunto […] algo sencillo» y continuar para acabar la tanda. Se fija texto explicativo breve con fotos adjuntas, sin imágenes inline ni portal para presentación. La respuesta normal al propio email se adopta como decisión técnica/operativa del planificador acorde a sencillez, no se atribuye como frase expresa de Luis ni habilita acciones del modelo. Los parámetros de código y formatos internos se resuelven por el agente; no se preguntan por separado.

Siguiente decisión material: para PRE12, proponer solicitudes de copia/borrado atendidas por email y revisión del equipo, con portal de privacidad fuera de la primera entrega; todavía no aprobado por la elección de email para presentaciones.

## Q02 aprobada: privacidad por email y equipo

Luis responde «si» a solicitudes de copia/borrado por email, verificación de identidad y trámite manual del equipo; portal para más adelante. PRE12 reescrito para primera entrega sin cuentas, grants o rutas públicas de cliente. Recibir un email no acredita identidad ni borra; preserva fecha de recepción y expediente. Formato JSON y asignación a un empleado de admins por caso son decisiones del planificador para simplicidad, no nuevas afirmaciones del usuario. Campos divulgables/políticas externas siguen pendientes; no se pide más detalle técnico a Luis.

Q05 aprobada por Luis el8-nov: si el email de aviso previo a limpieza falla o queda incierto, se detiene el borrado de ese contacto y se crea tarea para revisión del equipo. No se mueve last_activity_at ni se cierra búsqueda; resolver la tarea no es un DELETE. El contrato y sus pruebas futuras se incorporan a PRE12. Sin implementación, envío o borrado en esta entrevista.

## Q06 aprobada y cambio de formato de entrevista

Luis responde «si» a seis meses de alertas, un correo de renovación al terminar y detención si no renueva. Añade instrucción expresa: «hazme todas las preguntas, no una por una». A partir de aquí se entregan juntas las preguntas que faltan; esto prevalece sobre el ritmo anterior.

## Cuestionario final agrupado

1. Conservación REG15/PRE10/REG16: plazos aprobados para email/criterios tras baja/no renovación y prueba mínima de consentimiento/baja. Si no existe política, proponer configuración finita obligatoria y activación pendiente de validación, sin inventar plazo legal.
2. REG16 alcance inicial: ofrecer valoraciones solo por email y únicamente con consentimiento específico registrado/revisado, dejando SMS/WhatsApp/llamada promocional fuera del primer alcance; propuesto para mantener sencillez, no aprobado todavía.
3. PRE09 datos institucionales: razón social completa, número JOIC, relación con marca Hampton Estates y confirmación de dirección/contacto institucional; solicitar solo información verificable y no asumir una empresa por nombre parecido.
4. BUS13 categorías: Hampton debe aportar Qualified/Registered para HE-R001/HE-R003/HE-R027 y restricciones conocidas/procedencia. Tenencia ya documentada no se vuelve a preguntar por inercia; validar dato real al integrar.
5. Paquete profesional PRE33/BUS13/PRE09/PRE10/PRE12/REG16: qué aprobaciones existen y sus referencias para reglas residenciales, aviso/copy por propósito/canal, procedimiento de identidad/copia/terceros y conservación de alquiler/venta/evidencias. Donde no exista, anotar pendiente abogado/Hampton; no pedir al usuario que improvise normas.

Se puede responder 1–5 y «pendiente Hampton» o «pendiente abogado» para datos que no estén disponibles. El agente resolverá detalles técnicos por criterio propio, y distinguirá desarrollo preparado de activación externa pendiente.

## Respuestas finales de Luis a las cinco preguntas agrupadas

1. Retención: configurable y validación obligatoria antes de activar. No fijar números por omisión.
2. Valoraciones: soloemail con consentimiento específico registrado/revisado.
3. Identidad que aparece: Hampton Estates LTD. El dato registral descartado no se exige ni se muestra como pendiente en el maestro.
4. Qualified/Registered: solo Lettings residencialJersey; compra/comercial/internacional no requieren ese dato en el producto. No se asigna una categoría concreta a las tres fichas por suposición; su dato se introduce cuando aplique, sin bloquear la construcción del formulario/evaluador.
5. Datos/textos profesionales: Luis confirma que ya los tiene y los añadirá manualmente. Obtenerlos o tramitar otra revisión no forma parte del plan maestro vigente.

Estado: entrevista cerrada, sin preguntas pendientes. [Plan maestro final](2026-11-08-lista1-build-ready.md) y diseños finales sustituyen las propuestas anteriores en esos puntos. La revisión final solo comprueba coherencia técnica y documental; no se envían correos ni se construye código en este encargo.
